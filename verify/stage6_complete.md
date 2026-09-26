# P3 verification work: stages 1–6 complete

SIH 2026 · SIH26081 · NCMRWF/MoES forecast blending
Owner: P3 (verification and slides) · Completed: 2026-09-26 · Last updated: 2026-09-26 (switched to init-date scoring)

All six stages are done. Nothing outside `verify/`, `slides/figures/` and
`data/full_scores.csv` was changed, and nothing has been committed to git.

---

## Stage 1: Setup
- Created `venv/` (Python 3.13.14). It is already in `.gitignore`.
- Installed `requirements.txt` plus `dask matplotlib pandas geopandas`.
- Created `verify/__init__.py` and `slides/figures/`.
- Details: [phase1.md](phase1.md)

## Stage 2: Inspect the data
Script: `verify/check_data.py` (`python -m verify.check_data`)

- Every forecast and observation file has two variables: `rain` (mm/day)
  and `tmax` (°C).
- The grid is 33 × 37 points: 12–20°N, 76–85°E, 0.25°.
- **Lead is a plain integer (1–5 days), not a timedelta.** The valid date
  is `init_time + lead` days.

| Dataset | Date range |
|---|---|
| imd_obs | 2010-01-01 → 2023-12-31 |
| persistence, climatology | init 2010-01-01 → 2023-12-26 |
| lgbm, linreg, blend | init 2010-01-06 → 2023-12-26 |

- Source names in `blend_weights`: persistence, climatology, lgbm, linreg.
- Unexpected findings:
  - 35–38 % of grid points are always empty (outside IMD land), and the
    empty areas differ slightly between files.
  - Persistence at every lead equals the observation on the init date.
  - The ML models (LightGBM, Ridge) were trained on **2010–2021**: every
    init date up to 2021-12-31, starting 2010-01-06 because they need 5
    days of history (`TRAIN_END` in `sources/train_models.py`). The blend
    weights were learned on 2022. So 2023 is the only fair test year.
  - The "trained on 2020–2021" text in the forecast files' `source`
    attribute and in `README.md` is out of date. It predates commit
    `0bb00f1` (training on more years) and should be updated by P2.

## Stage 3: Scorecard
Script: `verify/scores.py` (`python -m verify.scores`) → `data/full_scores.csv`

- **Official convention (team): score forecasts whose init date is in
  2023** (init 2023-01-01 to 2023-12-26). This is the default in
  `scores.py` and matches `sources/blend.py` and `blend_scores.csv`.
- Each forecast is paired with the IMD observation on its valid date
  (init + lead), using only points where all 5 sources and the observation
  are valid.
- It computes RMSE, bias and Pearson correlation for 5 sources × 5 leads
  × 2 variables.
- **Sanity check passed.** Every RMSE matches `blend_scores.csv` exactly
  (difference 0.000), and all known numbers match: Tmax lead 5 is 1.78,
  1.82 and 2.16; rain lead 1 is 8.22 and 8.43.
- `--by valid` still exists for comparison. It scores forecasts whose
  valid date is in 2023 and lowers RMSE by at most 0.09. It is not used in
  the slides.

## Stage 4: Figures
Script: `verify/make_figures.py` (`python -m verify.make_figures`)

| File | Content |
|---|---|
| `rmse_vs_lead_rain.png` | Rain RMSE vs lead, all sources |
| `rmse_vs_lead_tmax.png` | Tmax RMSE vs lead, all sources |
| `improvement_vs_baselines.png` | % RMSE gain of BLEND over persistence and climatology |
| `blend_weights_tmax.png` | Average weight of each source vs lead |
| `alert_scores.png` | POD / FAR / CSI for the district alerts |
| `michaung_case.png` | BLEND vs IMD rain, 4 Dec 2023, with district boundaries |

- **Style:** dpi 200 and fonts of 15–22 pt. Each source has a fixed colour
  that passed a colour-blind check, plus its own marker shape.
- **BLEND** is drawn as a thick blue line.
- **Michaung maps** use IMD rainfall categories for the colour scale.

## Stage 5: MERA cross-check (Jun–Sep 2023)
Script: `verify/mera_check.py` (`python -m verify.mera_check`) →
`verify/mera_scores.csv`

- `mera_obs.nc` has no units, and its values were about 24× too small, so
  it was **treated as mm/hour and multiplied by 24**. That gives a monsoon
  mean of 5.4 mm/day, close to IMD's 5.7. P1/P2 should confirm this and
  fix `sources/fetch_ncmrwf.py`.
- BLEND lead-1 rain scores against each observation set:

| Compared against | Correlation | RMSE (mm/day) |
|---|---|---|
| IMD | 0.47 | 11.8 |
| MERA | 0.25 | 21.2 |

- The lower MERA score is expected: IMD and MERA only correlate at 0.52
  with each other, and BLEND was trained on IMD.
- This check selects forecasts by **valid date** (Jun 1 – Sep 30), because
  MERA only has data for those days. Its IMD numbers therefore cover only
  the monsoon and are not comparable with the full-year scorecard.

## Stage 6: Summary for the slides
Full text: [summary.md](summary.md)

Numbers use the official init-date-in-2023 convention.

- **Tmax:** BLEND is best at every lead, with RMSE from 1.00 °C (day 1) to
  1.78 °C (day 5). That is 0.3–2.2 % less error than LightGBM (the best
  single model), 5–17 % less than persistence and 14–51 % less than
  climatology.
- **Rain:** BLEND is best only at day 3. Where it is not best:
  - Day 1: trails LightGBM by 2.5 % (8.43 vs 8.22 mm/day).
  - Day 2: trails LightGBM by 0.4 % (8.93 vs 8.90).
  - Day 4: trails climatology by 0.4 % (9.19 vs 9.16).
  - Day 5: trails climatology by 0.3 % (9.19 vs 9.16).
- **Rain vs persistence:** BLEND still has 24–28 % lower RMSE at every
  lead.
- **Extremes:** for Cyclone Michaung, BLEND put the rain in the right place
  but predicted 44 mm against 244 mm observed. The heavy-rain alert has
  73 % false alarms (CSI 0.15). The heatwave alert scores CSI 0.28.

### RMSE, forecasts issued in 2023 (bold = best at that lead)

| Rain (mm/day) | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---|---|---|---|---|
| Persistence | 11.05 | 11.98 | 12.53 | 12.76 | 12.69 |
| Climatology | 9.16 | 9.16 | 9.16 | **9.16** | **9.16** |
| LightGBM | **8.22** | **8.90** | 9.15 | 9.20 | 9.20 |
| Linear reg. | 8.69 | 9.07 | 9.23 | 9.27 | 9.28 |
| BLEND | 8.43 | 8.93 | **9.13** | 9.19 | 9.19 |
| BLEND verdict | −2.5 % | −0.4 % | best | −0.4 % | −0.3 % |

| Tmax (°C) | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---|---|---|---|---|
| Persistence | 1.06 | 1.54 | 1.85 | 2.04 | 2.16 |
| Climatology | 2.07 | 2.07 | 2.07 | 2.07 | 2.06 |
| LightGBM | 1.01 | 1.42 | 1.64 | 1.75 | 1.82 |
| Linear reg. | 1.03 | 1.46 | 1.72 | 1.86 | 1.95 |
| BLEND | **1.00** | **1.40** | **1.62** | **1.72** | **1.78** |

A negative verdict is how much BLEND's RMSE trails the best source at that
lead.

**Changes since the first version:**
- The first Stage 3 report said BLEND was best for rain at leads 3–5. That
  was wrong; it is best only at lead 3.
- Scoring switched from valid-date to init-date (team convention).
  `data/full_scores.csv`, all figures and `summary.md` were regenerated.
  The rankings did not change.
- The ML training years were corrected from 2020–2021 to 2010–2021, as
  confirmed in `sources/train_models.py`.

---

## Files created

```
verify/__init__.py          verify/scores.py         verify/mera_scores.csv
verify/phase1.md            verify/make_figures.py   verify/summary.md
verify/check_data.py        verify/mera_check.py     verify/stage6_complete.md
slides/figures/*.png  (6 figures)
data/full_scores.csv
```

## Re-run everything
```powershell
.\venv\Scripts\Activate.ps1
python -m verify.check_data
python -m verify.scores
python -m verify.make_figures
python -m verify.mera_check
```

## Open items for the team
1. Confirm MERA units (mm/hour?) and fix `sources/fetch_ncmrwf.py` (P1/P2).
2. Rain blending: consider using LightGBM alone for days 1–2, or giving it
   more weight (P2).
3. Improve extreme-rain handling. BLEND under-forecasts cyclone rainfall
   by about 5×.
4. Update the out-of-date "trained on 2020–2021" text in `README.md` and in
   the `source` attribute written by `sources/train_models.py` to
   2010–2021 (P2).
5. Minor: training inits up to 2021-12-31 use targets from 2022-01-01 to
   01-05, so they overlap by 5 days with the blend-weight year (2022).
   The effect is negligible, but `TRAIN_END` could be set to 2021-12-26
   for a clean split (P2).
