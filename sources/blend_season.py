"""
blend_season.py  -  adds SEASON to the adaptive weighting.

The problem statement asks for weights that adapt by "region, season and lead
time". blend.py already does region (per grid point) and lead time (per lead
day). This adds the third: separate weights for each IMD season, so the system
can learn e.g. "trust climatology in winter, trust LightGBM in the monsoon".

Seasons (IMD official):
    Winter        Jan, Feb
    Pre-monsoon   Mar, Apr, May
    Monsoon       Jun, Jul, Aug, Sep
    Post-monsoon  Oct, Nov, Dec

Same honest split as blend.py: weights learned on 2022, tested on 2023.
Runs alongside blend.py - it does not overwrite the original blend.

Run from the repo root:
    python -m sources.blend_season

Writes:  data/blend_forecast_season.nc
         data/blend_weights_season.nc   (season, source, lead, lat, lon)
         data/blend_scores_season.csv
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
MIN_DAYS = 10          # if a season has fewer training days than this, fall back to all-year weights

SEASON_OF_MONTH = {1: "winter", 2: "winter",
                   3: "pre_monsoon", 4: "pre_monsoon", 5: "pre_monsoon",
                   6: "monsoon", 7: "monsoon", 8: "monsoon", 9: "monsoon",
                   10: "post_monsoon", 11: "post_monsoon", 12: "post_monsoon"}
SEASONS = ["winter", "pre_monsoon", "monsoon", "post_monsoon"]

print("Loading sources ...")
fcs = [load(s)[VARS].load() for s in SOURCES]
fcs = list(xr.align(*fcs, join="inner"))
init = fcs[0].init_time.values
leads = fcs[0].lead.values
obs = load("imd_obs")[VARS].load()

max_lead = np.timedelta64(int(leads.max()), "D")
train = (init >= WEIGHT_START) & (init + max_lead <= TRAIN_END)
test = init > TRAIN_END
months = pd.DatetimeIndex(init).month
season_of_init = np.array([SEASON_OF_MONTH[m] for m in months])

print(f"  {len(SOURCES)} sources, {len(init)} init days")
print(f"  weights learned on {train.sum()} days (2022), tested on {test.sum()} days (2023)")
for s in SEASONS:
    print(f"    {s:13s}: {int((train & (season_of_init == s)).sum()):3d} training days, "
          f"{int((test & (season_of_init == s)).sum()):3d} test days")


def obs_at_valid(var):
    out = np.empty((len(init), len(leads), len(LAT), len(LON)), dtype="float32")
    for li, L in enumerate(leads):
        out[:, li] = obs[var].reindex(time=init + np.timedelta64(int(L), "D")).values
    return out


def weights_from(mask, F, y):
    """Inverse-MSE weights learned from the days in `mask`. Returns (S, lead, lat, lon)."""
    mse = np.stack([np.nanmean((F[s][mask] - y[mask]) ** 2, axis=0) for s in range(len(SOURCES))])
    w = 1.0 / (mse + EPS) ** POWER
    w = np.where(np.isnan(w), 0.0, w)
    tot = w.sum(axis=0, keepdims=True)
    return np.divide(w, tot, out=np.full_like(w, np.nan), where=tot > 0).astype("float32")


def apply_weights(F, w, days):
    """Weighted average on the given init days. w is (S, lead, lat, lon)."""
    wb = np.nan_to_num(w)[:, None]
    sub = F[:, days]
    has = ~np.isnan(sub)
    num = np.sum(np.where(has, sub, 0.0) * wb, axis=0)
    den = np.sum(has * wb, axis=0)
    return np.divide(num, den, out=np.full(num.shape, np.nan, dtype="float32"), where=den > 0)


blend_out, weight_out, score_rows = {}, {}, []

for var in VARS:
    print(f"\nBlending {var} by season ...")
    y = obs_at_valid(var)
    F = np.stack([f[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
                  for f in fcs])

    all_year_w = weights_from(train, F, y)              # fallback for thin seasons
    blend = np.full(F.shape[1:], np.nan, dtype="float32")
    w_by_season = {}

    for s in SEASONS:
        tr_s = train & (season_of_init == s)
        if tr_s.sum() < MIN_DAYS:
            w_s = all_year_w
            print(f"  {s:13s}: only {int(tr_s.sum())} training days - using all-year weights")
        else:
            w_s = weights_from(tr_s, F, y)
        w_by_season[s] = w_s
        days = season_of_init == s
        if days.sum():
            blend[days] = apply_weights(F, w_s, days)

    if var == "rain":
        blend = np.clip(blend, 0, None)
    blend_out[var] = blend
    weight_out[var] = np.stack([w_by_season[s] for s in SEASONS])   # (season, S, lead, lat, lon)

    # ---- score on 2023 ----
    has = ~np.isnan(F)
    common = has.all(axis=0) & ~np.isnan(y) & ~np.isnan(blend)

    def rmse_per_lead(pred):
        err2 = np.where(common, (pred - y) ** 2, np.nan)[test]
        return np.sqrt(np.nanmean(err2, axis=(0, 2, 3)))

    for name, pred in list(zip(NAMES, F)) + [("BLEND_SEASON", blend)]:
        for L, r in zip(leads, rmse_per_lead(pred)):
            score_rows.append({"var": var, "lead": int(L), "source": name, "rmse": float(r)})

    # how much do the weights actually differ between seasons?
    for s in SEASONS:
        avg = np.nanmean(w_by_season[s], axis=(2, 3))[:, 0]      # lead 1, mean over grid
        print(f"  {s:13s} lead-1 weights: " +
              "  ".join(f"{n}={a:.2f}" for n, a in zip(NAMES, avg)))

# ---- compare against the original all-year blend, OVERALL and PER SEASON ----
# The annual score is dominated by the monsoon (biggest errors), and the all-year
# weights were themselves fitted mostly on monsoon days - so an annual-only
# comparison hides what season-aware weighting actually changes. Score per season.
season_rows = []
try:
    allyear = load("blend_forecast")[VARS].load()
    allyear = allyear.reindex(init_time=init)          # same days, same order

    print("\n" + "=" * 68)
    print("Season-aware vs all-year blend (2023 test days, RMSE, lower is better)")
    print("=" * 68)

    for var in VARS:
        y = obs_at_valid(var)
        F = np.stack([f[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
                      for f in fcs])
        ay = allyear[var].transpose("init_time", "lead", "lat", "lon").values.astype("float32")
        sn = blend_out[var]
        common = (~np.isnan(F)).all(axis=0) & ~np.isnan(y) & ~np.isnan(sn) & ~np.isnan(ay)

        def rmse(pred, days):
            err2 = np.where(common, (pred - y) ** 2, np.nan)[days]
            return np.sqrt(np.nanmean(err2, axis=(0, 2, 3)))

        print(f"\n--- {var} ---")
        for label, days in ([("ALL YEAR", test)] +
                            [(s.upper(), test & (season_of_init == s)) for s in SEASONS]):
            if days.sum() == 0:
                continue
            r_sn, r_ay = rmse(sn, days), rmse(ay, days)
            gain = 100 * (r_ay - r_sn) / r_ay              # positive = season-aware is better
            print(f"  {label:13s} ({int(days.sum()):3d} days)  "
                  f"season {np.nanmean(r_sn):6.3f}   all-year {np.nanmean(r_ay):6.3f}   "
                  f"{np.nanmean(gain):+5.1f}% {'better' if np.nanmean(gain) > 0 else 'worse'}")
            for L, a, b, g in zip(leads, r_sn, r_ay, gain):
                season_rows.append({"var": var, "season": label.lower(), "lead": int(L),
                                    "rmse_season_aware": float(a), "rmse_all_year": float(b),
                                    "pct_better": float(g)})
    pd.DataFrame(season_rows).to_csv(DATA_DIR / "blend_scores_by_season.csv", index=False)
    print(f"\nPer-season detail saved to {DATA_DIR / 'blend_scores_by_season.csv'}")
except FileNotFoundError:
    print("\n(run `python -m sources.blend` first to compare against the all-year blend)")

# ---- save ----
ds = xr.Dataset(
    {v: (("init_time", "lead", "lat", "lon"), blend_out[v],
         {"units": "mm/day" if v == "rain" else "degC"}) for v in VARS},
    coords={"init_time": init, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": "Season-aware inverse-MSE blend (weights per IMD season, from 2022)"},
)
ds["lead"].attrs["units"] = "days"
save(ds, "blend_forecast_season", kind="forecast")

wds = xr.Dataset(
    {v: (("season", "source", "lead", "lat", "lon"), weight_out[v]) for v in VARS},
    coords={"season": SEASONS, "source": NAMES, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"description": "Blend weights learned separately for each IMD season"},
)
wds.to_netcdf(DATA_DIR / "blend_weights_season.nc")
pd.DataFrame(score_rows).to_csv(DATA_DIR / "blend_scores_season.csv", index=False)
print(f"\nSaved {DATA_DIR / 'blend_weights_season.nc'} and blend_scores_season.csv")
print("Done! load('blend_forecast_season'), load('blend_weights_season')")