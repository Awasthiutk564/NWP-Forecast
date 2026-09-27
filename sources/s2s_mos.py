"""
s2s_mos.py  -  turns the S2S 925 hPa temperature forecast into a surface Tmax
forecast (MOS = Model Output Statistics), and puts S2S into our contract format.

Why: S2S has no surface temperature, only temperature ~750m up (925 hPa).
We learn a simple per-lead, per-grid-point correction:
    Tmax_surface = a + b * T925
using years where both S2S and IMD observations exist. Leave-one-year-out:
each year's correction is learned from the OTHER years, so no year corrects
itself (the same honesty rule as the rest of the project).

Run from the repo root (needs data/s2s_raw.nc from `python -m sources.fetch_s2s`):
    python -m sources.s2s_mos

Writes:
    data/s2s_forecast.nc   contract format (init_time, lead, lat, lon), vars rain, tmax
                            (wind is kept separately - see data/s2s_raw.nc for wspd)
"""
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import load, save, LAT, LON

s2s = load("s2s_raw")[["rain", "t925"]].load()
obs = load("imd_obs")["tmax"].load()

init = s2s.init_time.values
leads = s2s.lead.values
years = pd.DatetimeIndex(init).year
have_t925 = ~np.isnan(s2s["t925"].isel(lead=0, lat=0, lon=0).values)   # False for 2011
fit_years = sorted(set(years[have_t925]))
print(f"Years with t925: {fit_years}")

t925 = s2s["t925"].transpose("init_time", "lead", "lat", "lon").values          # (init, lead, lat, lon)
valid_dates = [init + np.timedelta64(int(L), "D") for L in leads]
tmax_obs = np.stack([obs.reindex(time=vd).values for vd in valid_dates], axis=1)  # (init, lead, lat, lon)

tmax_corr = np.full_like(t925, np.nan)

for test_year in fit_years:
    train_mask = have_t925 & (years != test_year)
    test_mask = years == test_year
    for li in range(len(leads)):
        for i in range(len(LAT)):
            for j in range(len(LON)):
                x = t925[train_mask, li, i, j]
                y = tmax_obs[train_mask, li, i, j]
                ok = ~np.isnan(x) & ~np.isnan(y)
                if ok.sum() < 5:
                    continue
                b, a = np.polyfit(x[ok], y[ok], 1)                # Tmax = a + b * T925
                tmax_corr[test_mask, li, i, j] = a + b * t925[test_mask, li, i, j]
    print(f"  fitted correction for {test_year} (trained on {sorted(set(fit_years) - {test_year})})")

# 2011 has no t925 at all: use the average correction across the other years, applied to... nothing
# (t925 itself is NaN for 2011, so tmax_corr stays NaN there too - handled by save() below)

n_ok = np.isnan(tmax_corr).sum()
print(f"Corrected Tmax built. {n_ok} of {tmax_corr.size} slots are NaN "
      f"(2011, plus any grid point with too little training data).")

ds = xr.Dataset(
    {
        "rain": (("init_time", "lead", "lat", "lon"),
                 s2s["rain"].transpose("init_time", "lead", "lat", "lon").values.astype("float32"),
                 {"units": "mm/day"}),
        "tmax": (("init_time", "lead", "lat", "lon"), tmax_corr.astype("float32"), {"units": "degC"}),
    },
    coords={"init_time": init, "lead": leads, "lat": LAT, "lon": LON},
    attrs={"source": "NCMRWF S2S reforecast (rain as-is; Tmax = MOS correction of 925 hPa "
                     "temperature, leave-one-year-out, trained on IMD obs)"},
)
ds["lead"].attrs["units"] = "days"
save(ds, "s2s_forecast", kind="forecast")
print("Done. load('s2s_forecast') - this is the NWP source for the blender.")
