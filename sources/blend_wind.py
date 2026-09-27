"""
blend_wind.py  -  adds WIND as a third blended variable, plus high-wind alerts.

The problem statement asks for rainfall, temperature AND wind, and for
"improved signals for ... high-wind events". This closes that gap.

Sources for wind (fewer than for rain/tmax, because wind has no long IMD archive):
    s2s_nwp      NCMRWF S2S 10 m wind forecast          (a real physical NWP model)
    persistence  "tomorrow's wind = today's wind"        (from IMDAA observations)
    climatology  day-of-year average wind                (from IMDAA observations)

Truth: IMDAA 10 m wind at 00 UTC (NCMRWF's Indian reanalysis), which matches
the S2S forecast valid time exactly.

Honest split (same as the rest of the hybrid system):
    climatology built from 2010-2012 only
    blend weights learned on 2010-2012
    tested on 2013-2015

High-wind alerts use IMD's wind warning thresholds for the coast:
    yellow  >= 10.8 m/s   (39 km/h, "strong wind")
    orange  >= 17.2 m/s   (62 km/h, "gale")
    red     >= 24.5 m/s   (88 km/h, "storm")

Run from the repo root (needs fetch_s2s, fetch_imdaa_wind first):
    python -m sources.blend_wind

Writes:  data/blend_wind_forecast.nc   data/blend_wind_weights.nc
         data/wind_scores.csv          data/wind_alert_scores.csv
"""
import warnings
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import load, DATA_DIR, LAT, LON

warnings.filterwarnings("ignore", category=RuntimeWarning)

WEIGHT_START = np.datetime64("2010-01-01")
WEIGHT_END = np.datetime64("2012-12-31")
TEST_START = np.datetime64("2013-01-01")
EPS = 1e-6
POWER = 2
THRESH = {"yellow": 10.8, "orange": 17.2, "red": 24.5}   # m/s, IMD wind warning levels

print("Loading wind forecast and observations ...")
s2s = load("s2s_raw")[["wspd"]].load()
obs = load("imdaa_wind_obs")["wspd"].load()

init = s2s.init_time.values
leads = s2s.lead.values
print(f"  {len(init)} S2S start dates, leads {list(leads)}")
print(f"  IMDAA wind: {str(obs.time.values[0])[:10]} to {str(obs.time.values[-1])[:10]}")


def obs_at_valid():
    out = np.full((len(init), len(leads), len(LAT), len(LON)), np.nan, dtype="float32")
    for li, L in enumerate(leads):
        out[:, li] = obs.reindex(time=init + np.timedelta64(int(L), "D")).values
    return out


y = obs_at_valid()

# ---------- build the three sources ----------
F_s2s = s2s["wspd"].transpose("init_time", "lead", "lat", "lon").values.astype("float32")

# persistence: the observed wind on the init day itself, repeated for every lead
today = obs.reindex(time=init).values.astype("float32")          # (init, lat, lon)
F_per = np.repeat(today[:, None], len(leads), axis=1)

# climatology: day-of-year mean wind, built from 2010-2012 only
clim_src = obs.sel(time=slice("2010-01-01", "2012-12-31"))
clim = clim_src.groupby("time.dayofyear").mean("time")
clim = clim.rolling(dayofyear=15, center=True, min_periods=1).mean()
F_clim = np.full_like(F_s2s, np.nan)
for li, L in enumerate(leads):
    doy = pd.DatetimeIndex(init + np.timedelta64(int(L), "D")).dayofyear
    F_clim[:, li] = clim.sel(dayofyear=doy, method="nearest").values

NAMES = ["persistence", "climatology", "s2s_nwp"]
F = np.stack([F_per, F_clim, F_s2s])

max_lead = np.timedelta64(int(leads.max()), "D")
train = (init >= WEIGHT_START) & (init + max_lead <= WEIGHT_END)
test = init >= TEST_START
print(f"  weights learned on {train.sum()} days (2010-2012), "
      f"tested on {test.sum()} days (2013-2015)")

# ---------- weights ----------
mse = np.stack([np.nanmean((F[s][train] - y[train]) ** 2, axis=0) for s in range(len(NAMES))])
w = 1.0 / (mse + EPS) ** POWER
w = np.where(np.isnan(w), 0.0, w)
tot = w.sum(axis=0, keepdims=True)
w = np.divide(w, tot, out=np.full_like(w, np.nan), where=tot > 0).astype("float32")

wb = np.nan_to_num(w)[:, None]
has = ~np.isnan(F)
num = np.sum(np.where(has, F, 0.0) * wb, axis=0)
den = np.sum(has * wb, axis=0)
blend = np.divide(num, den, out=np.full(num.shape, np.nan, dtype="float32"), where=den > 0)
blend = np.clip(blend, 0, None)

avg = np.nanmean(w, axis=(2, 3))
for s, name in enumerate(NAMES):
    print(f"  mean weight {name:12s}: " + "  ".join(f"L{L}={a:.2f}" for L, a in zip(leads, avg[s])))

# ---------- skill scores ----------
common = has.all(axis=0) & ~np.isnan(y) & ~np.isnan(blend)


def rmse_per_lead(pred):
    err2 = np.where(common, (pred - y) ** 2, np.nan)[test]
    return np.sqrt(np.nanmean(err2, axis=(0, 2, 3)))


rows = []
for name, pred in list(zip(NAMES, F)) + [("BLEND", blend)]:
    for L, r in zip(leads, rmse_per_lead(pred)):
        rows.append({"var": "wspd", "lead": int(L), "source": name, "rmse": float(r)})
scores = pd.DataFrame(rows)
scores.to_csv(DATA_DIR / "wind_scores.csv", index=False)

print("\nWind speed RMSE on 2013-2015 (m/s, lower is better):")
print(scores.pivot(index="source", columns="lead", values="rmse").round(3).to_string())

# ---------- high-wind alerts, verified ----------
print("\nHigh-wind alert verification (grid-day, lead 1, 2013-2015):")
alert_rows = []
fc1, ob1, ok1 = blend[test, 0], y[test, 0], common[test, 0]
for level, thr in THRESH.items():
    f_ev = (fc1 >= thr) & ok1
    o_ev = (ob1 >= thr) & ok1
    hits = int((f_ev & o_ev).sum())
    misses = int((~f_ev & o_ev).sum())
    fa = int((f_ev & ~o_ev).sum())
    pod = hits / (hits + misses) if hits + misses else np.nan
    far = fa / (hits + fa) if hits + fa else np.nan
    csi = hits / (hits + misses + fa) if hits + misses + fa else np.nan
    alert_rows.append({"level": level, "threshold_ms": thr, "hits": hits, "misses": misses,
                       "false_alarms": fa, "POD": pod, "FAR": far, "CSI": csi})
    if hits + misses + fa:
        print(f"  {level:7s} (>= {thr:4.1f} m/s): {hits:5d} hits, {misses:5d} misses, "
              f"{fa:5d} false alarms   POD {pod:.2f}  FAR {far:.2f}  CSI {csi:.2f}")
    else:
        print(f"  {level:7s} (>= {thr:4.1f} m/s): no events in the test period")
pd.DataFrame(alert_rows).to_csv(DATA_DIR / "wind_alert_scores.csv", index=False)

# ---------- save ----------
ds = xr.Dataset(
    {"wspd": (("init_time", "lead", "lat", "lon"), blend.astype("float32"), {"units": "m/s"})},
    coords={"init_time": init, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": "Blended 10 m wind (persistence + climatology + NCMRWF S2S NWP), "
                     "weights from 2010-2012, verified against IMDAA"},
)
ds["lead"].attrs["units"] = "days"
ds.to_netcdf(DATA_DIR / "blend_wind_forecast.nc")

wds = xr.Dataset(
    {"wspd": (("source", "lead", "lat", "lon"), w)},
    coords={"source": NAMES, "lead": leads, "lat": LAT, "lon": LON},
)
wds.to_netcdf(DATA_DIR / "blend_wind_weights.nc")

print(f"\nSaved blend_wind_forecast.nc, blend_wind_weights.nc, "
      f"wind_scores.csv, wind_alert_scores.csv")
