"""
make_blend_data.py
------------------
Generates blend_forecast.nc and blend_weights.nc from existing dummy data.
This bypasses the full IMD pipeline and lets the dashboard run immediately.

Run from the repo root:
    python make_blend_data.py
"""
import numpy as np
import pandas as pd
import xarray as xr
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
LAT = np.round(np.arange(12.0, 20.0 + 0.001, 0.25), 2)
LON = np.round(np.arange(76.0, 85.0 + 0.001, 0.25), 2)
LEADS = np.arange(1, 6)
VARS = ["rain", "tmax"]
NAMES = ["persistence", "climatology", "lgbm", "linreg"]
rng = np.random.default_rng(99)

print("Loading dummy_forecast.nc ...")
dummy = xr.open_dataset(DATA_DIR / "dummy_forecast.nc")
init = dummy.init_time.values
n_init = len(init)
n_lead = len(LEADS)
n_lat = len(LAT)
n_lon = len(LON)

# ── Build 4 fake "source" forecasts from the dummy data with small perturbations ──
print("Building source forecasts ...")
sources = {}
for name in NAMES:
    noise_scale = {"persistence": 4.0, "climatology": 3.0, "lgbm": 1.5, "linreg": 2.5}[name]
    src = {}
    for v in VARS:
        base = dummy[v].values  # (init, lead, lat, lon)
        noise = rng.normal(0, noise_scale if v == "rain" else noise_scale * 0.3,
                           base.shape).astype("float32")
        arr = base + noise
        if v == "rain":
            arr = np.clip(arr, 0, None)
        src[v] = arr
    sources[name] = src

# ── Compute dummy weights (1 / variance of each source, normalised) ──
print("Computing blend weights ...")
weight_out = {}
for v in VARS:
    F = np.stack([sources[n][v] for n in NAMES])   # (S, init, lead, lat, lon)
    var_s = np.var(F, axis=(1,), keepdims=False)    # (S, lead, lat, lon)
    w = 1.0 / (var_s + 1e-6)
    w = w / w.sum(axis=0, keepdims=True)
    weight_out[v] = w.astype("float32")

# ── Build blended forecast ──
print("Building blend_forecast ...")
blend_out = {}
for v in VARS:
    F = np.stack([sources[n][v] for n in NAMES])          # (S, init, lead, lat, lon)
    w = weight_out[v][:, np.newaxis, :, :, :]              # (S, 1, lead, lat, lon)
    blend = (F * w).sum(axis=0)                            # (init, lead, lat, lon)
    if v == "rain":
        blend = np.clip(blend, 0, None)
    blend_out[v] = blend.astype("float32")

# ── Save blend_forecast.nc ──
bf = xr.Dataset(
    {v: (("init_time", "lead", "lat", "lon"), blend_out[v],
         {"units": "mm/day" if v == "rain" else "degC"})
     for v in VARS},
    coords={"init_time": init, "lead": LEADS, "lat": LAT, "lon": LON},
    attrs={"source": "Inverse-variance blend of persistence, climatology, lgbm, linreg (dummy data)"},
)
bf["lead"].attrs["units"] = "days"
out_path = DATA_DIR / "blend_forecast.nc"
bf.to_netcdf(out_path)
print(f"Saved {out_path}")

# ── Save blend_weights.nc ──
wds = xr.Dataset(
    {v: (("source", "lead", "lat", "lon"), weight_out[v]) for v in VARS},
    coords={"source": NAMES, "lead": LEADS, "lat": LAT, "lon": LON},
    attrs={"description": "Blend weight per source (sums to 1 over sources)"},
)
wpath = DATA_DIR / "blend_weights.nc"
wds.to_netcdf(wpath)
print(f"Saved {wpath}")

# ── Save blend_scores.csv (if not present, use dummy scores) ──
scores_path = DATA_DIR / "blend_scores.csv"
if not scores_path.exists():
    rows = []
    for v in VARS:
        for L in LEADS:
            for name in NAMES + ["BLEND"]:
                base_rmse = {"rain": 6.0, "tmax": 1.5}[v]
                lead_penalty = (int(L) - 1) * 0.4
                source_err = {"persistence": 2.0, "climatology": 1.5,
                              "lgbm": 0.3, "linreg": 0.8, "BLEND": 0.0}[name]
                rows.append({
                    "var": v, "lead": int(L), "source": name,
                    "rmse": round(base_rmse + lead_penalty + source_err + rng.uniform(-0.1, 0.1), 3),
                })
    import pandas as pd
    pd.DataFrame(rows).to_csv(scores_path, index=False)
    print(f"Saved {scores_path}")
else:
    print(f"blend_scores.csv already exists, skipping.")

print("\nDone! You can now run the dashboard:")
print("  python -m streamlit run dashboard/app.py")
