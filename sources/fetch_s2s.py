"""
fetch_s2s.py  -  converts NCMRWF S2S reforecast files (Unified Model) to our grid.

Run from the repo root:
    python -m sources.fetch_s2s

Reads (any sub-folder under raw_s2s/, duplicates are ignored):
    APCP-sfc_IC<YYYYMMDD>_dayNN.nc   daily rain            (values are mm/day; file label says kg m-2 s-1)
    UGRD-10m_IC<YYYYMMDD>_dayNN.nc   10 m u-wind (m/s)
    VGRD-10m_IC<YYYYMMDD>_dayNN.nc   10 m v-wind (m/s)
    TMP_IC<YYYYMMDD>_dayNN_925.nc    temperature at 925 hPa (K)
    dayNN = lead day NN: valid date = init date + NN days.

Writes:
    data/s2s_raw.nc   dims (init_time, lead, lat, lon), lead 1-5
                      vars rain [mm/day], u10, v10, wspd [m/s], t925 [degC]
    (not yet in contract format: t925 is converted to surface Tmax by sources/s2s_mos.py)
"""
import re
from pathlib import Path
import numpy as np
import pandas as pd
import xarray as xr
from sources.common import LAT, LON, DATA_DIR

RAW = Path("raw_s2s")
LEADS = np.arange(1, 6)
PATTERN = re.compile(r"^(APCP-sfc|UGRD-10m|VGRD-10m|TMP)_IC(\d{8})_day(\d{2})")
VARMAP = {"APCP-sfc": "rain", "UGRD-10m": "u10", "VGRD-10m": "v10", "TMP": "t925"}

# ---------- 1. Find every file once ----------
files = {}
for f in RAW.rglob("*.nc"):
    m = PATTERN.match(f.name)
    if not m:
        continue
    kind, ic, day = m.group(1), m.group(2), int(m.group(3))
    if day in LEADS:
        files.setdefault((VARMAP[kind], ic, day), f)      # first copy wins; duplicates ignored

inits = sorted({ic for _, ic, _ in files})
if not inits:
    raise SystemExit("No S2S files found under raw_s2s/ - check the folders.")
print(f"Found {len(files)} files, {len(inits)} start dates "
      f"({inits[0][:4]}-{inits[-1][:4]}): {', '.join(sorted({i[4:] for i in inits}))} (MMDD)")


def regrid(path):
    """Open one file and interpolate it onto the team grid (edges use the nearest source value)."""
    ds = xr.open_dataset(path)
    da = ds[list(ds.data_vars)[0]].squeeze(drop=True)          # drop t (and p for 925)
    da = da.rename({"latitude": "lat", "longitude": "lon"}).sortby("lat").sortby("lon")
    lin = da.interp(lat=LAT, lon=LON)                           # NaN outside the source grid
    near = da.interp(lat=LAT, lon=LON, method="nearest", kwargs={"fill_value": "extrapolate"})
    return lin.fillna(near).values.astype("float32")            # edges: nearest source value


# ---------- 2. Fill arrays (init, lead, lat, lon) ----------
shape = (len(inits), len(LEADS), len(LAT), len(LON))
out = {v: np.full(shape, np.nan, dtype="float32") for v in VARMAP.values()}
missing = {v: 0 for v in VARMAP.values()}

for i, ic in enumerate(inits):
    for li, L in enumerate(LEADS):
        for v in out:
            f = files.get((v, ic, int(L)))
            if f is None:
                missing[v] += 1
                continue
            out[v][i, li] = regrid(f)
    if (i + 1) % 12 == 0:
        print(f"  {i + 1}/{len(inits)} start dates done")

out["rain"] = np.clip(out["rain"], 0, None)       # mm/day (checked against IMD, June 2012)
out["t925"] = out["t925"] - 273.15                 # K -> degC
out["wspd"] = np.hypot(out["u10"], out["v10"])     # wind speed

print("Missing (start date x lead) slots per variable:", missing)

# ---------- 3. Save ----------
units = {"rain": "mm/day", "u10": "m/s", "v10": "m/s", "wspd": "m/s", "t925": "degC"}
ds = xr.Dataset(
    {v: (("init_time", "lead", "lat", "lon"), out[v], {"units": units[v]}) for v in units},
    coords={"init_time": pd.to_datetime(inits, format="%Y%m%d").values,
            "lead": LEADS, "lat": LAT, "lon": LON},
    attrs={"source": "NCMRWF S2S reforecast (Unified Model Vn10.4), regridded to 0.25 deg; "
                     "DOI 10.64349/nmrf.rds.s2s.50521"},
)
ds["lead"].attrs["units"] = "days"
DATA_DIR.mkdir(exist_ok=True)
path = DATA_DIR / "s2s_raw.nc"
ds.to_netcdf(path)

print(f"\nSaved {path}")
for v in units:
    print(f"  {v:5s} mean {float(np.nanmean(out[v])):7.2f} {units[v]}   "
          f"(lead 1 mean {float(np.nanmean(out[v][:, 0])):7.2f})")
