"""
fetch_imdaa_wind.py  -  converts IMDAA 10 m wind (the OBSERVED wind "truth")
onto our grid, so the S2S wind forecast can be verified and blended.

Why IMDAA: IMD's daily gridded archive has no wind at all. IMDAA is NCMRWF's
own Indian regional reanalysis, so this keeps the whole system Made-in-India.

Reads (any sub-folder under raw_imdaa_wind/):
    UGRD-10m_<YYYYMMDD>00_ncum_imdaa_reanl_2df_00.nc   10 m u wind (m/s)
    VGRD-10m_<YYYYMMDD>00_ncum_imdaa_reanl_2df_00.nc   10 m v wind (m/s)

Each file is a single 00 UTC snapshot (the file carries the timestamp twice;
we take the first). 00 UTC matches the S2S forecast valid time exactly, so
forecast and observation are like-for-like.

Run from the repo root:
    python -m sources.fetch_imdaa_wind

Writes:
    data/imdaa_wind_obs.nc   dims (time, lat, lon)
                             vars u10, v10, wspd  [m/s]
"""
import re
import glob
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import LAT, LON, DATA_DIR

PATTERN = re.compile(r"(UGRD|VGRD)-10m_(\d{8})00_")

files = {}
for f in glob.glob("raw_imdaa_wind/**/*.nc", recursive=True):
    m = PATTERN.search(f.replace("\\", "/").split("/")[-1])
    if m:
        files.setdefault((m.group(1), m.group(2)), f)

dates = sorted({d for _, d in files})
if not dates:
    raise SystemExit("No IMDAA wind files found under raw_imdaa_wind/")
print(f"Found {len(files)} files covering {len(dates)} days "
      f"({dates[0]} to {dates[-1]})")


def regrid(path, varname):
    """Open one 00 UTC snapshot and interpolate onto the team grid."""
    ds = xr.open_dataset(path)
    da = ds[varname]
    if "time" in da.dims:
        da = da.isel(time=0)                 # the timestamp is duplicated in these files
    da = da.squeeze(drop=True)               # drop height=10m
    da = da.sortby("lat").sortby("lon")
    lin = da.interp(lat=LAT, lon=LON)
    near = da.interp(lat=LAT, lon=LON, method="nearest", kwargs={"fill_value": "extrapolate"})
    return lin.fillna(near).values.astype("float32")


shape = (len(dates), len(LAT), len(LON))
u = np.full(shape, np.nan, dtype="float32")
v = np.full(shape, np.nan, dtype="float32")
missing = 0

for i, d in enumerate(dates):
    fu, fv = files.get(("UGRD", d)), files.get(("VGRD", d))
    if fu is None or fv is None:
        missing += 1
        continue
    u[i] = regrid(fu, "10u")
    v[i] = regrid(fv, "10v")
    if (i + 1) % 365 == 0:
        print(f"  {i + 1}/{len(dates)} days done")

if missing:
    print(f"  note: {missing} days missing a U or V file - left as NaN")

wspd = np.hypot(u, v)

ds = xr.Dataset(
    {
        "u10": (("time", "lat", "lon"), u, {"units": "m/s", "long_name": "10 m eastward wind"}),
        "v10": (("time", "lat", "lon"), v, {"units": "m/s", "long_name": "10 m northward wind"}),
        "wspd": (("time", "lat", "lon"), wspd.astype("float32"),
                 {"units": "m/s", "long_name": "10 m wind speed at 00 UTC"}),
    },
    coords={"time": pd.to_datetime(dates, format="%Y%m%d").values, "lat": LAT, "lon": LON},
    attrs={"source": "IMDAA reanalysis (NCMRWF/MoES) 10 m wind at 00 UTC, regridded to 0.25 deg; "
                     "DOI 10.64349/nmrf.rds.imdaa.50514"},
)
DATA_DIR.mkdir(exist_ok=True)
path = DATA_DIR / "imdaa_wind_obs.nc"
ds.to_netcdf(path)

print(f"\nSaved {path}")
print(f"  u10  mean {float(np.nanmean(u)):6.2f} m/s")
print(f"  v10  mean {float(np.nanmean(v)):6.2f} m/s")
print(f"  wspd mean {float(np.nanmean(wspd)):6.2f} m/s   "
      f"max {float(np.nanmax(wspd)):6.2f} m/s")
print("Done. load('imdaa_wind_obs')")
