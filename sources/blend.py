"""
blend.py  -  P2: combines all forecast sources into one better forecast.

Method (easy to explain to judges):
  For every grid point, every lead day and every variable, look at how wrong
  each source was during 2020-2022. Give each source a weight = 1 / (its error squared),
  so better sources get more say. Apply those weights to forecast 2023.

Run from the repo root:
    python -m sources.blend

Reads:   persistence, climatology, lgbm_forecast, linreg_forecast, imd_obs
Writes:  data/blend_forecast.nc   (contract format, the final forecast)
         data/blend_weights.nc    (source, lead, lat, lon)  -> P4 weight maps
         data/blend_scores.csv    (test RMSE per source and lead) -> P3 / P4
"""
import warnings
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import load, save, DATA_DIR, LAT, LON

warnings.filterwarnings("ignore", category=RuntimeWarning)   # all-NaN sea points

SOURCES = ["persistence", "climatology", "lgbm_forecast", "linreg_forecast"]
NAMES = ["persistence", "climatology", "lgbm", "linreg"]
VARS = ["rain", "tmax"]
TRAIN_END = np.datetime64("2022-12-31")
EPS = 1e-6
POWER = 2          # weight = 1 / MSE**POWER ; 2 = trust the best source more strongly

# ---------- 1. Load everything on common init times ----------
print("Loading sources ...")
fcs = [load(s)[VARS].load() for s in SOURCES]
fcs = list(xr.align(*fcs, join="inner"))        # keep only shared init_time / lead
init = fcs[0].init_time.values
leads = fcs[0].lead.values
obs = load("imd_obs")[VARS].load()
print(f"  {len(SOURCES)} sources, {len(init)} common init days, leads {list(leads)}")

max_lead = np.timedelta64(int(leads.max()), "D")
train = init + max_lead <= TRAIN_END            # whole forecast window inside training years
test = init > TRAIN_END
print(f"  weights learned on {train.sum()} days, tested on {test.sum()} days (2023)")


def obs_at_valid(var):
    """Observed value at the date each forecast is FOR: shape (init, lead, lat, lon)."""
    out = np.empty((len(init), len(leads), len(LAT), len(LON)), dtype="float32")
    for li, L in enumerate(leads):
        valid = init + np.timedelta64(int(L), "D")
        out[:, li] = obs[var].reindex(time=valid).values
    return out


def rmse_per_lead(pred, truth, mask):
    """RMSE for each lead over test days and grid points where everything is valid."""
    err2 = np.where(mask, (pred - truth) ** 2, np.nan)[test]
    return np.sqrt(np.nanmean(err2, axis=(0, 2, 3)))


blend_out, weight_out, score_rows = {}, {}, []

for var in VARS:
    print(f"Blending {var} ...")
    y = obs_at_valid(var)
    F = np.stack([f[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
                  for f in fcs])                                       # (S, init, lead, lat, lon)

    # ---------- 2. Weights = 1 / training MSE ----------
    mse = np.stack([np.nanmean((F[s][train] - y[train]) ** 2, axis=0)
                    for s in range(len(SOURCES))])                     # (S, lead, lat, lon)
    w = 1.0 / (mse + EPS) ** POWER
    w = np.where(np.isnan(w), 0.0, w)
    tot = w.sum(axis=0, keepdims=True)
    w = np.divide(w, tot, out=np.full_like(w, np.nan), where=tot > 0).astype("float32")

    # ---------- 3. Weighted average (skips a source where it has no value) ----------
    wb = np.nan_to_num(w)[:, None]                                      # (S, 1, lead, lat, lon)
    has = ~np.isnan(F)
    num = np.sum(np.where(has, F, 0.0) * wb, axis=0)
    den = np.sum(has * wb, axis=0)
    blend = np.divide(num, den, out=np.full(num.shape, np.nan, dtype="float32"),
                      where=den > 0).astype("float32")
    if var == "rain":
        blend = np.clip(blend, 0, None)

    blend_out[var], weight_out[var] = blend, w

    # ---------- 4. Score everything on 2023, same points for all ----------
    common = has.all(axis=0) & ~np.isnan(y) & ~np.isnan(blend)
    for name, pred in list(zip(NAMES, F)) + [("BLEND", blend)]:
        for L, r in zip(leads, rmse_per_lead(pred, y, common)):
            score_rows.append({"var": var, "lead": int(L), "source": name, "rmse": float(r)})

    # average weight each source gets, per lead (quick sanity check)
    avg = np.nanmean(w, axis=(2, 3))
    for s, name in enumerate(NAMES):
        print(f"  mean weight {name:12s}: " + "  ".join(f"L{L}={a:.2f}" for L, a in zip(leads, avg[s])))

# ---------- 5. Save ----------
ds = xr.Dataset(
    {v: (("init_time", "lead", "lat", "lon"), blend_out[v],
         {"units": "mm/day" if v == "rain" else "degC"}) for v in VARS},
    coords={"init_time": init, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": "Inverse-MSE blend of " + ", ".join(NAMES) + " (weights from 2020-2022)"},
)
ds["lead"].attrs["units"] = "days"
save(ds, "blend_forecast", kind="forecast")

wds = xr.Dataset(
    {v: (("source", "lead", "lat", "lon"), weight_out[v]) for v in VARS},
    coords={"source": NAMES, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"description": "Blend weight of each source (sums to 1 over sources)"},
)
wpath = DATA_DIR / "blend_weights.nc"
wds.to_netcdf(wpath)
print(f"Saved {wpath}")

scores = pd.DataFrame(score_rows)
scores.to_csv(DATA_DIR / "blend_scores.csv", index=False)

print("\nTest RMSE on 2023 (lower is better):")
for var in VARS:
    table = scores[scores["var"] == var].pivot(index="source", columns="lead", values="rmse")
    print(f"\n{var}:")
    print(table.round(3).to_string())

print("\nDone! load('blend_forecast'), load('blend_weights'), data/blend_scores.csv")
