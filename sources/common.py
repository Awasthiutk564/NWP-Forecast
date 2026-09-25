"""
common.py  -  the ONE file everyone imports.

It defines:
  1. The common grid (every dataset gets put onto this grid)
  2. load(name)  -> opens a standard NetCDF file from data/

Teammates only ever write:
    from sources.common import load
    ds = load("imd_obs")        # or "dummy_forecast", "ncum", ...
"""
from pathlib import Path
import numpy as np
import xarray as xr

# ---- 1. Common grid: Andhra Pradesh + Telangana, 0.25 degree (same as IMD rain) ----
LAT = np.round(np.arange(12.0, 20.0 + 0.001, 0.25), 2)   # 33 points
LON = np.round(np.arange(76.0, 85.0 + 0.001, 0.25), 2)   # 37 points

# Folder where all standard files live (repo_root/data)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# ---- 2. The data contract ----
# Forecast files : dims (init_time, lead, lat, lon), vars rain [mm/day], tmax [degC]
# Observation file: dims (time, lat, lon),           vars rain [mm/day], tmax [degC]
REQUIRED_VARS = ["rain", "tmax"]


def to_common_grid(ds: xr.Dataset) -> xr.Dataset:
    """Put any dataset onto the common grid (bilinear interpolation)."""
    ds = ds.sortby("lat").sortby("lon")
    return ds.interp(lat=LAT, lon=LON)


def check_contract(ds: xr.Dataset, kind: str) -> None:
    """Raise a clear error if a file does not follow the contract."""
    dims = ("init_time", "lead", "lat", "lon") if kind == "forecast" else ("time", "lat", "lon")
    for v in REQUIRED_VARS:
        if v not in ds:
            raise ValueError(f"Missing variable '{v}'")
        if tuple(ds[v].dims) != dims:
            raise ValueError(f"'{v}' has dims {ds[v].dims}, expected {dims}")
    if not (np.allclose(ds.lat.values, LAT) and np.allclose(ds.lon.values, LON)):
        raise ValueError("lat/lon do not match the common grid - use to_common_grid()")


def save(ds: xr.Dataset, name: str, kind: str) -> Path:
    """Check the contract, then write data/<name>.nc"""
    check_contract(ds, kind)
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / f"{name}.nc"
    ds.to_netcdf(path)
    print(f"Saved {path}  ({kind})")
    return path


def load(name: str) -> xr.Dataset:
    """Open data/<name>.nc  e.g. load('imd_obs')"""
    path = DATA_DIR / f"{name}.nc"
    if not path.exists():
        available = sorted(p.stem for p in DATA_DIR.glob("*.nc"))
        raise FileNotFoundError(f"{path} not found. Available: {available}")
    return xr.open_dataset(path)
