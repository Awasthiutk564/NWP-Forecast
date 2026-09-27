"""
inspect_s2s.py  -  quick look inside the S2S test download.

Run from the repo root:
    python -m tools.inspect_s2s

Answers three questions before we write the converter:
  1. What units are rain, wind and temperature in?
  2. Which date is each "dayNN" file valid for?
  3. Is rain accumulated since the start (grows every day) or per day?
"""
import glob
import re
import numpy as np
import xarray as xr

patterns = {
    "rain (APCP)": "raw_s2s/test_single/APCP-sfc_*.nc",
    "u-wind (UGRD)": "raw_s2s/test_single/UGRD-10m_*.nc",
    "v-wind (VGRD)": "raw_s2s/test_single/VGRD-10m_*.nc",
    "temp 925 (TMP)": "raw_s2s/test_pressure/TMP_*.nc",
}

for label, pat in patterns.items():
    files = sorted(glob.glob(pat))
    print(f"\n=== {label}: {len(files)} files ===")
    for f in files:
        ds = xr.open_dataset(f)
        var = list(ds.data_vars)[0]
        da = ds[var]
        day = re.search(r"day(\d+)", f).group(1)
        vals = da.values.astype("float64")
        print(f"  day{day}  valid t = {str(ds['t'].values[0])[:10]}  "
              f"mean = {np.nanmean(vals):9.3f}  min = {np.nanmin(vals):9.3f}  max = {np.nanmax(vals):9.3f}")
    first = xr.open_dataset(files[0])
    var = list(first.data_vars)[0]
    print(f"  variable '{var}' attributes: {dict(first[var].attrs)}")
