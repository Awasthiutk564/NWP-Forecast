"""
train_models.py  -  P2: train LightGBM and Ridge regression on IMD obs.

These become two more forecast SOURCES for the blender.

Run from the repo root:
    python -m sources.train_models

Reads:   data/imd_obs.nc
Writes:  data/lgbm_forecast.nc   data/linreg_forecast.nc
         models/lgbm_<var>_lead<L>.txt

Idea: from the last 5 days of weather at a grid point, predict days T+1..T+5.
Features: rain & tmax for the last 5 days, day-of-year (sin/cos), lat, lon.
Train on 2010-2021 (targets end 31 Dec 2021). 2022 is kept unseen so the blender can learn honest weights; 2023 is the final test.
"""
from pathlib import Path
import numpy as np
import pandas as pd
import xarray as xr
import lightgbm as lgb
from sklearn.linear_model import Ridge
from sources.common import load, save, LAT, LON

LEADS = np.arange(1, 6)
LOOKBACK = 5
TRAIN_END = np.datetime64("2021-12-26")   # last init; its day-5 target is 31 Dec 2021, so no 2022 data is used
VARS = ["rain", "tmax"]

print("Loading IMD observations ...")
obs = load("imd_obs")[VARS].load()
rain = obs["rain"].values.astype("float32")          # (time, lat, lon)
tmax = obs["tmax"].values.astype("float32")
times = obs.time.values
T, NLAT, NLON = rain.shape

# Init days that have LOOKBACK days of history and 5 days of future
init_idx = np.arange(LOOKBACK, T - LEADS.max())
n_init = len(init_idx)
init_times = times[init_idx]


def build_features():
    """Feature array F with shape (n_init, NLAT, NLON, n_features). All vectorised."""
    feats = []
    # lag 0 = the init day itself (today's observation is known at forecast time)
    for lag in range(0, LOOKBACK):
        feats.append(rain[init_idx - lag])
        feats.append(tmax[init_idx - lag])
    doy = pd.DatetimeIndex(init_times).dayofyear.values
    shape = (n_init, NLAT, NLON)
    feats.append(np.broadcast_to(np.sin(2 * np.pi * doy / 365)[:, None, None], shape))
    feats.append(np.broadcast_to(np.cos(2 * np.pi * doy / 365)[:, None, None], shape))
    feats.append(np.broadcast_to(LAT[None, :, None], shape))
    feats.append(np.broadcast_to(LON[None, None, :], shape))
    return np.stack(feats, axis=-1).astype("float32")


def target(var_arr, L):
    return var_arr[init_idx + L]                      # (n_init, NLAT, NLON)


print("Building features ...")
F = build_features()
n_feat = F.shape[-1]
X_all = F.reshape(-1, n_feat)
valid = ~np.isnan(X_all).any(axis=1)                  # drop sea / missing points

is_train_day = init_times <= TRAIN_END
train_rows = np.broadcast_to(is_train_day[:, None, None], (n_init, NLAT, NLON)).reshape(-1)

# Use every 2nd grid point for training to keep it quick
sub = np.zeros((NLAT, NLON), dtype=bool)
sub[::2, ::2] = True
sub_rows = np.broadcast_to(sub[None], (n_init, NLAT, NLON)).reshape(-1)

print(f"  {valid.sum():,} valid samples, {n_feat} features")

Path("models").mkdir(exist_ok=True)
out = {m: {v: np.full((n_init, len(LEADS), NLAT, NLON), np.nan, dtype="float32")
           for v in VARS} for m in ["lgbm", "linreg"]}

params = {"objective": "regression", "learning_rate": 0.05, "num_leaves": 31,
          "min_child_samples": 50, "verbose": -1}

print("Training ...")
for var, arr in [("rain", rain), ("tmax", tmax)]:
    for li, L in enumerate(LEADS):
        y_all = target(arr, L).reshape(-1)
        ok = valid & ~np.isnan(y_all)
        tr = ok & train_rows & sub_rows
        te = ok & ~train_rows

        lg = lgb.train(params, lgb.Dataset(X_all[tr], label=y_all[tr]), num_boost_round=200)
        rd = Ridge(alpha=1.0).fit(X_all[tr], y_all[tr])
        lg.save_model(f"models/lgbm_{var}_lead{L}.txt")

        p_lg = lg.predict(X_all[te]); p_rd = rd.predict(X_all[te])
        rmse = lambda p: np.sqrt(np.mean((p - y_all[te]) ** 2))
        print(f"  {var} lead{L}:  LightGBM RMSE {rmse(p_lg):6.2f}   Ridge RMSE {rmse(p_rd):6.2f}")

        # Predict every valid grid point in one call
        for name, model in [("lgbm", lg), ("linreg", rd)]:
            pred = np.full(X_all.shape[0], np.nan, dtype="float32")
            pred[valid] = model.predict(X_all[valid])
            if var == "rain":
                pred = np.clip(pred, 0, None)
            out[name][var][:, li] = pred.reshape(n_init, NLAT, NLON)

print("Saving forecasts ...")
for name in ["lgbm", "linreg"]:
    ds = xr.Dataset(
        {v: (("init_time", "lead", "lat", "lon"), out[name][v],
             {"units": "mm/day" if v == "rain" else "degC"}) for v in VARS},
        coords={"init_time": init_times, "lead": LEADS, "lat": LAT, "lon": LON},
        attrs={"source": f"{name} trained on IMD obs 2010-2021"},
    )
    ds["lead"].attrs["units"] = "days"
    save(ds, f"{name}_forecast", kind="forecast")

print("Done! Teammates: load('lgbm_forecast') and load('linreg_forecast')")
