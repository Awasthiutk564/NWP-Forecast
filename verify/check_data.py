"""
check_data.py  -  P3: look inside every dataset before scoring (read-only).

Run:
    python -m verify.check_data
"""
import numpy as np
import pandas as pd

from sources.common import load

NAMES = ["imd_obs", "persistence", "climatology", "lgbm_forecast",
         "linreg_forecast", "blend_forecast", "blend_weights"]


def date_range(ds, dim):
    t = pd.to_datetime(ds[dim].values)
    return f"{t.min().date()} -> {t.max().date()}  ({len(t)} steps)"


for name in NAMES:
    ds = load(name)
    print("=" * 78)
    print(f"{name}")
    print("=" * 78)
    print(ds)
    print()
    for dim in ("time", "init_time"):
        if dim in ds.dims:
            print(f"  {dim:10s}: {date_range(ds, dim)}")
    if "lead" in ds.coords:
        print(f"  lead      : {list(ds.lead.values)}  dtype={ds.lead.dtype}"
              f"  units={ds.lead.attrs.get('units', '-')}")
    if "source" in ds.coords:
        print(f"  sources   : {list(ds.source.values)}")
    for v in ds.data_vars:
        a = ds[v].values
        nan_pct = 100 * np.isnan(a).mean()
        print(f"  var {v:6s}: dims={ds[v].dims} dtype={a.dtype} "
              f"min={np.nanmin(a):.2f} max={np.nanmax(a):.2f} "
              f"mean={np.nanmean(a):.2f} NaN={nan_pct:.1f}%")
    print()
    ds.close()
