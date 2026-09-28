"""
export_data.py  -  turns the project's results into small JSON files for the website.

Reads only (never writes to data/ or models/):
    data/*.csv, data/*.nc, data/districts_ap_ts.geojson, models/*.txt, verify/mera_scores.csv

Writes into website/public/:
    data/scores.json      every scorecard (main, hybrid, wind, season, regime, alerts, MERA)
    data/weights.json     blend weight maps + average weights for every blending variant
    data/grid.json        lat / lon of the 33 x 37 grid and the land mask
    data/series.json      2023 daily area-average: IMD observed vs BLEND day-1 (and others)
    data/cases.json       index of case-study days
    data/cases/<id>.json  observed + every source x lead forecast for that day
    data/alerts.json      the district alerts (English + Telugu)
    data/districts.json   simplified district boundaries + centroids
    data/models.json      LightGBM model cards (trees, parameters, feature importance)

The model .txt files and slides/figures/*.png are copied by scripts/sync-assets.mjs.

Run from the repository root, with the project venv active (needs the real .nc files):
    python website/scripts/export_data.py
"""
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from sources.common import load, LAT, LON  # noqa: E402

warnings.filterwarnings("ignore", category=RuntimeWarning)

DATA = ROOT / "data"
OUT = ROOT / "website" / "public"
OUT_DATA = OUT / "data"
(OUT_DATA / "cases").mkdir(parents=True, exist_ok=True)

SOURCES = ["persistence", "climatology", "lgbm", "linreg", "blend"]
SOURCE_FILES = {"persistence": "persistence", "climatology": "climatology",
                "lgbm": "lgbm_forecast", "linreg": "linreg_forecast", "blend": "blend_forecast"}
VARS = ["rain", "tmax"]


def write(name, obj):
    path = OUT_DATA / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    print(f"  wrote {path.relative_to(ROOT)}  ({path.stat().st_size / 1024:,.0f} KB)")


def flat(arr, nd=1):
    """2-D grid -> flat list (row-major lat, lon), NaN -> None."""
    a = np.asarray(arr, dtype="float64").ravel()
    return [None if not np.isfinite(v) else round(float(v), nd) for v in a]


def num(v, nd=4):
    return None if v is None or not np.isfinite(v) else round(float(v), nd)


def csv_records(name, nd=4):
    df = pd.read_csv(DATA / name) if (DATA / name).exists() else pd.read_csv(ROOT / name)
    rows = []
    for rec in df.to_dict("records"):
        rows.append({k: (num(v, nd) if isinstance(v, (float, np.floating)) else
                         (int(v) if isinstance(v, (np.integer,)) else v)) for k, v in rec.items()})
    return rows


# ---------------------------------------------------------------- scores
print("Scores ...")
write("scores.json", {
    "main": csv_records("full_scores.csv"),
    "hybrid": csv_records("blend_scores_hybrid.csv"),
    "wind": csv_records("wind_scores.csv"),
    "season": csv_records("blend_scores_by_season.csv"),
    "regime": csv_records("blend_scores_regime.csv"),
    "alerts": csv_records("alert_scores.csv"),
    "alertTriggers": csv_records("alert_triggers.csv"),
    "windAlerts": csv_records("wind_alert_scores.csv"),
    "mera": csv_records("verify/mera_scores.csv"),
})

# ---------------------------------------------------------------- grid + land mask
print("Grid ...")
obs = load("imd_obs")[VARS].load()
land = np.isfinite(obs["rain"].sel(time="2023-07-01").values) & np.isfinite(obs["tmax"].sel(time="2023-07-01").values)
write("grid.json", {"lat": [float(x) for x in LAT], "lon": [float(x) for x in LON],
                    "land": [bool(x) for x in land.ravel()]})

# ---------------------------------------------------------------- weights
print("Weights ...")


def mean_weights(ds, extra_dim=None):
    """Area-average weight of each source per lead (and per season / regime)."""
    out = {}
    for v in [x for x in ds.data_vars]:
        da = ds[v]
        dims = [d for d in ("lat", "lon") if d in da.dims]
        m = da.mean(dims, skipna=True)
        if extra_dim:
            out[v] = {str(k): {str(s): [num(x, 4) for x in m.sel({extra_dim: k, "source": s}).values]
                               for s in m.source.values} for k in m[extra_dim].values}
        else:
            out[v] = {str(s): [num(x, 4) for x in m.sel(source=s).values] for s in m.source.values}
    return out


w = load("blend_weights").load()
maps = {v: {str(s): [flat(w[v].sel(source=s, lead=L).values, 3) for L in w.lead.values]
            for s in w.source.values} for v in VARS}
write("weights.json", {
    "maps": maps,
    "mean": mean_weights(w),
    "season": mean_weights(load("blend_weights_season").load(), "season"),
    "regime": mean_weights(load("blend_weights_regime").load(), "regime"),
    "hybrid": mean_weights(load("blend_weights_hybrid").load()),
    "wind": mean_weights(load("blend_wind_weights").load()),
})

# ---------------------------------------------------------------- forecasts (loaded once)
print("Loading forecasts (this takes a minute) ...")
fc = {s: load(SOURCE_FILES[s])[VARS] for s in SOURCES}


def forecast_for_valid(src, var, valid, lead):
    init = np.datetime64(valid) - np.timedelta64(int(lead), "D")
    try:
        return fc[src][var].sel(init_time=init, lead=lead).values
    except KeyError:
        return np.full((len(LAT), len(LON)), np.nan)


# ---------------------------------------------------------------- 2023 daily series
print("Daily series ...")
days = pd.date_range("2023-01-01", "2023-12-27", freq="D")     # last init is 2023-12-26
series = {"dates": [d.strftime("%Y-%m-%d") for d in days]}
for var in VARS:
    o = obs[var].sel(time=days).where(land).mean(["lat", "lon"]).values
    series[f"{var}_obs"] = [num(x, 2) for x in o]
    for src in ["blend", "lgbm", "climatology"]:
        inits = days - pd.Timedelta(days=1)
        f = fc[src][var].sel(init_time=inits.values, lead=1).where(land).mean(["lat", "lon"]).values
        series[f"{var}_{src}"] = [num(x, 2) for x in f]
write("series.json", series)

# ---------------------------------------------------------------- case-study days
print("Case days ...")
y23 = obs.sel(time=slice("2023-01-06", "2023-12-31"))
rain_mean = y23["rain"].where(land).mean(["lat", "lon"]).to_series()
rain_max = y23["rain"].max(["lat", "lon"]).to_series()
tmax_mean = y23["tmax"].where(land).mean(["lat", "lon"]).to_series()


def pick_distinct(series, n, exclude, gap=10):
    picked = []
    for d, _ in series.sort_values(ascending=False).items():
        if all(abs((d - p).days) > gap for p in picked + exclude):
            picked.append(d)
        if len(picked) == n:
            break
    return picked


michaung = pd.Timestamp("2023-12-04")
monsoon = rain_mean[(rain_mean.index.month >= 6) & (rain_mean.index.month <= 9)]
wet = pick_distinct(monsoon, 2, [michaung])
hot = pick_distinct(tmax_mean, 2, [])
calm = pd.Timestamp("2023-01-20")

cases = [
    (michaung, "michaung", "Cyclone Michaung landfall",
     "Severe cyclonic storm crossed the south Andhra coast. BLEND placed the rain correctly but smoothed the peak."),
    (wet[0], "monsoon-peak", "Wettest monsoon day of 2023",
     "Highest area-average rainfall over Andhra Pradesh and Telangana between June and September 2023."),
    (wet[1], "monsoon-spell", "Second monsoon peak",
     "Another active monsoon day, at least ten days away from the wettest one."),
    (hot[0], "heat-peak", "Hottest day of 2023",
     "Highest area-average maximum temperature of the year: the heatwave test case."),
    (hot[1], "heat-spell", "Second heat peak",
     "Another pre-monsoon heat day, at least ten days away from the hottest one."),
    (calm, "winter-calm", "Quiet winter day",
     "Dry, settled weather: every source should do well here."),
]

index = []
for day, cid, title, blurb in cases:
    valid = day.strftime("%Y-%m-%d")
    payload = {"id": cid, "date": valid, "title": title, "blurb": blurb, "obs": {}, "fc": {}, "rmse": {}}
    for var in VARS:
        o = obs[var].sel(time=valid).values
        payload["obs"][var] = flat(o)
        payload["fc"][var] = {}
        payload["rmse"][var] = {}
        for src in SOURCES:
            grids, errs = [], []
            for L in range(1, 6):
                f = forecast_for_valid(src, var, valid, L)
                grids.append(flat(f))
                ok = np.isfinite(f) & np.isfinite(o)
                errs.append(num(np.sqrt(np.mean((f[ok] - o[ok]) ** 2)), 3) if ok.any() else None)
            payload["fc"][var][src] = grids
            payload["rmse"][var][src] = errs
    write(f"cases/{cid}.json", payload)
    index.append({"id": cid, "date": valid, "title": title, "blurb": blurb,
                  "rainMean": num(rain_mean.get(day, np.nan), 1), "rainMax": num(rain_max.get(day, np.nan), 1),
                  "tmaxMean": num(tmax_mean.get(day, np.nan), 1)})
write("cases.json", index)

# ---------------------------------------------------------------- alerts
print("Alerts ...")
al = pd.read_csv(DATA / "alerts.csv", encoding="utf-8")
write("alerts.json", [{k: (num(v, 1) if isinstance(v, float) else (int(v) if isinstance(v, np.integer) else v))
                       for k, v in r.items()} for r in al.to_dict("records")])

# ---------------------------------------------------------------- districts
print("Districts ...")
gj = json.loads((DATA / "districts_ap_ts.geojson").read_text(encoding="utf-8"))


def simplify_ring(ring, tol=0.01):
    out = [ring[0]]
    for p in ring[1:-1]:
        if abs(p[0] - out[-1][0]) >= tol or abs(p[1] - out[-1][1]) >= tol:
            out.append(p)
    out.append(ring[-1])
    return [[round(x, 3), round(y, 3)] for x, y in out]


districts = []
for feat in gj["features"]:
    g = feat["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    rings = [simplify_ring(poly[0]) for poly in polys]           # outer rings only
    big = max(rings, key=len)
    xs, ys = zip(*big)
    districts.append({"name": feat["properties"]["district"], "state": feat["properties"]["state"],
                      "rings": rings, "c": [round(sum(xs) / len(xs), 3), round(sum(ys) / len(ys), 3)]})
write("districts.json", districts)

# ---------------------------------------------------------------- models
print("Models ...")
FEATURES = []
for lag in range(5):
    FEATURES += [f"rain (day −{lag})" if lag else "rain (today)", f"tmax (day −{lag})" if lag else "tmax (today)"]
FEATURES += ["season (sin)", "season (cos)", "latitude", "longitude"]

cards = []
for path in sorted((ROOT / "models").glob("lgbm_*.txt")):
    text = path.read_text(encoding="utf-8")
    parts = path.stem.split("_")                                   # lgbm[_hy]_<var>_lead<L>
    system = "hybrid" if parts[1] == "hy" else "main"
    var = parts[-2]
    lead = int(parts[-1].replace("lead", ""))
    imp = {}
    if "feature_importances:" in text:
        block = text.split("feature_importances:")[1].split("parameters:")[0]
        for line in block.strip().splitlines():
            k, v = line.split("=")
            imp[FEATURES[int(k.replace("Column_", ""))]] = int(v)
    params = {}
    if "parameters:" in text:
        for line in text.split("parameters:")[1].split("end of parameters")[0].splitlines():
            line = line.strip().strip("[]")
            if ": " in line:
                k, v = line.split(": ", 1)
                if k in ("objective", "num_iterations", "learning_rate", "num_leaves", "min_data_in_leaf", "metric"):
                    params[k] = v
    cards.append({"file": path.name, "system": system, "var": var, "lead": lead,
                  "trees": text.count("\nTree="), "sizeKB": round(path.stat().st_size / 1024),
                  "params": params, "importance": imp})
write("models.json", cards)

print("Done.")
