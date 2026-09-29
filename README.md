# EdgeCast — Adaptive AI Blending of Weather Forecasts

**Smart India Hackathon 2026 · Team ZeroPing · Problem statement SIH26081**
*Hybrid AI–NWP Multi-Model Forecast Blending System (NCMRWF, Ministry of Earth Sciences) · Theme: Disaster Management*

EdgeCast combines several forecast sources, including machine-learning models and
NCMRWF's physical S2S model, into one better forecast. For every grid point, every
lead day (1–5) and every variable (rainfall, maximum temperature, 10 m wind), it
learns how much to trust each source. It then turns the blended forecast into
next-day district alerts for the 59 districts of Andhra Pradesh and Telangana, in
**English and Telugu**, and presents everything on an interactive 3-D website.

Everything is built on Indian data: IMD gridded observations, NCMRWF forecasts and
reanalyses (S2S, IMDAA, MERA) and LGD district boundaries.

---

## Results

Two systems are scored, each on years it never saw:

| System | Sources | ML trained on | Weights learned on | Tested on |
|---|---|---|---|---|
| **Main (AI blend)** | Persistence, Climatology, LightGBM, Ridge | 2010–2021 | 2022 | **2023** |
| **Hybrid AI–NWP** | the four above **+ NCMRWF S2S** | 2016–2023 | 2010–2012 | **2013–2015** |

### Main system: rainfall RMSE (mm/day), test year 2023, lower is better

| Source      | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|-------------|------:|------:|------:|------:|------:|
| **BLEND**   | 8.43  | 8.94  | **9.13** | 9.20 | 9.20 |
| LightGBM    | **8.21** | **8.89** | 9.14 | 9.20 | 9.21 |
| Ridge       | 8.69  | 9.07  | 9.23  | 9.27  | 9.28  |
| Climatology | 9.17  | 9.17  | 9.17  | **9.17** | **9.17** |
| Persistence | 11.05 | 11.98 | 12.53 | 12.76 | 12.69 |

### Main system: maximum temperature RMSE (°C), test year 2023

| Source      | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|-------------|------:|------:|------:|------:|------:|
| **BLEND**   | **1.00** | **1.40** | **1.61** | **1.72** | **1.78** |
| LightGBM    | 1.01  | 1.42  | 1.64  | 1.75  | 1.82  |
| Ridge       | 1.03  | 1.46  | 1.72  | 1.86  | 1.95  |
| Persistence | 1.06  | 1.54  | 1.85  | 2.04  | 2.16  |
| Climatology | 2.06  | 2.06  | 2.06  | 2.06  | 2.06  |

- **Max temperature:** BLEND is the best forecast at all 5 lead days, with the highest correlation at every lead.
- **Rainfall:** BLEND is best at day 3 and within 0.5% of the best at days 2, 4 and 5. LightGBM is 2.5% better at day 1.
- Full scorecard (RMSE, bias, correlation): `data/full_scores.csv`.

### Hybrid AI–NWP system (with NCMRWF S2S), test years 2013–2015

| RMSE | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---:|---:|---:|---:|---:|
| Rain, BLEND (mm/day) | 7.79 | 7.75 | **6.63** | **6.34** | 6.90 |
| Rain, best single source | 7.65 LGBM | 7.74 LGBM | 6.70 LGBM | 6.38 Ridge | 6.78 S2S |
| Tmax, BLEND (°C) | 0.76 | **1.28** | **1.36** | **1.36** | **1.42** |
| Tmax, best single source | 0.73 LGBM | 1.29 LGBM | 1.44 Ridge | 1.43 Ridge | 1.52 Ridge |
| **10 m wind, BLEND (m/s)** | **0.95** | **0.97** | **1.17** | **1.23** | **1.22** |
| 10 m wind, best single source | 1.16 S2S | 1.16 S2S | 1.33 S2S | 1.36 S2S | 1.43 Clim |

- Adding the physical S2S model makes the blend best for Tmax at days 2–5 and for rain at days 3–4.
- **Wind:** the blend beats every single source at all 5 lead days, by 9–18%.
- Sources: `data/blend_scores_hybrid.csv`, `data/wind_scores.csv`.

### Next-day district alerts (district-days, 2023)

| | Raw IMD rules | Calibrated on 2022 |
|---|---|---|
| Heatwave | POD 0.32 · FAR 0.17 · CSI 0.30 | **POD 0.90 · FAR 0.46 · CSI 0.51** (+1.0 °C) |
| Heavy rain | POD 0.01 · FAR 0.80 · CSI 0.01 | **POD 0.29 · FAR 0.71 · CSI 0.17** (25 mm trigger) |

POD = share of real events warned about · FAR = share of warnings that did not happen ·
CSI = hits / (hits + misses + false alarms). Source: `data/alert_scores.csv`.
647 alerts were issued for 2023 (`data/alerts.csv`).

High-wind alerts (hybrid system, IMD coastal thresholds) are still weak: the yellow
level (≥ 10.8 m/s) scores POD 0.10 · FAR 0.89 · CSI 0.05, and no orange or red wind
events occurred in the test years (`data/wind_alert_scores.csv`).

### Adaptive-weighting experiments (weights by season and weather regime)

| Experiment | Idea | Result on 2023 |
|---|---|---|
| Season-aware (`blend_season.py`) | separate weights per IMD season | no clear gain (within ±0.2% of the all-year blend) |
| Regime-aware (`blend_regime.py`) | separate weights for wet and dry days (area rain ≥ 5 mm on the issue day) | small gain: Tmax better at every lead, rain up to 0.5% better on wet days |

Sources: `data/blend_scores_by_season.csv`, `data/blend_scores_regime.csv`.

### Case study: Cyclone Michaung

The forecast issued on 3 Dec 2023 flagged heavy rain on 4 Dec for Tirupati, Chittoor,
Spsr Nellore and Annamayya. The location was right but the amount was too low (BLEND
maximum 42.7 mm vs 244 mm observed): blending smooths extremes, which is why alerts
use a calibrated trigger.

---

## How it works

```
IMD observations (rain, Tmax)      NCMRWF S2S forecasts       IMDAA 10 m wind
                │                            │                        │
          common data format · Andhra Pradesh & Telangana 0.25° grid (33 × 37)
                │
   Persistence · Climatology · LightGBM · Ridge · S2S NWP        (forecast sources)
                │
   Adaptive blender: weight ∝ 1 / MSE², per grid point × lead day
                    (optional: × season, × wet/dry regime)
                │
   Blended forecast: rain, Tmax, wind · days 1–5
                │
   ├──► next-day district alerts (59 districts, English + Telugu)
   ├──► verification against IMD / IMDAA on unseen years
   └──► JSON export ──► EdgeCast website (React + Three.js) · FastAPI + chatbot
```

- **Sources.** Persistence ("like today") and climatology (day-of-year average) are baselines. LightGBM and Ridge regression use the last 5 days of rain and Tmax, day of year, latitude and longitude. **S2S** is NCMRWF's physical Unified Model reforecast. Its 925 hPa temperature is turned into surface Tmax with a leave-one-year-out MOS correction (`s2s_mos.py`).
- **Blender.** For each grid point and lead day, a source's weight is proportional to 1 / (its mean squared error on the weight-learning years)². A source with no value at a point is skipped. Weights are saved in `data/blend_weights*.nc`.
- **Alerts.** IMD thresholds: heavy rain 64.5 / 115.6 / 204.5 mm (yellow / orange / red); heatwave for plains (≥ 40 °C and ≥ 4.5 °C above normal, or ≥ 45 °C; severe: ≥ 6.5 °C above normal or ≥ 47 °C). Because the blend smooths extremes, the forecast is first calibrated on 2022 (rain scaled so a 25 mm blend value maps to 64.5 mm; +1.0 °C for Tmax). Alerts are issued for **day 1 only**, where verification shows skill.

---

## Website (EdgeCast)

An interactive 3-D website in `website/` that shows all results. It is built with
**React, TypeScript, Vite, Framer Motion and Three.js (React Three Fiber)**.

- **3-D Forecast Explorer:** real 2023 days (Cyclone Michaung, monsoon peaks, heatwaves) as 3-D columns; compare every source and lead day with IMD observations.
- **Verification console:** RMSE, bias and correlation for the main and hybrid systems, including wind.
- **Method:** data timeline, per-city blend weights, learned weight maps, alert calibration.
- **District alerts:** 2023 alert timeline, district map and messages in English / Telugu.
- **Models:** all 20 LightGBM models with feature importance and downloads; presentation figures.
- **Megha Mitra (మేఘ మిత్ర):** a rule-based weather chatbot that answers district forecast questions in English, Telugu and Hindi. It needs `api_server.py` running.

```
cd website
npm install
npm run dev                            # http://localhost:5173
```

After re-running the pipeline, refresh the website's data with
`python website/scripts/export_data.py` (from the repo root). Details: [website/README.md](website/README.md).

### API server (for the chatbot and `web-dashboard/`)

```
python api_server.py                   # FastAPI on http://localhost:8000
```

Endpoints include `/api/summary`, `/api/scores`, `/api/alerts`, `/api/forecast/map`,
`/api/weights`, `/api/districts`, `/api/forecast/district` and `/api/chat`.

### Other dashboards

- `web-dashboard/`: a Next.js dashboard (live map, alerts, scores, weights) that reads from `api_server.py`. Run with `npm install && npm run dev`.
- `dashboard/app.py`: the original Streamlit prototype (`streamlit run dashboard/app.py`).

---

## Repository layout

```
NWP-Forecast/
├── run_pipeline.py        # one command runs the whole system (see below)
├── api_server.py          # FastAPI: JSON endpoints + Megha Mitra chatbot
├── make_blend_data.py     # quick demo blend files from dummy data (no IMD download needed)
├── sources/
│   ├── common.py          # grid, data contract, load() / save()
│   ├── fetch_imd.py       # IMD gridded rain + Tmax via imdlib -> data/imd_obs.nc
│   ├── fetch_ncmrwf.py    # converts IMDAA + MERA downloads
│   ├── fetch_s2s.py       # converts NCMRWF S2S reforecasts -> data/s2s_raw.nc
│   ├── fetch_imdaa_wind.py# IMDAA 10 m wind (wind truth) -> data/imdaa_wind_obs.nc
│   ├── s2s_mos.py         # S2S 925 hPa T -> surface Tmax (MOS) -> data/s2s_forecast.nc
│   ├── baselines.py       # persistence + climatology  (baselines_hybrid.py: 2016–23)
│   ├── train_models.py    # LightGBM + Ridge           (train_models_hybrid.py: 2016–23)
│   ├── blend.py           # main adaptive blender -> blend_forecast, blend_weights, blend_scores
│   ├── blend_hybrid.py    # Hybrid AI–NWP blend with S2S (test 2013–15)
│   ├── blend_wind.py      # wind blend + high-wind alerts
│   ├── blend_season.py    # season-aware weights (experiment)
│   ├── blend_regime.py    # wet/dry regime-aware weights (experiment)
│   ├── verify_alerts.py   # alert verification + 2022 calibration
│   ├── alerts.py          # district alerts (English + Telugu) -> data/alerts.csv
│   └── make_dummy.py      # fake data in the contract format, for testing
├── verify/                # scorecard, figures, MERA cross-check, written summaries
├── website/               # EdgeCast website (React + Three.js)
├── web-dashboard/         # Next.js dashboard (uses api_server.py)
├── dashboard/             # original Streamlit prototype
├── tools/                 # district boundary builders and inspectors
├── data/                  # CSV + GeoJSON in Git; real .nc files are on the team Drive
├── models/                # saved LightGBM models (main + hybrid, rain + Tmax, lead 1–5)
├── slides/                # presentation figures, website screenshots, presentation notes
└── requirements.txt
```

Not in Git (too large or private): `raw_imd/`, `raw_mera/`, `raw_s2s/`, `raw_imdaa_wind/`,
real `data/*.nc` files, `venv/`, `.env`, `node_modules/`.

---

## Setup

You need **Python 3.10 or newer** and **Git**. The website also needs **Node.js 20 or newer**.

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
2. IMDAA, MERA and S2S come from the NCMRWF portal (https://rds.ncmrwf.gov.in, free registration). Download NetCDF4 files for North 20, South 12, East 85, West 76 into `raw_imdaa/`, `raw_mera/`, `raw_s2s/` and `raw_imdaa_wind/`, then run `fetch_ncmrwf`, `fetch_s2s` and `fetch_imdaa_wind`.

## Run the pipeline

One command runs every stage in order and stops on the first failure:

```
python -m run_pipeline              # main AI blend (test year 2023)
python -m run_pipeline --hybrid     # Hybrid AI–NWP blend with S2S (test 2013–2015)
python -m run_pipeline --all        # both, plus the season-aware blend
python -m run_pipeline --fetch      # re-download IMD data first (slow)
```

Or stage by stage (main system):

```
python -m sources.baselines        # persistence + climatology
python -m sources.train_models     # LightGBM + Ridge
python -m sources.blend            # blend, weights, blend_scores.csv
python -m sources.verify_alerts    # alert scores + 2022 calibration
python -m sources.alerts           # data/alerts.csv
python -m verify.scores            # data/full_scores.csv
python -m verify.make_figures      # slides/figures/*.png
```

Extras: `python -m sources.blend_wind` (wind + high-wind alerts) and
`python -m sources.blend_regime` (regime-aware experiment).

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
2. Add the file name to `SOURCES` and a short name to `NAMES` in `sources/blend.py` (or `blend_hybrid.py`).
3. Re-run the pipeline from `blend` onwards. The blender learns the new source's weights automatically.

---

## Limitations

- **Operational NWP not yet in the 2023 blend.** The physical S2S model is included only in the hybrid system (2010–2015), where the reforecast archive exists.
- **Blend weights come from few years** (2022 for the main system, 2010–2012 for the hybrid one). More years would make them steadier.
- **Extremes are smoothed.** Blending under-forecasts peak rainfall (Cyclone Michaung: 42.7 vs 244 mm), so heavy-rain alerts rely on a calibrated trigger and have many false alarms.
- **Alerts are next-day only.** Longer-lead alerts did not verify well on 2023.
- **Heat alerts use the IMD plains criteria only;** coastal and hill criteria are not yet included.
- **High-wind alerts are weak** (CSI 0.05), and there were too few strong-wind events to verify orange and red levels.
- **MERA:** only the 00:00 hour was downloaded per day, so it is kept out of the reported results (cross-check only). **IMDAA rain** covers June–August 2020 in this download.

## Future work

- Add NCMRWF's operational **NCUM-G and NEPS-G** forecasts as blend sources.
- Learn weights from more years and shrink them toward equal weights where data is thin.
- Scale from Andhra Pradesh and Telangana to the **full IMD grid for India**.
- Deliver district alerts by **SMS and WhatsApp** through State Disaster Management Authorities.
- **Agromet advisories** for farmers, built on the blended forecast.

---

## Tech stack

| Layer | Tools |
|---|---|
| Data | Python, xarray, pandas, NumPy, NetCDF, imdlib |
| AI / ML | LightGBM, scikit-learn (Ridge), custom adaptive blender |
| Geospatial | GeoPandas, LGD district boundaries |
| Website | React, TypeScript, Vite, Framer Motion, Three.js (React Three Fiber) |
| API + chatbot | FastAPI, uvicorn |
| Other dashboards | Next.js + Recharts (`web-dashboard/`), Streamlit + Plotly (prototype) |
| Collaboration | GitHub, Google Drive |

## Data sources and credits

| Dataset | Provider | Used for |
|---|---|---|
| IMD gridded rainfall (0.25°) and Tmax | India Meteorological Department, Pune (via `imdlib`) | Training data and ground truth |
| S2S reforecasts (Unified Model) | NCMRWF, MoES | Physical-model source in the hybrid blend |
| IMDAA daily reanalysis | NCMRWF, MoES · CC-BY · DOI 10.64349/nmrf.rds.imdaa.50514 | 10 m wind truth; reference data |
| MERA rainfall analysis | NCMRWF, MoES · CC-BY · DOI 10.64349/nmrf.rds.mera.50519 | Second-truth cross-check |
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

*EdgeCast is a student prototype for Smart India Hackathon 2026. It is not an official
forecast or warning of IMD, NCMRWF or any government body.*
