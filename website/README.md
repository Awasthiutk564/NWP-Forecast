# EdgeCast website

A single-page site that presents the project's results, models and alerts. Built with
React, Framer Motion (animation) and Three.js via React Three Fiber (the 3-D grid).
Everything it shows is read from the project's own result files; nothing is typed in by hand.

## Run it

You need Node.js 20 or newer.

```
cd website
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` first copies `../models/*.txt` and
`../slides/figures/*.png` into `public/` so they can be downloaded from the site.

To open it in Antigravity (or VS Code / Cursor), open the `website` folder and run the
same commands in its terminal.

Production build (static files in `website/dist/`, can be hosted anywhere):

```
npm run build
npm run preview
```

## Refresh the data after re-running the pipeline

The site reads small JSON files in `public/data/`. They are made from the real `.nc`
and `.csv` files by one script, run from the repository root with the project venv:

```
python website/scripts/export_data.py
```

It only reads `data/`, `models/` and `verify/`; it never changes them.

| File | Made from |
|---|---|
| `scores.json` | `full_scores.csv`, `blend_scores_hybrid.csv`, `wind_scores.csv`, season / regime scores, alert scores, `verify/mera_scores.csv` |
| `weights.json` | `blend_weights*.nc`, `blend_wind_weights.nc` |
| `series.json` | 2023 daily area average: IMD observed vs BLEND / LightGBM / climatology day 1 |
| `cases/*.json` | six 2023 days (Cyclone Michaung, two monsoon peaks, two heat peaks, a winter day): observed + every source × lead |
| `alerts.json` | `alerts.csv` (English + Telugu) |
| `districts.json` | `districts_ap_ts.geojson`, simplified |
| `models.json` | parameters and feature importance read from `models/lgbm_*.txt` |

## Page sections

| Section | What it shows |
|---|---|
| Hero | Rotating 3-D map of real IMD days, headline numbers, 2023 Tmax trace |
| Results | Verification console: RMSE / bias / correlation by lead, main and hybrid systems, wind |
| Hazards | One card per hazard desk, each with a number from the scorecards |
| Method | Observe (data timeline), Blend (weight maps, per-city weights), Warn (calibration, bilingual alerts) |
| 3-D Explorer | Pick a day, variable, source and lead; compare with IMD; per-day error |
| Experiments | Season-aware, regime-aware, hybrid S2S and wind runs, with honest verdicts |
| Alerts | 2023 alert timeline, district map, English / Telugu messages, POD / FAR / CSI |
| Case study | Cyclone Michaung, observed vs BLEND maps |
| Models | All 20 LightGBM models with feature importance and downloads; slide figures |
| Data | Sources and licences, the time split, MERA cross-check, limitations |

Tip while developing: `http://localhost:5173/?section=explorer` shows one section on its own
(names: hero, results, hazards, method, explorer, experiments, alerts, case, models, data, run, footer).

## Change names or links

Project name, team, problem statement and links live in `src/config.ts`.

## Code map

```
website/
├── scripts/export_data.py    results -> public/data/*.json
├── scripts/sync-assets.mjs   copies models + figures into public/
├── src/config.ts             names and links
├── src/lib/                  data loading, colour scales
├── src/three/                3-D grid (React Three Fiber)
└── src/components/           one file per section (+ its .css)
```

The site is a student prototype for SIH 2026 and says so in its footer; it does not use
any government emblem or logo.
