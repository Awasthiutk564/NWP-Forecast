"""
train_models.py  -  P2's job: train LightGBM and LinearRegression on IMD obs.

These become two more forecast SOURCES for the blender to combine.

Run from the repo root:
    python -m sources.train_models

Reads:   data/imd_obs.nc
Writes:  data/lgbm_forecast.nc   data/linreg_forecast.nc
         models/lgbm_rain.txt    models/lgbm_tmax.txt  (saved LightGBM models)

The idea:
  - Given weather on day T (and a few days before), predict day T+1 .. T+5
  - Features: recent rain, recent tmax, day-of-year, lat, lon
  - One model per variable (rain, tmax), applied at every grid point
"""
import numpy as np
import pandas as pd
import xarray as xr
import lightgbm as lgb
from sklearn.linear_model import Ridge
from pathlib import Path
from sources.common import load, save, LAT, LON

LEADS = np.arange(1, 6)        # forecast lead days 1..5
LOOKBACK = 5                   # use last 5 days as features
TRAIN_END = "2022-12-31"       # train on data up to here
TEST_START = "2023-01-01"      # test on 2023 onwards

print("Loading IMD observations ...")
obs = load("imd_obs")[["rain", "tmax"]].load()

# ──────────────────────────────────────────────
#  Build features for every (time, lat, lon)
# ──────────────────────────────────────────────
def make_features(obs_ds):
    """
    For each day T, create features from the last LOOKBACK days.
    Returns a DataFrame with columns:
        rain_lag1 .. rain_lag5, tmax_lag1 .. tmax_lag5,
        doy_sin, doy_cos, lat, lon
    And target columns for each lead:
        rain_lead1 .. rain_lead5, tmax_lead1 .. tmax_lead5
    """
    times = obs_ds.time.values
    n_time = len(times)
    rain = obs_ds["rain"].values    # (time, lat, lon)
    tmax = obs_ds["tmax"].values

    rows = []
    max_offset = max(LOOKBACK, int(LEADS.max()))

    # Sample a subset of grid points to keep training fast
    # Use every 2nd point (still ~500 points, plenty for training)
    lat_idx = np.arange(0, len(LAT), 2)
    lon_idx = np.arange(0, len(LON), 2)

    print(f"  Building features: {n_time - max_offset} days x {len(lat_idx)*len(lon_idx)} points ...")

    for t in range(LOOKBACK, n_time - int(LEADS.max())):
        doy = pd.Timestamp(times[t]).dayofyear
        doy_sin = np.sin(2 * np.pi * doy / 365)
        doy_cos = np.cos(2 * np.pi * doy / 365)

        for i in lat_idx:
            for j in lon_idx:
                row = {}
                # Lag features
                for lag in range(1, LOOKBACK + 1):
                    r = rain[t - lag, i, j]
                    tx = tmax[t - lag, i, j]
                    if np.isnan(r) or np.isnan(tx):
                        break
                    row[f"rain_lag{lag}"] = r
                    row[f"tmax_lag{lag}"] = tx
                else:
                    # Only add row if all lags are valid
                    row["doy_sin"] = doy_sin
                    row["doy_cos"] = doy_cos
                    row["lat"] = LAT[i]
                    row["lon"] = LON[j]
                    row["_t"] = t
                    row["_i"] = i
                    row["_j"] = j

                    # Targets for each lead
                    for L in LEADS:
                        row[f"rain_lead{L}"] = rain[t + L, i, j]
                        row[f"tmax_lead{L}"] = tmax[t + L, i, j]

                    rows.append(row)

    df = pd.DataFrame(rows)
    print(f"  Built {len(df)} training samples")
    return df


print("Building features ...")
df = make_features(obs)

# Drop rows with NaN targets
target_cols = [f"rain_lead{L}" for L in LEADS] + [f"tmax_lead{L}" for L in LEADS]
df = df.dropna(subset=target_cols)

feature_cols = [c for c in df.columns if c.startswith(("rain_lag", "tmax_lag", "doy", "lat", "lon"))]

# Split train / test by time index
time_vals = obs.time.values
train_cutoff = np.datetime64(TRAIN_END)
train_mask = time_vals[df["_t"].values.astype(int)] <= train_cutoff
df_train = df[train_mask]
df_test = df[~train_mask]

print(f"  Train: {len(df_train)}  Test: {len(df_test)}")

X_train = df_train[feature_cols].values
X_test = df_test[feature_cols].values

# ──────────────────────────────────────────────
#  Train models
# ──────────────────────────────────────────────
Path("models").mkdir(exist_ok=True)

lgbm_models = {}
linreg_models = {}

for var in ["rain", "tmax"]:
    for L in LEADS:
        col = f"{var}_lead{L}"
        y_train = df_train[col].values
        y_test = df_test[col].values

        # --- LightGBM ---
        dtrain = lgb.Dataset(X_train, label=y_train)
        params = {
            "objective": "regression",
            "metric": "rmse",
            "learning_rate": 0.05,
            "num_leaves": 31,
            "min_child_samples": 50,
            "verbose": -1,
        }
        model = lgb.train(params, dtrain, num_boost_round=200)
        pred = model.predict(X_test)
        rmse = np.sqrt(np.nanmean((pred - y_test) ** 2))
        print(f"  LightGBM  {col}  test RMSE: {rmse:.3f}")

        key = f"{var}_lead{L}"
        lgbm_models[key] = model
        model.save_model(f"models/lgbm_{key}.txt")

        # --- Linear Regression (Ridge) ---
        ridge = Ridge(alpha=1.0)
        ridge.fit(X_train, y_train)
        pred_lr = ridge.predict(X_test)
        rmse_lr = np.sqrt(np.nanmean((pred_lr - y_test) ** 2))
        print(f"  LinReg    {col}  test RMSE: {rmse_lr:.3f}")
        linreg_models[key] = ridge

# ──────────────────────────────────────────────
#  Generate full-grid forecasts in contract format
# ──────────────────────────────────────────────
print("Generating full-grid forecasts ...")

rain_obs = obs["rain"].values
tmax_obs = obs["tmax"].values
n_time = obs.sizes["time"]

n_init = n_time - LOOKBACK - int(LEADS.max())
init_times = obs.time.values[LOOKBACK:LOOKBACK + n_init]

lgbm_rain = np.full((n_init, len(LEADS), len(LAT), len(LON)), np.nan, dtype="float32")
lgbm_tmax = np.full_like(lgbm_rain, np.nan)
lr_rain = np.full_like(lgbm_rain, np.nan)
lr_tmax = np.full_like(lgbm_rain, np.nan)

for idx in range(n_init):
    t = LOOKBACK + idx
    doy = pd.Timestamp(obs.time.values[t]).dayofyear
    doy_sin = np.sin(2 * np.pi * doy / 365)
    doy_cos = np.cos(2 * np.pi * doy / 365)

    for i in range(len(LAT)):
        for j in range(len(LON)):
            feats = []
            valid = True
            for lag in range(1, LOOKBACK + 1):
                r = rain_obs[t - lag, i, j]
                tx = tmax_obs[t - lag, i, j]
                if np.isnan(r) or np.isnan(tx):
                    valid = False
                    break
                feats.extend([r, tx])
            if not valid:
                continue
            feats.extend([doy_sin, doy_cos, LAT[i], LON[j]])
            X = np.array(feats).reshape(1, -1)

            for li, L in enumerate(LEADS):
                lgbm_rain[idx, li, i, j] = max(0, lgbm_models[f"rain_lead{L}"].predict(X)[0])
                lgbm_tmax[idx, li, i, j] = lgbm_models[f"tmax_lead{L}"].predict(X)[0]
                lr_rain[idx, li, i, j] = max(0, linreg_models[f"rain_lead{L}"].predict(X)[0])
                lr_tmax[idx, li, i, j] = linreg_models[f"tmax_lead{L}"].predict(X)[0]

    if (idx + 1) % 100 == 0:
        print(f"  {idx + 1}/{n_init} init times done ...")

# Save in contract format
for name, r, t in [("lgbm_forecast", lgbm_rain, lgbm_tmax),
                    ("linreg_forecast", lr_rain, lr_tmax)]:
    ds = xr.Dataset(
        {
            "rain": (("init_time", "lead", "lat", "lon"), r, {"units": "mm/day"}),
            "tmax": (("init_time", "lead", "lat", "lon"), t, {"units": "degC"}),
        },
        coords={"init_time": init_times, "lead": LEADS, "lat": LAT, "lon": LON},
        attrs={"source": f"{name} trained on IMD obs"},
    )
    ds["lead"].attrs["units"] = "days"
    save(ds, name, kind="forecast")

print("Done! Teammates: load('lgbm_forecast') and load('linreg_forecast')")
