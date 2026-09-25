"""
make_dummy.py  -  creates FAKE data in the exact contract format.

Run from the repo root:
    python -m sources.make_dummy

It writes:
    data/dummy_obs.nc       (time, lat, lon)
    data/dummy_forecast.nc  (init_time, lead, lat, lon)

The numbers are random but realistic in size, so P2/P3/P4 can
write and test their code today. Later we swap in real data.
"""
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import LAT, LON, save

rng = np.random.default_rng(42)
days = pd.date_range("2024-06-01", "2024-06-30", freq="D")
leads = np.arange(1, 6)                       # lead days 1..5
shape_obs = (len(days), len(LAT), len(LON))

# --- fake observations ---
rain_obs = rng.gamma(shape=0.6, scale=12.0, size=shape_obs)     # mostly light, some heavy
tmax_obs = 33 + 3 * rng.standard_normal(shape_obs)

obs = xr.Dataset(
    {
        "rain": (("time", "lat", "lon"), rain_obs.astype("float32"), {"units": "mm/day"}),
        "tmax": (("time", "lat", "lon"), tmax_obs.astype("float32"), {"units": "degC"}),
    },
    coords={"time": days, "lat": LAT, "lon": LON},
    attrs={"source": "DUMMY - random numbers, not real data"},
)
save(obs, "dummy_obs", kind="obs")

# --- fake forecast = truth + error that grows with lead time ---
n_init = len(days) - leads.max()
rain_fc = np.empty((n_init, len(leads), len(LAT), len(LON)), dtype="float32")
tmax_fc = np.empty_like(rain_fc)
for i in range(n_init):
    for j, L in enumerate(leads):
        truth_r = rain_obs[i + L]
        truth_t = tmax_obs[i + L]
        rain_fc[i, j] = np.clip(truth_r + rng.normal(0, 3 * L, truth_r.shape), 0, None)
        tmax_fc[i, j] = truth_t + rng.normal(0, 0.5 * L, truth_t.shape)

fc = xr.Dataset(
    {
        "rain": (("init_time", "lead", "lat", "lon"), rain_fc, {"units": "mm/day"}),
        "tmax": (("init_time", "lead", "lat", "lon"), tmax_fc, {"units": "degC"}),
    },
    coords={"init_time": days[:n_init], "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": "DUMMY - random numbers, not real data"},
)
fc["lead"].attrs["units"] = "days"
save(fc, "dummy_forecast", kind="forecast")
print("Done. Teammates can now use: from sources.common import load")
