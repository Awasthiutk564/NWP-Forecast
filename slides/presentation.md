---
marp: true
theme: uncover
class: invert
paginate: true
header: "Smart India Hackathon 2026 · Problem SIH26081 · Team ZeroPing"
footer: "EdgeCast / SamanvayCast · Hybrid AI–NWP Multi-Model Forecast Blending System"
style: |
  section {
    background-color: #0b0f19;
    color: #e2e8f0;
    font-family: 'Inter', sans-serif;
    text-align: left;
    padding: 40px 60px;
  }
  h1 {
    color: #f97316;
    font-size: 2.2rem;
    margin-bottom: 0.5rem;
  }
  h2 {
    color: #38bdf8;
    font-size: 1.6rem;
    margin-bottom: 0.8rem;
  }
  h3 {
    color: #34d399;
    font-size: 1.2rem;
  }
  p, li {
    font-size: 1.05rem;
    line-height: 1.6;
    color: #cbd5e1;
  }
  strong {
    color: #f8fafc;
  }
  code {
    background: #1e293b;
    color: #fbbf24;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.95rem;
  }
  .highlight {
    color: #f97316;
    font-weight: bold;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    align-items: center;
  }
  .tag {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 9999px;
    background: rgba(249, 115, 22, 0.2);
    color: #f97316;
    font-size: 0.85rem;
    font-weight: 700;
  }
---

<!-- Slide 1: Title -->
<span class="tag">SIH 2026 · Problem Statement SIH26081</span>

# EdgeCast / SamanvayCast
## Hybrid AI–NWP Multi-Model Forecast Blending System

**Organization:** National Centre for Medium Range Weather Forecasting (NCMRWF) / MoES  
**Team:** ZeroPing  
**Target Domain:** Andhra Pradesh & Telangana (12.5°N–20.0°N, 76.5°E–85.0°E · 0.25° Grid)

---

<!-- Slide 2: The Problem -->
## The Challenge: Why Single Forecasts Fail

- **Physical NWP Models (e.g. NCMRWF UM):** Strong at synoptic dynamics, but suffer from systematic spatial biases, orographic misrepresentation, and heavy compute costs.
- **AI/ML Weather Models (e.g. LightGBM, Neural Operators):** Highly accurate at short lead times (Day 1–2), but drift toward unphysical states at longer horizons.
- **Lead-Time & Regime Variance:**
  - Day 1: ML captures localized micro-climate gradients.
  - Day 5: Chaos limits ML; climatological and ensemble physics provide greater stability.
- **The Core Need:** An intelligent, **spatially and lead-time adaptive** blending engine that dynamically weights forecast sources based on historical verification skill.

---

<!-- Slide 3: Blending Formulation -->
## Mathematical Framework: Dynamic Ensembling

Adaptive inverse-variance skill weighting computed over rolling verification windows:

$$W_m(s, l, v) = \frac{\left(1 / \text{RMSE}_m(s, l, v)\right)^p}{\sum_{k} \left(1 / \text{RMSE}_k(s, l, v)\right)^p}$$

$$\hat{Y}_{\text{blend}}(s, l, t) = \sum_{m} W_m(s, l) \cdot \hat{Y}_m(s, l, t)$$

- **$s$:** Spatial coordinate $(lat, lon)$ at $0.25^\circ$ resolution.
- **$l$:** Forecast lead time ($1$ to $5$ days).
- **$p$:** Skill power factor ($p=2$ for inverse MSE penalization).
- **Constraint:** Non-negative weights strictly summing to $1.0$ ($\sum_m W_m = 1.0$).

---

<!-- Slide 4: Data & Verification Pipeline -->
## Comprehensive Multi-Source Data Ingest

<div class="grid-2">
<div>

- **IMD High-Resolution Observations (2010–2023):**
  - Daily rainfall (`0.25°`) & $T_{\text{max}}$ (`1.0°` regridded).
  - 14 years ground truth for training and verification.
- **NCMRWF IMDAA Reanalysis:**
  - 12km reanalysis downscaled for regional consistency.
- **NCMRWF MERA Analysis:**
  - Independent second-source validation ground truth.
- **Operational Baselines:**
  - Lag-0 Persistence benchmark & 30-year IMD Climatology.

</div>
<div>

### Strict Temporal Partitioning
- **Training Set:** 2010–2021 (12 years)
- **Validation Set:** 2022 (calibration of thresholds & weights)
- **Out-of-Sample Test Set:** 2023 (unseen real-world verification)
- **Extreme Event Stress-Test:** Cyclone Michaung (Dec 2023)

</div>
</div>

---

<!-- Slide 5: Verification Results - Skill Scorecard -->
## Model Skill Scorecards: BLEND vs Baselines

<div class="grid-2">
<div>

![Rainfall RMSE vs Lead](figures/rmse_vs_lead_rain.png)

</div>
<div>

![Tmax RMSE vs Lead](figures/rmse_vs_lead_tmax.png)

</div>
</div>

- **$T_{\text{max}}$ Benchmark:** BLEND outperforms **every single individual model** at all 5 lead days ($1.00^\circ\text{C}$ Day 1 $\to 1.78^\circ\text{C}$ Day 5).
- **Rainfall Benchmark:** BLEND achieves optimal resilience, eliminating extreme blunder errors while maintaining an 8.43 mm/day Day 1 RMSE.

---

<!-- Slide 6: Improvement over Baselines -->
## Relative Skill Improvement over Operational Baselines

![Improvement vs Baselines](figures/improvement_vs_baselines.png)

- **Versus Persistence:** Up to **$52.8\%$** error reduction at Lead Day 5.
- **Versus Climatology:** Significant **$51.7\%$** improvement at Lead Day 1 for temperature.

---

<!-- Slide 7: Spatial Weight Allocation -->
## Adaptive Spatial Weight Distribution

![Blend Weights Tmax](figures/blend_weights_tmax.png)

- Coastal Andhra vs Rayalaseema vs Northern Telangana show distinct weight distributions.
- Eastern Ghats topography triggers higher weight for non-linear ML models over smoothed baselines.

---

<!-- Slide 8: Extreme Weather Guidance & Alerts -->
## Calibrated Extreme Weather Alert Engine

<div class="grid-2">
<div>

![Alert Scores](figures/alert_scores.png)

</div>
<div>

### Standardized Warning System
- **Rainfall:**
  - Yellow: Heavy ($64.5 - 115.5$ mm)
  - Orange: Very Heavy ($115.6 - 204.4$ mm)
  - Red: Extremely Heavy ($> 204.4$ mm)
- **Heatwave:**
  - Based on regional climatological thresholds & deviation.
- **Bilingual Alert Dispatch:**
  - Instant dispatch in English & Telugu for district disaster authorities (SDMA).

</div>
</div>

---

<!-- Slide 9: Case Study - Cyclone Michaung -->
## Extreme Event Validation: Cyclone Michaung (Dec 2023)

![Michaung Case Study](figures/michaung_case.png)

- Severe Cyclonic Storm Michaung made landfall along coastal Andhra Pradesh on Dec 5, 2023.
- The hybrid system successfully forecast torrential localized rainfall (>200 mm/day) 48 hours in advance, triggering Red alerts across Bapatla, Nellore, and Krishna districts.

---

<!-- Slide 10: Full-Stack Operational Architecture -->
## Production-Ready Operational System

- **FastAPI High-Performance Engine (`api_server.py`):**
  - Instant NetCDF spatial querying with memory-efficient chunked access.
  - Endpoints for live maps, district boundaries (GeoJSON), scores, and alerts.
- **Next.js 16 Web Dashboard (`web-dashboard/`):**
  - Dark glassmorphism aesthetics, real-time KPI metrics, responsive sidebar.
  - 4 comprehensive modules: **Overview**, **Alerts Monitor**, **Skill Scorecards**, **Adaptive Weights**.
- **Streamlit Analytical Portal (`dashboard/app.py`):**
  - Interactive multi-parameter exploration tool for meteorologists.

---

<!-- Slide 11: Summary & Future Roadmap -->
## Summary & Immediate Operational Next Steps

### Demonstrated Outcomes
1. **Dynamic Blending:** Successfully proven across 14 years of IMD & NCMRWF data.
2. **Spatial Maps:** Lead-dependent weight allocation maps across all AP & Telangana districts.
3. **Disaster Guidance:** Rigorously calibrated alert thresholding with bilingual communication.

### Scalability Roadmap
- Ingest live real-time NCMRWF S2S runs via automated cron scheduler (`tools/cron_runner.py`).
- Extend domain from AP & Telangana to all-India National Grid ($0.12^\circ$ resolution).
- Add wind vector blending ($u_{10}, v_{10}$) for coastal gale alerts.

---

# Thank You!
### Questions & Technical Discussion

**Team ZeroPing · SIH 2026**  
Repository: `github.com/paradox-prakhar/Weather`  
Interactive Dashboard: `http://localhost:3000` · API: `http://localhost:8000/docs`
