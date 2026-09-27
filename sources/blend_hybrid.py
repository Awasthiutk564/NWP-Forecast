"""
blend_hybrid.py  -  the FULL Hybrid AI-NWP blend: adds the real NCMRWF S2S
physical NWP forecast as a 5th source, alongside the 4 AI/statistical sources.

Same method as blend.py (weight = 1 / MSE^2, per grid point x lead day), but
run on the years where S2S exists (2010-2015), with its own honest split:
  - AI models (lgbm_forecast_hy, linreg_forecast_hy) trained on 2016-2023
  - climatology_hy built from 2016-2023
  - persistence needs no training - same file as the main run
  - S2S NWP forecast (s2s_forecast) needs no training - it is NCMRWF's own model
  - blend weights learned on 2010-2012
  - tested on 2013-2015 (a period NONE of the 5 sources has seen)

This keeps the original AI-only system (data/blend_forecast.nc, tested on
2023) completely untouched - this is a second, additional system.

Run from the repo root (after fetch_s2s, s2s_mos, train_models_hybrid,
baselines_hybrid have all been run):
    python -m sources.blend_hybrid

Writes:  data/blend_forecast_hybrid.nc   data/blend_weights_hybrid.nc
         data/blend_scores_hybrid.csv
"""
import warnings
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import load, save, DATA_DIR, LAT, LON

warnings.filterwarnings("ignore", category=RuntimeWarning)

SOURCES = ["persistence", "climatology_hy", "lgbm_forecast_hy", "linreg_forecast_hy", "s2s_forecast"]
NAMES = ["persistence", "climatology", "lgbm", "linreg", "s2s_nwp"]
VARS = ["rain", "tmax"]
WEIGHT_START = np.datetime64("2010-01-01")
WEIGHT_END = np.datetime64("2012-12-31")     # weights learned on 2010-2012
TEST_START = np.datetime64("2013-01-01")     # tested on 2013-2015
EPS = 1e-6
POWER = 2

print("Loading sources ...")
fcs = [load(s)[VARS].load() for s in SOURCES]
fcs = list(xr.align(*fcs, join="inner"))         # keep only init times all 5 sources share
init = fcs[0].init_time.values
leads = fcs[0].lead.values
obs = load("imd_obs")[VARS].load()
print(f"  {len(SOURCES)} sources: {', '.join(NAMES)}")
print(f"  {len(init)} common init days, leads {list(leads)}")
if len(init) == 0:
    raise SystemExit("No overlapping init dates across all 5 sources - check the S2S date range "
                     "(S2S only has the 1st of each month; persistence/climatology/lgbm are daily).")

max_lead = np.timedelta64(int(leads.max()), "D")
train = (init >= WEIGHT_START) & (init + max_lead <= WEIGHT_END)
test = init >= TEST_START
print(f"  weights learned on {train.sum()} days (2010-2012), tested on {test.sum()} days (2013-2015)")
if train.sum() == 0 or test.sum() == 0:
    raise SystemExit("No days in the train or test window - S2S init dates may not reach that far.")


def obs_at_valid(var):
    out = np.empty((len(init), len(leads), len(LAT), len(LON)), dtype="float32")
    for li, L in enumerate(leads):
        valid = init + np.timedelta64(int(L), "D")
        out[:, li] = obs[var].reindex(time=valid).values
    return out


def rmse_per_lead(pred, truth, mask):
    err2 = np.where(mask, (pred - truth) ** 2, np.nan)[test]
    return np.sqrt(np.nanmean(err2, axis=(0, 2, 3)))


blend_out, weight_out, score_rows = {}, {}, []

for var in VARS:
    print(f"Blending {var} ...")
    y = obs_at_valid(var)
    F = np.stack([f[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
                  for f in fcs])

    mse = np.stack([np.nanmean((F[s][train] - y[train]) ** 2, axis=0)
                    for s in range(len(SOURCES))])
    w = 1.0 / (mse + EPS) ** POWER
    w = np.where(np.isnan(w), 0.0, w)
    tot = w.sum(axis=0, keepdims=True)
    w = np.divide(w, tot, out=np.full_like(w, np.nan), where=tot > 0).astype("float32")

    wb = np.nan_to_num(w)[:, None]
    has = ~np.isnan(F)
    num = np.sum(np.where(has, F, 0.0) * wb, axis=0)
    den = np.sum(has * wb, axis=0)
    blend = np.divide(num, den, out=np.full(num.shape, np.nan, dtype="float32"),
                      where=den > 0).astype("float32")
    if var == "rain":
        blend = np.clip(blend, 0, None)

    blend_out[var], weight_out[var] = blend, w

    common = has.all(axis=0) & ~np.isnan(y) & ~np.isnan(blend)
    for name, pred in list(zip(NAMES, F)) + [("BLEND", blend)]:
        for L, r in zip(leads, rmse_per_lead(pred, y, common)):
            score_rows.append({"var": var, "lead": int(L), "source": name, "rmse": float(r)})

    avg = np.nanmean(w, axis=(2, 3))
    for s, name in enumerate(NAMES):
        print(f"  mean weight {name:12s}: " + "  ".join(f"L{L}={a:.2f}" for L, a in zip(leads, avg[s])))

ds = xr.Dataset(
    {v: (("init_time", "lead", "lat", "lon"), blend_out[v],
         {"units": "mm/day" if v == "rain" else "degC"}) for v in VARS},
    coords={"init_time": init, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": "Hybrid AI-NWP blend of " + ", ".join(NAMES) +
                     " (weights from 2010-2012, tested 2013-2015)"},
)
ds["lead"].attrs["units"] = "days"
save(ds, "blend_forecast_hybrid", kind="forecast")

wds = xr.Dataset(
    {v: (("source", "lead", "lat", "lon"), weight_out[v]) for v in VARS},
    coords={"source": NAMES, "lead": leads, "lat": LAT, "lon": LON},
)
wpath = DATA_DIR / "blend_weights_hybrid.nc"
wds.to_netcdf(wpath)
print(f"Saved {wpath}")

scores = pd.DataFrame(score_rows)
scores.to_csv(DATA_DIR / "blend_scores_hybrid.csv", index=False)

print("\nTest RMSE on 2013-2015 (lower is better):")
for var in VARS:
    table = scores[scores["var"] == var].pivot(index="source", columns="lead", values="rmse")
    print(f"\n{var}:")
    print(table.round(3).to_string())

print("\nDone! load('blend_forecast_hybrid'), load('blend_weights_hybrid'), "
     "data/blend_scores_hybrid.csv")
