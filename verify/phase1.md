# Phase 1 — Setup (P3, verification & slides)

SIH 2026 · SIH26081 · NCMRWF/MoES forecast blending
Status: **done** (2026-09-26)

## Goal
Get a working Python environment and the folders needed for verification
(scoring) and slide figures. No data analysis in this phase.

## What was done
1. **Checked the repo.** There is no `CLAUDE.md`; `README.md` and the task
   instructions are the reference. Data files are already in `data/`.
2. **Created a virtual environment** at `venv/` (Python 3.13.14).
   `venv/` is already in `.gitignore`, so it is not committed.
3. **Installed packages:** everything in `requirements.txt`
   (xarray, netCDF4, numpy, pandas, imdlib, geopandas, streamlit, plotly,
   pyarrow, dask) plus `dask matplotlib pandas geopandas`.
   Import check passed: xarray 2026.7.0, matplotlib 3.11.2, geopandas 1.1.4.
4. **Created new files and folders:**
   - `verify/__init__.py` (empty), which makes `verify` a package so
     `python -m verify.<script>` works
   - `slides/figures/`, the output folder for the presentation charts

## Not changed
- No existing files were edited (`sources/`, `data/`, `dashboard/`, etc.).
- No git commits or pushes.
- The untracked `dataset/` folder was left alone.

## How to reproduce (PowerShell)
```powershell
cd "E:\wheather forcast\NWP-Forecast"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install dask matplotlib pandas geopandas
```
If activation fails with "running scripts is disabled", run this once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Notes for later phases
- District boundary files already exist in `data/`:
  `districts_ap_ts.geojson`, `LGD_Districts.parquet`, `SOI_Districts.parquet`.
  One of these can be drawn on the Michaung case map (Phase 4e).

## Next: Phase 2, inspect the data
Write `verify/check_data.py` to open each dataset with
`sources.common.load(name)` and print its variables, time or init_time
range, the lead values and dtype, and the source names in `blend_weights`.
This step only reads the data and changes nothing.
