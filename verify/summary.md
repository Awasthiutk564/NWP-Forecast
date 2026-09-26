# Verification summary: key numbers for the slides

Source: `data/full_scores.csv`, which matches `data/blend_scores.csv`
exactly. The test covers forecasts issued in 2023 (init date 2023-01-01 to
2023-12-26), a year the ML models (trained on 2010–2021) and the blend
weights (learned on 2022) never saw. Forecasts are scored against IMD
gridded observations over AP + Telangana, with the same grid points and
dates for every source. Figures are in `slides/figures/`.

## Key points (for the slides)

- **Max temperature: BLEND is the best source at every lead (1–5 days).**
  RMSE rises from 1.00 °C (day 1) to 1.78 °C (day 5). BLEND beats the best
  single model, LightGBM, by 0.3–2.2 %, persistence by 5–17 % and
  climatology by 14–51 %. Bias is under 0.03 °C.
- **Rainfall: BLEND is best at only one lead of five.**

  | Lead | Best source (RMSE) | BLEND RMSE | BLEND verdict |
  |---|---|---|---|
  | Day 1 | LightGBM 8.22 | 8.43 | Not best: trails LightGBM by **2.5 %** |
  | Day 2 | LightGBM 8.90 | 8.93 | Not best: trails LightGBM by **0.4 %** |
  | Day 3 | **BLEND 9.13** | 9.13 | **Best** (0.3 % ahead of LightGBM) |
  | Day 4 | Climatology 9.16 | 9.19 | Not best: trails climatology by **0.4 %** |
  | Day 5 | Climatology 9.16 | 9.19 | Not best: trails climatology by **0.3 %** |

  RMSE is in mm/day. Beyond day 2, no method has much rain skill
  (correlation ~0.3).
- **BLEND is still far better than persistence for rain:** 24–28 % lower
  RMSE at every lead. At day 1 it is 8 % better than climatology.
- **Extremes are the weak point.** For Cyclone Michaung (4 Dec 2023), BLEND
  put the rain in the right place (Nellore–Tirupati coast) but predicted a
  maximum of 44 mm against 244 mm observed. District alerts: the next-day
  heatwave alert scores CSI 0.28 (POD 0.30, FAR 0.18). The calibrated
  heavy-rain alert scores CSI 0.15, up from 0.01 with the raw 64.5 mm rule,
  but 73 % of its alerts are still false alarms.

## Backup: full RMSE table (2023 init dates)

| Rain (mm/day) | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---|---|---|---|---|
| Persistence | 11.05 | 11.98 | 12.53 | 12.76 | 12.69 |
| Climatology | 9.16 | 9.16 | 9.16 | **9.16** | **9.16** |
| LightGBM | **8.22** | **8.90** | 9.15 | 9.20 | 9.20 |
| Linear reg. | 8.69 | 9.07 | 9.23 | 9.27 | 9.28 |
| BLEND | 8.43 | 8.93 | **9.13** | 9.19 | 9.19 |

| Tmax (°C) | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 |
|---|---|---|---|---|---|
| Persistence | 1.06 | 1.54 | 1.85 | 2.04 | 2.16 |
| Climatology | 2.07 | 2.07 | 2.07 | 2.07 | 2.06 |
| LightGBM | 1.01 | 1.42 | 1.64 | 1.75 | 1.82 |
| Linear reg. | 1.03 | 1.46 | 1.72 | 1.86 | 1.95 |
| BLEND | **1.00** | **1.40** | **1.62** | **1.72** | **1.78** |

Bold = lowest RMSE for that lead. Values are rounded once from
`full_scores.csv` to 2 decimals. Rain RMSE differences beyond day 2 are
tiny: at day 4, climatology is 9.157, BLEND 9.195 and LightGBM 9.203.

**Second-truth check (MERA, Jun–Sep 2023, scored by valid date):** BLEND
rain correlation is 0.25 against MERA vs 0.47 against IMD at day 1. That
drop is expected, because IMD and MERA themselves correlate at only 0.52 day
to day, and BLEND was trained on IMD. MERA's raw file has no units; it was
treated as mm/hour (×24), which gives a monsoon mean of 5.4 mm/day vs IMD's
5.7 mm/day.
