"""
train_models_hybrid.py  -  P2/P1: LightGBM + Ridge, trained ONLY on 2016-2023.

Why a separate script: the main train_models.py is trained on 2010-2021, which
overlaps the S2S NWP years (2010-2015). To test the hybrid (AI + NWP) blend
fairly on 2013-2015, the AI models must never have seen 2010-2015 at all.
This script is identical in method to train_models.py, just a different
(later, non-overlapping) training window.

Run from the repo root:
    python -m sources.train_models_hybrid

Reads:   data/imd_obs.nc
Writes:  data/lgbm_forecast_hy.nc   data/linreg_forecast_hy.nc
         models/lgbm_hy_<var>_lead<L>.txt
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
TRAIN_START = np.datetime64("2016-01-01")   # 2010-2015 must stay completely unseen (S2S years)
VARS = ["rain", "tmax"]

print("Loading IMD observations ...")
obs = load("imd_obs")[VARS].load()
rain = obs["rain"].values.astype("float32")
tmax = obs["tmax"].values.astype("float32")
times = obs.time.values
T, NLAT, NLON = rain.shape

init_idx = np.arange(LOOKBACK, T - LEADS.max())
n_init = len(init_idx)
init_times = times[init_idx]


def build_features():
    feats = []
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
    return var_arr[init_idx + L]


print("Building features ...")
F = build_features()
n_feat = F.shape[-1]
X_all = F.reshape(-1, n_feat)
valid = ~np.isnan(X_all).any(axis=1)

is_train_day = init_times >= TRAIN_START               # train on 2016-2023 only
train_rows = np.broadcast_to(is_train_day[:, None, None], (n_init, NLAT, NLON)).reshape(-1)

sub = np.zeros((NLAT, NLON), dtype=bool)
sub[::2, ::2] = True
sub_rows = np.broadcast_to(sub[None], (n_init, NLAT, NLON)).reshape(-1)

print(f"  {valid.sum():,} valid samples, {n_feat} features "
      f"(training window: 2016-01-01 onwards, so 2010-2015 stays unseen)")

Path("models").mkdir(exist_ok=True)
out = {m: {v: np.full((n_init, len(LEADS), NLAT, NLON), np.nan, dtype="float32")
           for v in VARS} for m in ["lgbm", "linreg"]}

params = {"objective": "regression", "learning_rate": 0.05, "num_leaves": 31,
          "min_child_samples": 50, "verbose": -1}

print("Training (this is a smaller window than the main models, so it's quicker) ...")
for var, arr in [("rain", rain), ("tmax", tmax)]:
    for li, L in enumerate(LEADS):
        y_all = target(arr, L).reshape(-1)
        ok = valid & ~np.isnan(y_all)
        tr = ok & train_rows & sub_rows
        # "test" here is anything NOT in the 2016-2023 training window (i.e. 2010-2015)
        te = ok & ~train_rows

        lg = lgb.train(params, lgb.Dataset(X_all[tr], label=y_all[tr]), num_boost_round=200)
        rd = Ridge(alpha=1.0).fit(X_all[tr], y_all[tr])
        lg.save_model(f"models/lgbm_hy_{var}_lead{L}.txt")

        if te.sum() > 0:
            p_lg = lg.predict(X_all[te]); p_rd = rd.predict(X_all[te])
            rmse = lambda p: np.sqrt(np.mean((p - y_all[te]) ** 2))
            print(f"  {var} lead{L}:  LightGBM RMSE {rmse(p_lg):6.2f}   Ridge RMSE {rmse(p_rd):6.2f}  "
                  f"(on 2010-2015, informational only - not the real test set)")

        for name, model in [("lgbm", lg), ("linreg", rd)]:
            pred = np.full(X_all.shape[0], np.nan, dtype="float32")
            pred[valid] = model.predict(X_all[valid])
            if var == "rain":
                pred = np.clip(pred, 0, None)
            out[name][var][:, li] = pred.reshape(n_init, NLAT, NLON)

print("Saving forecasts (full time range - blend_hybrid.py will select 2010-2015 from this) ...")
for name in ["lgbm", "linreg"]:
    ds = xr.Dataset(
        {v: (("init_time", "lead", "lat", "lon"), out[name][v],
             {"units": "mm/day" if v == "rain" else "degC"}) for v in VARS},
        coords={"init_time": init_times, "lead": LEADS, "lat": LAT, "lon": LON},
        attrs={"source": f"{name} (hybrid run) trained on IMD obs 2016-2023 only"},
    )
    ds["lead"].attrs["units"] = "days"
    save(ds, f"{name}_forecast_hy", kind="forecast")

print("Done! load('lgbm_forecast_hy') and load('linreg_forecast_hy')")
