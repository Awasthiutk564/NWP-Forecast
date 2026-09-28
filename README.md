#EktaCast — Adaptive AI Blending of Weather Forecasts

**Smart India Hackathon 2026 · Team ZeroPing · Problem statement SIH26081**
*Hybrid AI–NWP Multi-Model Forecast Blending System (NCMRWF, Ministry of Earth Sciences) · Theme: Disaster Management*

EktaCast combines several forecast sources into one better forecast. For every
grid point, every lead day (1–5) and every variable (rainfall, maximum temperature),
it learns how much to trust each source, then turns the blended forecast into
next-day district alerts for Andhra Pradesh and Telangana in **English and Telugu**.

Everything is built on Indian data: IMD gridded observations, NCMRWF reanalyses
(IMDAA, MERA) and LGD district boundaries.

---

## Results (test year 2023, never seen during training or calibration)

**Honest time split:** ML models trained on **2010–2021** · blend weights and alert
calibration learned on **2022** · everything scored on **2023**.

**Rainfall, RMSE (mm/day), lower is better**

| Source      | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|-------------|------:|------:|------:|------:|------:|
| **BLEND**   | 8.43  | 8.94  | **9.13** | 9.20 | 9.20 |
| LightGBM    | **8.21** | **8.89** | 9.14 | 9.20 | 9.21 |
| Ridge       | 8.69  | 9.07  | 9.23  | 9.27  | 9.29  |
| Climatology | 9.17  | 9.17  | 9.17  | **9.17** | **9.17** |
| Persistence | 11.05 | 11.98 | 12.53 | 12.76 | 12.69 |

**Maximum temperature, RMSE (°C), lower is better**

| Source      | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|-------------|------:|------:|------:|------:|------:|
| **BLEND**   | **1.01** | **1.40** | **1.61** | **1.72** | **1.78** |
| LightGBM    | 1.01  | 1.42  | 1.64  | 1.75  | 1.82  |
| Ridge       | 1.03  | 1.46  | 1.72  | 1.86  | 1.95  |
| Persistence | 1.06  | 1.54  | 1.85  | 2.04  | 2.16  |
| Climatology | 2.06  | 2.06  | 2.06  | 2.06  | 2.06  |

- **Max temperature:** BLEND is the best forecast at all 5 lead days, and has the highest correlation at every lead.
- **Rainfall:** BLEND is best at day 3 and within 0.5% of the best at days 2, 4 and 5. LightGBM is 2.7% better at day 1.
- Full scorecard (RMSE, bias, correlation): `data/full_scores.csv`.

**Next-day district alerts (district-days, 2023)**

| | Raw IMD rules | Calibrated on 2022 |
|---|---|---|
| Heatwave | POD 0.32 · FAR 0.17 · CSI 0.30 | **POD 0.90 · FAR 0.46 · CSI 0.51** (+1.0 °C) |
| Heavy rain | POD 0.01 · FAR 0.80 · CSI 0.01 | **POD 0.29 · FAR 0.71 · CSI 0.17** (25 mm trigger) |

POD = share of real events warned about · FAR = share of warnings that did not happen ·
CSI = hits / (hits + misses + false alarms). Source: `data/alert_scores.csv`.

**Case study: Cyclone Michaung.** The forecast issued on 3 Dec 2023 flagged heavy rain
on 4 Dec for Tirupati, Chittoor, Spsr Nellore and Annamayya. The location was right,
but the amount was too low (blend maximum 44 mm vs 244 mm observed): blending smooths
extremes, which is why alerts use a calibrated trigger.

---

## How it works

```
IMD observations (rain, Tmax)        NCMRWF reanalyses (IMDAA, MERA)
                │                        (ingested; not yet used by the models)
      common data format, AP & Telangana 0.25° grid
                │
   Persistence · Climatology · LightGBM · Ridge      (forecast sources)
                │
   Adaptive blender: weight ∝ 1 / MSE², per grid point × lead day
                │
   Blended forecast (days 1–5)  ──►  next-day district alerts (English + Telugu)
                │
   Verification against IMD observations on 2023
```

- **Sources.** Persistence ("like today") and climatology (day-of-year average over 2010–2021) are baselines. LightGBM and Ridge regression use the last 5 days of rain and Tmax (including the forecast day itself), day of year, latitude and longitude.
- **Blender.** For each grid point and lead day, a source's weight is proportional to 1 / (its 2022 mean squared error)². A source with no value at a point is skipped. Weights are saved in `data/blend_weights.nc`.
- **Alerts.** IMD thresholds: heavy rain 64.5 / 115.6 / 204.5 mm (yellow / orange / red); heatwave for plains (≥ 40 °C and ≥ 4.5 °C above normal, or ≥ 45 °C; severe: ≥ 6.5 °C above normal or ≥ 47 °C). Because the blend smooths extremes, the forecast is first calibrated on 2022 (rain scaled so a 25 mm blend value maps to 64.5 mm; +1.0 °C for Tmax). Alerts are issued for **day 1 only**, where verification shows skill. Orange and red rain levels are scaled from the yellow trigger, because there are too few very heavy events to verify them separately.

---

## Repository layout

```
NWP-Forecast/
├── sources/
│   ├── common.py          # grid, data contract, load() / save()
│   ├── make_dummy.py      # fake data in the contract format, for testing
│   ├── fetch_imd.py       # IMD gridded rain + Tmax via imdlib -> data/imd_obs.nc
│   ├── fetch_ncmrwf.py    # converts IMDAA + MERA downloads
│   ├── baselines.py       # persistence + climatology forecasts
│   ├── train_models.py    # LightGBM + Ridge forecasts
│   ├── blend.py           # adaptive blender -> blend_forecast, blend_weights, blend_scores
│   ├── verify_alerts.py   # alert verification + 2022 calibration -> alert_triggers, alert_scores
│   └── alerts.py          # district alerts (English + Telugu) -> data/alerts.csv
├── verify/
│   ├── scores.py          # RMSE, bias, correlation -> data/full_scores.csv
│   ├── make_figures.py    # charts -> slides/figures/
│   └── mera_check.py      # MERA cross-check (see limitations)
├── dashboard/             # Streamlit app: forecast map, weight maps, skill scorecard, alerts
├── tools/make_districts.py  # builds data/districts_ap_ts.geojson (LGD boundaries)
├── data/                  # CSV + GeoJSON in Git; real .nc files are on the team Drive
├── models/                # saved LightGBM models
├── slides/figures/        # presentation charts
└── requirements.txt
```

Not in Git (too large or private): `raw_imd/`, `raw_imdaa/`, `raw_mera/`, real `data/*.nc` files, `venv/`, `.env`.

---

## Setup

You need **Python 3.10 or newer** and **Git**. Conda is not needed.

```
git clone https://github.com/Awasthiutk564/NWP-Forecast.git
cd NWP-Forecast
python -m venv venv
```

Activate the environment (do this again every time you open a new terminal):
- Windows (PowerShell): `.\venv\Scripts\Activate.ps1`
- Linux / macOS: `source venv/bin/activate`

Install the libraries:
```
pip install -r requirements.txt
pip install dask lightgbm scikit-learn geopandas streamlit plotly pyarrow matplotlib
```

Check that it works:
```
python -c "from sources.common import load; print(load('dummy_obs'))"
```

Always run scripts **from the repository root** as modules, e.g. `python -m sources.blend`
(not `python sources/blend.py`).

---

## Getting the data

**Option A (fastest):** copy all `.nc` files from the team Google Drive into `data/`.

> Team Drive link: https://drive.google.com/drive/folders/1UW1yGNa8kwh2jO6LZdWfFV_bC2Pn3CgE

**Option B (rebuild from scratch):**
1. `python -m sources.fetch_imd` downloads IMD data for 2010–2023. The IMD server can be slow; if it times out, run it again (finished years are skipped).
2. IMDAA and MERA come from the NCMRWF portal (https://rds.ncmrwf.gov.in, free registration). Download NetCDF4 zips for North 20, South 12, East 85, West 76, unzip into `raw_imdaa/` and `raw_mera/`, then run `python -m sources.fetch_ncmrwf`.

## Run the full pipeline (in this order)

```
python -m sources.baselines        # persistence + climatology
python -m sources.train_models     # LightGBM + Ridge
python -m sources.blend            # blend, weights, blend_scores.csv
python -m sources.verify_alerts    # alert scores + 2022 calibration
python -m sources.alerts           # data/alerts.csv
python -m verify.scores            # data/full_scores.csv
python -m verify.make_figures      # slides/figures/*.png
```

## Dashboard

```
streamlit run dashboard/app.py
```

Pages: Forecast map, Weight maps, Skill scorecard, Alerts.

---

## Data contract

- Grid: lat 12–20°N, lon 76–85°E, 0.25° (33 × 37 points).
- Observations: dims `(time, lat, lon)`, variables `rain` (mm/day) and `tmax` (°C).
- Forecasts: dims `(init_time, lead, lat, lon)`, lead 1–5 days. A forecast at `init_time` T and lead L is **for the date T + L days**.
- `data/alerts.csv` (UTF-8): `init_date, valid_date, lead, district, state, hazard, level, value, message_en, message_te`. District names must match `data/districts_ap_ts.geojson` exactly.

```python
from sources.common import load

obs   = load("imd_obs")          # observations
blend = load("blend_forecast")   # final forecast
w     = load("blend_weights")    # weight maps, dims (source, lead, lat, lon)

blend["rain"].isel(init_time=0).sel(lead=1)   # day-1 rain for the first init date
```

## Adding a new forecast source (e.g. NCMRWF NCUM or NEPS)

1. Write a converter in `sources/` that saves the forecast in the contract format with `save(ds, "ncum_forecast", kind="forecast")`.
2. Add the file name to `SOURCES` and a short name to `NAMES` in `sources/blend.py`.
3. Re-run the pipeline from `blend` onwards. The blender learns the new source's weights automatically.

---

## Limitations and next steps

- **No NWP forecasts in the blend yet.** The current sources are two baselines and two ML models trained on IMD data. Adding NCMRWF operational forecasts (NCUM, NEPS) as extra sources is the main next step.
- **Blend weights come from one year (2022).** More years would make them more stable.
- **Extremes are smoothed.** Blending under-forecasts peak rainfall (Cyclone Michaung: 44 vs 244 mm), so heavy-rain alerts rely on a calibrated trigger and have many false alarms.
- **Alerts are next-day only.** Longer-lead alerts did not verify well on 2023.
- **Heat alerts use the IMD plains criteria only;** coastal and hill criteria are not yet included.
- **MERA:** only the 00:00 hour was downloaded per day, so the files likely hold one hour of rain, not a daily total. MERA is ingested but kept out of the reported results.
- **IMDAA** covers only June–August 2020 in this download and is not yet used by the models.

---

## Data sources and credits

| Dataset | Provider | Used for |
|---|---|---|
| IMD gridded rainfall (0.25°) and Tmax | India Meteorological Department, Pune (via `imdlib`) | Training data and ground truth |
| IMDAA daily reanalysis | NCMRWF, MoES · CC-BY · DOI 10.64349/nmrf.rds.imdaa.50514 | Ingested reference data |
| MERA rainfall analysis | NCMRWF, MoES · CC-BY · DOI 10.64349/nmrf.rds.mera.50519 | Ingested reference data |
| District boundaries | Local Government Directory (LGD), Government of India | Alerts and maps |

Method background: Krishnamurti et al. (1999), *Science* (multi-model superensemble);
Raftery et al. (2005), *Monthly Weather Review* (Bayesian model averaging);
Pai et al. (2014), *MAUSAM* (IMD gridded rainfall); Ke et al. (2017), NeurIPS (LightGBM).

## Team ZeroPing

- **P1:** data pipeline, NCMRWF data, baselines, alerts and alert verification
- **P2:** LightGBM and Ridge models, adaptive blender
- **P3:** verification scorecard and presentation figures
- **P4:** district boundaries and dashboard
- **P5:** presentation
Added tools in to main branch for further usage from the collaborators.
