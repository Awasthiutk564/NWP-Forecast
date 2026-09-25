"""
fetch_ncmrwf.py  -  converts raw IMDAA and MERA downloads into team format.

Run from the repo root:
    python -m sources.fetch_ncmrwf

Reads:
    raw_imdaa/APCP-sfc_*.nc  +  raw_imdaa/T2m_max_*.nc
    raw_mera/mera_*.nc

Writes:
    data/imdaa_obs.nc   (time, lat, lon)  rain + tmax
    data/mera_obs.nc    (time, lat, lon)  rain only
"""
import glob
import numpy as np
import xarray as xr
from sources.common import LAT, LON, save, DATA_DIR

# ──────────────────────────────────────────────
#  IMDAA  (precip + tmax, 0.12 deg, daily)
# ──────────────────────────────────────────────
print("Processing IMDAA ...")
rain_files = sorted(glob.glob("raw_imdaa/APCP-sfc_*.nc"))
tmax_files = sorted(glob.glob("raw_imdaa/T2m_max_*.nc"))

if not rain_files:
    print("  No IMDAA rain files found in raw_imdaa/ — skipping.")
else:
    # --- rain ---
    rain_ds = xr.open_mfdataset(rain_files, combine="by_coords")
    rain = rain_ds["param8.1.0"]                       # (time, lat, lon)
    rain = rain.interp(lat=LAT, lon=LON)
    rain = rain.clip(min=0)

    # --- tmax ---
    if tmax_files:
        tmax_ds = xr.open_mfdataset(tmax_files, combine="by_coords")
        tmax = tmax_ds["2t"].squeeze("height", drop=True)  # remove height=2m dim
        tmax = tmax.interp(lat=LAT, lon=LON)
        # Convert Kelvin to Celsius if values are > 100
        if float(tmax.isel(time=0, lat=0, lon=0).values) > 100:
            tmax = tmax - 273.15
            print("  Converted tmax from Kelvin to Celsius")
    else:
        tmax = None

    # --- combine and save ---
    imdaa = xr.Dataset(
        {
            "rain": (("time", "lat", "lon"), rain.values.astype("float32"),
                     {"units": "mm/day"}),
        },
        coords={"time": rain.time.values, "lat": LAT, "lon": LON},
        attrs={"source": "IMDAA reanalysis (NCMRWF/MoES), 12km, regridded to 0.25deg"},
    )
    if tmax is not None:
        imdaa["tmax"] = (("time", "lat", "lon"), tmax.values.astype("float32"),
                         {"units": "degC"})

    # save as obs format
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / "imdaa_obs.nc"
    imdaa.to_netcdf(path)
    print(f"  Saved {path}  ({len(rain.time)} days)")

# ──────────────────────────────────────────────
#  MERA  (rain only, ~0.04 deg, daily)
# ──────────────────────────────────────────────
print("Processing MERA ...")
mera_files = sorted(glob.glob("raw_mera/mera_*.nc"))

if not mera_files:
    print("  No MERA files found in raw_mera/ — skipping.")
else:
    mera_ds = xr.open_mfdataset(mera_files, combine="by_coords")
    mera_rain = mera_ds["Rainfall"]

    # MERA uses 'latitude'/'longitude' instead of 'lat'/'lon'
    mera_rain = mera_rain.rename({"latitude": "lat", "longitude": "lon"})
    mera_rain = mera_rain.sortby("lat").sortby("lon")
    mera_rain = mera_rain.interp(lat=LAT, lon=LON)
    mera_rain = mera_rain.clip(min=0)

    mera = xr.Dataset(
        {
            "rain": (("time", "lat", "lon"), mera_rain.values.astype("float32"),
                     {"units": "mm/day"}),
        },
        coords={"time": mera_rain.time.values, "lat": LAT, "lon": LON},
        attrs={"source": "MERA analysis (NCMRWF/MoES), high-res, regridded to 0.25deg"},
    )

    path = DATA_DIR / "mera_obs.nc"
    mera.to_netcdf(path)
    print(f"  Saved {path}  ({len(mera_rain.time)} days)")

print("Done. Use load('imdaa_obs') and load('mera_obs')")
