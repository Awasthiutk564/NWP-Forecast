"""
baselines_hybrid.py  -  P1: climatology built ONLY from 2016-2023.

Persistence needs no hybrid version - it never "trains" on anything, so the
existing data/persistence.nc is already honest for the 2013-2015 hybrid test.
Climatology DOES train (it averages past years), so for the hybrid blend it
must be built only from years the S2S test period (2013-2015) never touches.

Run from the repo root:
    python -m sources.baselines_hybrid

Writes:  data/climatology_hy.nc
"""
import numpy as np
import xarray as xr
from sources.common import load, save

LEADS = np.arange(1, 6)
VARS = ["rain", "tmax"]
CLIM_START = np.datetime64("2016-01-01")   # must not include 2010-2015 (S2S years)

obs = load("imd_obs")[VARS].load()
n = obs.sizes["time"] - LEADS.max()
init = obs.time.values[:n]

train = obs.sel(time=obs.time >= CLIM_START)
print(f"Building hybrid climatology from {str(train.time.values[0])[:10]} "
      f"to {str(train.time.values[-1])[:10]} (2010-2015 excluded)")

clim = train.groupby("time.dayofyear").mean("time")
clim = clim.rolling(dayofyear=15, center=True, min_periods=1).mean()
clim = clim.transpose("dayofyear", "lat", "lon")

doy = obs.time.dt.dayofyear.values
per_lead = []
for L in LEADS:
    valid_doy = doy[L:L + n]
    c = clim.sel(dayofyear=valid_doy, method="nearest")
    per_lead.append({v: c[v].values for v in VARS})

data = {
    v: (("init_time", "lead", "lat", "lon"),
        np.stack([d[v] for d in per_lead], axis=1).astype("float32"),
        {"units": obs[v].attrs.get("units", "")})
    for v in VARS
}
ds = xr.Dataset(
    data,
    coords={"init_time": init, "lead": LEADS, "lat": obs.lat.values, "lon": obs.lon.values},
    attrs={"source": "Day-of-year climatology, 2016-2023 only (hybrid run)"},
)
save(ds, "climatology_hy", kind="forecast")
print("Done. load('climatology_hy')")
