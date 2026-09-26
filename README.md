# NWP HYBRID: AI Multi-Model Forecast Blending

**Smart India Hackathon 2026, problem statement SIH26081**
Hybrid AI–NWP multi-model forecast blending (NCMRWF, Ministry of Earth Sciences)

We take several forecast sources for Andhra Pradesh and Telangana, measure how accurate each one is at every grid point and lead day, and blend them into a single forecast that is better than any individual source. Every dataset comes from Indian government sources (IMD, NCMRWF).

---

## Results (test year 2023)

Root-mean-square error, lower is better. ML models trained on 2020–2021, blend weights learned on 2022, everything tested on 2023.

**Rainfall (mm/day)**

| Source      | Lead 1 | Lead 2 | Lead 3 | Lead 4 | Lead 5 |
|-------------|-------:|-------:|-------:|-------:|-------:|
| **BLEND**   | 8.55   | **9.10** | **9.20** | **9.25** | **9.24** |
| LightGBM    | **8.52** | 9.73 | 9.55   | 9.53   | 9.52   |
| Ridge       | 8.72   | 9.14   | 9.28   | 9.32   | 9.33   |
| Climatology | 9.32   | 9.32   | 9.32   | 9.32   | 9.32   |
| Persistence | 11.05  | 11.98  | 12.53  | 12.76  | 12.69  |

**Maximum temperature (°C)**

| Source      | Lead 1 | Lead 2 | Lead 3 | Lead 4 | Lead 5 |
|-------------|-------:|-------:|-------:|-------:|-------:|
| **BLEND**   | 1.04   | 1.48   | **1.71** | **1.83** | **1.89** |
| Ridge       | **1.04** | **1.47** | 1.72 | 1.87   | 1.96   |
| LightGBM    | 1.20   | 1.66   | 1.95   | 2.06   | 2.13   |
| Persistence | 1.06   | 1.54   | 1.85   | 2.04   | 2.16   |
| Climatology | 2.22   | 2.21   | 2.21   | 2.21   | 2.21   |

The blend is the best or within 0.5% of the best at every lead time, while every individual source has at least one lead time where it clearly falls behind.

---

## Data sources (all Made in India)

| Dataset | Provider | Used for | How we get it |
|---|---|---|---|
| IMD gridded rainfall (0.25°) and Tmax | India Meteorological Department, Pune | Ground truth, training data | Automatic via `imdlib`, no login |
| IMDAA daily reanalysis (12 km) | NCMRWF, MoES | Extra reference data | [rds.ncmrwf.gov.in](https://rds.ncmrwf.gov.in), free registration. DOI: 10.64349/nmrf.rds.imdaa.50514 |
| MERA rainfall analysis | NCMRWF, MoES | Extra reference data | [rds.ncmrwf.gov.in](https://rds.ncmrwf.gov.in), free registration. DOI: 10.64349/nmrf.rds.mera.50519 |

---

## Repository layout

```
NWP-Forecast/
├── sources/
│   ├── common.py        # shared grid, data format checks, load() and save()
│   ├── make_dummy.py    # fake data in the team format, for testing
│   ├── fetch_imd.py     # downloads IMD observations -> data/imd_obs.nc
│   ├── fetch_ncmrwf.py  # converts IMDAA + MERA downloads -> data/imdaa_obs.nc, data/mera_obs.nc
│   ├── baselines.py     # persistence + climatology forecasts
│   ├── train_models.py  # LightGBM + Ridge forecasts
│   └── blend.py         # combines all sources -> final blended forecast
├── data/                # .nc files (only dummy_*.nc are in Git; real files are on Drive)
├── models/              # saved LightGBM models
├── requirements.txt
└── README.md
```

Not in Git (too large or private): `raw_imd/`, `raw_imdaa/`, `raw_mera/`, real `data/*.nc` files, `venv/`, `.env`.

---

## Setup

You need **Python 3.10 or newer** and **Git**. You don't need conda.

**1. Clone the repo**
```
git clone https://github.com/Awasthiutk564/NWP-Forecast.git
cd NWP-Forecast
```

**2. Create and activate a virtual environment**

Windows (PowerShell):
```
python -m venv venv
.\venv\Scripts\Activate.ps1
```

Linux / macOS:
```
python3 -m venv venv
source venv/bin/activate
```

Your terminal line should now start with `(venv)`. **Activate it again every time you open a new terminal.**

**3. Install the libraries**
```
pip install -r requirements.txt
pip install dask lightgbm scikit-learn
```

**4. Check that it works**
```
python -c "from sources.common import load; print(load('dummy_obs'))"
```
If this prints a dataset summary, you're ready.

---

## Getting the data

**Option A: download from the team Drive (fastest).**
Copy all `.nc` files and `blend_scores.csv` from the team Google Drive folder into `data/`.

> Team Drive link: *(add link here)*

**Option B: regenerate everything yourself.**
Run the steps below in order. Each step uses the output of the one before.

```
python -m sources.fetch_imd        # 1. IMD observations (slow: downloads from IMD)
python -m sources.baselines        # 2. persistence + climatology
python -m sources.train_models     # 3. LightGBM + Ridge (about 5–10 minutes)
python -m sources.blend            # 4. final blend + weights + scores
```

Optional, for the NCMRWF reference data: download IMDAA and MERA from the portal (see the table above) as NetCDF4 zips for the box North 20, South 12, East 85, West 76. Unzip them into `raw_imdaa/` and `raw_mera/`, then run:
```
python -m sources.fetch_ncmrwf
```

---

## Using the data in your own code

Everyone loads data the same way:

```python
from sources.common import load

obs    = load("imd_obs")          # observations
blend  = load("blend_forecast")   # final forecast
w      = load("blend_weights")    # blend weight maps

# Example: blended rain forecast for lead day 1, first init date
blend["rain"].isel(init_time=0).sel(lead=1)
```

### The data format (every file follows this)

| File type | Dimensions | Variables |
|---|---|---|
| Observations (`imd_obs`, `imdaa_obs`, `mera_obs`) | `(time, lat, lon)` | `rain` [mm/day], `tmax` [°C] (MERA has rain only) |
| Forecasts (`persistence`, `climatology`, `lgbm_forecast`, `linreg_forecast`, `blend_forecast`) | `(init_time, lead, lat, lon)` | `rain` [mm/day], `tmax` [°C] |
| Weights (`blend_weights`) | `(source, lead, lat, lon)` | `rain`, `tmax` (sum to 1 over sources) |

- **Grid:** lat 12.0–20.0 °N, lon 76.0–85.0 °E, 0.25° spacing (33 × 37 points)
- **`lead`:** 1 to 5 days ahead. The forecast for `init_time` T and `lead` L is for date T + L days.
- **Sea points:** NaN

Any new forecast source must be saved with `save(ds, name, kind="forecast")` from `sources.common`. It checks the format and refuses to save if something is wrong.

---

## How the blend works

1. **Split the years three ways.** ML models train on 2020–2021, blend weights are learned on 2022 (a year the models never saw), and everything is tested on 2023.
2. **Measure errors.** For every grid point, lead day and variable, compute each source's mean squared error during 2022.
3. **Weight by accuracy.** Each source gets weight = 1 / error², normalised so the weights add up to 1. More accurate sources get more say.
4. **Blend.** The final forecast is the weighted average of all sources.

The learned weights are physically sensible. For temperature, persistence gets the most weight at lead 1 (yesterday is a good guide to tomorrow), while climatology dominates at lead 5 (at longer range, the usual weather for the date is the safest bet).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `conda is not recognized` | You don't need conda. Use the `python -m venv` steps above. |
| `running scripts is disabled on this system` (Windows) | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| `.\venv\Scripts\Activate.ps1: command not found` (Linux) | On Linux use `source venv/bin/activate`. |
| `No module named 'xarray'` | Your venv isn't active. Activate it first. |
| `can't open file 'blend.py'` | Run scripts as modules from the repo root: `python -m sources.blend` |
| `chunk manager 'dask' is not available` | `pip install dask` |
| `Connection to imdpune.gov.in timed out` | IMD's server is down or slow. Try again later, or on a mobile hotspot. |
| `git pull`: *untracked working tree files would be overwritten* | Delete the listed files (e.g. `rm sources/blend.py`), then `git pull` again. |
| `git pull`: *your local changes would be overwritten* | `git checkout -- sources/` then `git pull` (discards your local edits). |
| Changes don't show up on GitHub | Only files you `git add` are pushed. Large `.nc` files are ignored on purpose; share them on Drive. |

---

## Team

| Role | Responsibility |
|---|---|
| P1 | Data access, data format, IMD/NCMRWF converters, baselines, alerts |
| P2 | ML models (LightGBM, Ridge) and the blender |
| P3 | Verification: RMSE, bias, correlation, heavy-rain CSI |
| P4 | District boundaries and the Streamlit dashboard |
| P5 | *(add)* |

## In progress

- Extending IMD history to 2010–2023 for more training data
- `data/alerts.csv`: district heavy-rain and heatwave alerts in English and Telugu
- Streamlit dashboard: forecast map, weight maps, skill scorecard, alerts
