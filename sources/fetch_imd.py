"""
fetch_imd.py  -  downloads IMD gridded rainfall + Tmax and saves data/imd_obs.nc

Run from the repo root (needs internet, takes a while the first time):
    python -m sources.fetch_imd

Start with a few years to test, then increase END_YEAR range for P2's training.
"""
import imdlib as imd
import xarray as xr
from sources.common import to_common_grid, save

START_YEAR, END_YEAR = 2010, 2023     # small first! widen later (e.g. 2000-2023)
RAW_DIR = "raw_imd"                    # raw IMD binary files go here (not in Git)


def get(var):
    print(f"Downloading IMD {var} {START_YEAR}-{END_YEAR} ...")
    imd.get_data(var, START_YEAR, END_YEAR, fn_format="yearwise", file_dir=RAW_DIR)
    data = imd.open_data(var, START_YEAR, END_YEAR, "yearwise", RAW_DIR)
    da = data.get_xarray()[var]
    return da.where(da > -900)          # IMD uses -999 for missing / sea points


rain = get("rain")                       # mm/day, 0.25 deg
tmax = get("tmax")                       # degC, coarser grid

# The two IMD grids differ, so regrid each one separately, then combine
rain = to_common_grid(rain.to_dataset(name="rain"))["rain"]
tmax = to_common_grid(tmax.to_dataset(name="tmax"))["tmax"]

ds = xr.Dataset({"rain": rain, "tmax": tmax}).transpose("time", "lat", "lon")
ds["rain"].attrs["units"] = "mm/day"
ds["tmax"].attrs["units"] = "degC"
ds.attrs["source"] = "IMD gridded observations via imdlib"

save(ds, "imd_obs", kind="obs")
