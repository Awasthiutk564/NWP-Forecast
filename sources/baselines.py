"""
baselines.py  -  makes two simple forecast SOURCES from IMD observations.

  persistence : "the next days will look like today"
  climatology : "the next days will look like the usual weather for that date"

They are the first members of the model zoo the blender combines.

Run from the repo root:
    python -m sources.baselines dummy_obs    # test on fake data (works today)
    python -m sources.baselines              # real run on data/imd_obs.nc

Output (contract format: init_time, lead, lat, lon):
    data/persistence.nc   data/climatology.nc
    (or dummy_persistence.nc / dummy_climatology.nc when run on dummy data)
"""
import sys
import numpy as np
import xarray as xr
from sources.common import load, save

LEADS = np.arange(1, 6)                       # lead days 1..5
VARS = ["rain", "tmax"]

obs_name = sys.argv[1] if len(sys.argv) > 1 else "imd_obs"
prefix = "dummy_" if obs_name.startswith("dummy") else ""
obs = load(obs_name)[VARS].load()

n = obs.sizes["time"] - LEADS.max()           # init days that have 5 days of future
init = obs.time.values[:n]


def pack(per_lead, name, desc):
    """per_lead: list (one per lead) of {var: array(n, lat, lon)} -> contract file"""
    data = {
        v: (("init_time", "lead", "lat", "lon"),
            np.stack([d[v] for d in per_lead], axis=1).astype("float32"),
            {"units": obs[v].attrs.get("units", "")})
        for v in VARS
    }
    ds = xr.Dataset(
        data,
        coords={"init_time": init, "lead": LEADS, "lat": obs.lat.values, "lon": obs.lon.values},
        attrs={"source": desc},
    )
    save(ds, prefix + name, kind="forecast")


# ---------- 1. Persistence ----------
today = {v: obs[v].values[:n] for v in VARS}
pack([today for _ in LEADS], "persistence", "Persistence forecast from IMD observations")

# ---------- 2. Climatology ----------
# Same split as the ML models: climatology is built from years up to 2021 only,
# so it has never seen 2022 (blend-weight year) or 2023 (test year).
CLIM_END = np.datetime64("2021-12-31")
train = obs.sel(time=obs.time <= CLIM_END)
if train.sizes["time"] < 365:                 # dummy data is only one month
    train = obs

clim = train.groupby("time.dayofyear").mean("time")
clim = clim.rolling(dayofyear=15, center=True, min_periods=1).mean()   # smooth
clim = clim.transpose("dayofyear", "lat", "lon")

doy = obs.time.dt.dayofyear.values
per_lead = []
for L in LEADS:
    valid_doy = doy[L:L + n]                  # day-of-year of the date being forecast
    c = clim.sel(dayofyear=valid_doy, method="nearest")
    per_lead.append({v: c[v].values for v in VARS})
pack(per_lead, "climatology", "Day-of-year climatology from IMD observations")

print("Done. Teammates: load('persistence') and load('climatology')")
