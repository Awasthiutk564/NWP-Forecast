"""
blend_regime.py  -  the last piece of adaptive weighting: WEATHER REGIME.

The problem statement asks for weights that adapt by "region, season and
weather regime". blend.py does region and lead time, blend_season.py adds
season. This adds regime: the system learns different weights for different
weather SITUATIONS, not different calendar dates.

Regime is decided from what is already happening on the day the forecast is
made (information a real forecaster has at issue time - no peeking ahead):
    WET    area-average rain on the init day >= WET_MM
    DRY    otherwise
This separates "a monsoon system is active right now" from "quiet conditions",
which is a different question from "what month is it".

Same honest split as blend.py: weights learned on 2022, tested on 2023.
Runs alongside blend.py and blend_season.py - nothing is overwritten.

Run from the repo root:
    python -m sources.blend_regime

Writes:  data/blend_forecast_regime.nc
         data/blend_weights_regime.nc   (regime, source, lead, lat, lon)
         data/blend_scores_regime.csv
"""
import warnings
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import load, save, DATA_DIR, LAT, LON

warnings.filterwarnings("ignore", category=RuntimeWarning)

SOURCES = ["persistence", "climatology", "lgbm_forecast", "linreg_forecast"]
NAMES = ["persistence", "climatology", "lgbm", "linreg"]
VARS = ["rain", "tmax"]
WEIGHT_START = np.datetime64("2022-01-01")
TRAIN_END = np.datetime64("2022-12-31")
EPS = 1e-6
POWER = 2
WET_MM = 5.0          # area-average rain (mm/day) on the init day that counts as "wet"
MIN_DAYS = 10
REGIMES = ["wet", "dry"]

print("Loading sources ...")
fcs = [load(s)[VARS].load() for s in SOURCES]
fcs = list(xr.align(*fcs, join="inner"))
init = fcs[0].init_time.values
leads = fcs[0].lead.values
obs = load("imd_obs")[VARS].load()

# ---------- classify each init day by the weather happening THAT day ----------
rain_on_init = obs["rain"].reindex(time=init).mean(("lat", "lon"), skipna=True).values
regime_of_init = np.where(rain_on_init >= WET_MM, "wet", "dry")

max_lead = np.timedelta64(int(leads.max()), "D")
train = (init >= WEIGHT_START) & (init + max_lead <= TRAIN_END)
test = init > TRAIN_END

print(f"  {len(SOURCES)} sources, {len(init)} init days")
print(f"  regime rule: area-average rain on the init day >= {WET_MM} mm/day = WET")
print(f"  weights learned on {train.sum()} days (2022), tested on {test.sum()} days (2023)")
for r in REGIMES:
    print(f"    {r:3s}: {int((train & (regime_of_init == r)).sum()):3d} training days, "
          f"{int((test & (regime_of_init == r)).sum()):3d} test days")


def obs_at_valid(var):
    out = np.empty((len(init), len(leads), len(LAT), len(LON)), dtype="float32")
    for li, L in enumerate(leads):
        out[:, li] = obs[var].reindex(time=init + np.timedelta64(int(L), "D")).values
    return out


def weights_from(mask, F, y):
    mse = np.stack([np.nanmean((F[s][mask] - y[mask]) ** 2, axis=0) for s in range(len(SOURCES))])
    w = 1.0 / (mse + EPS) ** POWER
    w = np.where(np.isnan(w), 0.0, w)
    tot = w.sum(axis=0, keepdims=True)
    return np.divide(w, tot, out=np.full_like(w, np.nan), where=tot > 0).astype("float32")


def apply_weights(F, w, days):
    wb = np.nan_to_num(w)[:, None]
    sub = F[:, days]
    has = ~np.isnan(sub)
    num = np.sum(np.where(has, sub, 0.0) * wb, axis=0)
    den = np.sum(has * wb, axis=0)
    return np.divide(num, den, out=np.full(num.shape, np.nan, dtype="float32"), where=den > 0)


blend_out, weight_out, score_rows = {}, {}, []

for var in VARS:
    print(f"\nBlending {var} by regime ...")
    y = obs_at_valid(var)
    F = np.stack([f[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
                  for f in fcs])

    all_w = weights_from(train, F, y)
    blend = np.full(F.shape[1:], np.nan, dtype="float32")
    w_by_regime = {}

    for r in REGIMES:
        tr_r = train & (regime_of_init == r)
        if tr_r.sum() < MIN_DAYS:
            w_r = all_w
            print(f"  {r:3s}: only {int(tr_r.sum())} training days - using all-regime weights")
        else:
            w_r = weights_from(tr_r, F, y)
        w_by_regime[r] = w_r
        days = regime_of_init == r
        if days.sum():
            blend[days] = apply_weights(F, w_r, days)

    if var == "rain":
        blend = np.clip(blend, 0, None)
    blend_out[var] = blend
    weight_out[var] = np.stack([w_by_regime[r] for r in REGIMES])

    for r in REGIMES:
        avg = np.nanmean(w_by_regime[r], axis=(2, 3))[:, 0]
        print(f"  {r:3s} lead-1 weights: " +
              "  ".join(f"{n}={a:.2f}" for n, a in zip(NAMES, avg)))

# ---------- score overall AND per regime, against the all-regime blend ----------
regime_rows = []
try:
    allreg = load("blend_forecast")[VARS].load().reindex(init_time=init)
    print("\n" + "=" * 70)
    print("Regime-aware vs standard blend (2023 test days, RMSE, lower is better)")
    print("=" * 70)

    for var in VARS:
        y = obs_at_valid(var)
        F = np.stack([f[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
                      for f in fcs])
        ar = allreg[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
        rg = blend_out[var]
        common = (~np.isnan(F)).all(axis=0) & ~np.isnan(y) & ~np.isnan(rg) & ~np.isnan(ar)

        def rmse(pred, days):
            err2 = np.where(common, (pred - y) ** 2, np.nan)[days]
            return np.sqrt(np.nanmean(err2, axis=(0, 2, 3)))

        print(f"\n--- {var} ---")
        for label, days in ([("ALL DAYS", test)] +
                            [(r.upper(), test & (regime_of_init == r)) for r in REGIMES]):
            if days.sum() == 0:
                continue
            r_rg, r_ar = rmse(rg, days), rmse(ar, days)
            gain = 100 * (r_ar - r_rg) / r_ar
            print(f"  {label:9s} ({int(days.sum()):3d} days)  "
                  f"regime {np.nanmean(r_rg):6.3f}   standard {np.nanmean(r_ar):6.3f}   "
                  f"{np.nanmean(gain):+5.1f}% {'better' if np.nanmean(gain) > 0 else 'worse'}")
            for L, a, b, g in zip(leads, r_rg, r_ar, gain):
                regime_rows.append({"var": var, "regime": label.lower(), "lead": int(L),
                                    "rmse_regime_aware": float(a), "rmse_standard": float(b),
                                    "pct_better": float(g)})
    pd.DataFrame(regime_rows).to_csv(DATA_DIR / "blend_scores_regime.csv", index=False)
except FileNotFoundError:
    print("\n(run `python -m sources.blend` first to compare)")

# ---------- save ----------
ds = xr.Dataset(
    {v: (("init_time", "lead", "lat", "lon"), blend_out[v],
         {"units": "mm/day" if v == "rain" else "degC"}) for v in VARS},
    coords={"init_time": init, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": f"Regime-aware blend (wet if init-day area rain >= {WET_MM} mm/day), "
                     "weights from 2022"},
)
ds["lead"].attrs["units"] = "days"
save(ds, "blend_forecast_regime", kind="forecast")

wds = xr.Dataset(
    {v: (("regime", "source", "lead", "lat", "lon"), weight_out[v]) for v in VARS},
    coords={"regime": REGIMES, "source": NAMES, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"description": "Blend weights learned separately for wet and dry weather regimes"},
)
wds.to_netcdf(DATA_DIR / "blend_weights_regime.nc")
print(f"\nSaved blend_forecast_regime.nc, blend_weights_regime.nc, blend_scores_regime.csv")
