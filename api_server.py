"""
api_server.py  -  FastAPI sidecar for the Next.js dashboard.
Reads data files and exposes JSON endpoints.

Run from repo root:
    python api_server.py
Serves on http://localhost:8000

Endpoints:
    GET /api/health                       - Server + file status
    GET /api/summary                      - KPI overview stats
    GET /api/scores?var=rain              - RMSE scorecard per source and lead
    GET /api/scores/full?var=rain         - Full RMSE + bias + corr from full_scores.csv
    GET /api/alerts                       - Alert list (filtered, paginated)
    GET /api/alerts/summary              - Alert counts by date and level
    GET /api/forecast/stats              - Area stats for a variable/lead/date
    GET /api/forecast/timeseries         - Area-mean timeseries for a variable/lead
    GET /api/forecast/map                - Full 2D grid for a variable/lead/date
    GET /api/weights                     - Blend weight grid per source/lead/var
    GET /api/districts                   - GeoJSON of district boundaries
"""
from pathlib import Path
import json
import numpy as np
import pandas as pd
import xarray as xr
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

DATA_DIR = Path(__file__).resolve().parent / "data"

app = FastAPI(title="NWP Forecast API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _to_py(val):
    """Convert numpy scalars to native Python types."""
    if isinstance(val, (np.floating, np.integer)):
        return float(val)
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val


def _file_ok(name: str) -> bool:
    return (DATA_DIR / name).exists()


# ─── /api/health ─────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    """Server liveness + data file status."""
    files = [
        "blend_forecast.nc", "blend_weights.nc", "blend_scores.csv",
        "full_scores.csv", "alerts.csv", "alert_scores.csv",
        "imd_obs.nc", "climatology.nc", "persistence.nc",
        "districts_ap_ts.geojson",
    ]
    status = {f: _file_ok(f) for f in files}
    all_ok = all(status.values())
    return {
        "status": "ok" if all_ok else "degraded",
        "files": status,
        "data_dir": str(DATA_DIR),
    }


# ─── /api/summary ────────────────────────────────────────────────────────────
@app.get("/api/summary")
def summary():
    """Overview KPI stats for the home page."""
    scores = pd.read_csv(DATA_DIR / "blend_scores.csv")
    alerts = pd.read_csv(DATA_DIR / "alerts.csv")

    blend = scores[scores["source"] == "BLEND"]
    rain_rmse = blend[blend["var"] == "rain"]["rmse"].mean()
    tmax_rmse = blend[blend["var"] == "tmax"]["rmse"].mean()

    total_alerts  = len(alerts)
    red_alerts    = int((alerts["level"].str.lower() == "red").sum())
    orange_alerts = int((alerts["level"].str.lower() == "orange").sum())
    yellow_alerts = int((alerts["level"].str.lower() == "yellow").sum())

    with xr.open_dataset(DATA_DIR / "blend_forecast.nc") as ds:
        init_dates = [str(pd.Timestamp(t).date()) for t in ds.init_time.values]
        leads = [int(l) for l in ds.lead.values]

    return {
        "rain_rmse":     round(float(rain_rmse), 2),
        "tmax_rmse":     round(float(tmax_rmse), 2),
        "total_alerts":  total_alerts,
        "red_alerts":    red_alerts,
        "orange_alerts": orange_alerts,
        "yellow_alerts": yellow_alerts,
        "forecast_dates": init_dates,
        "latest_date":   init_dates[-1] if init_dates else None,
        "leads":         leads,
    }


# ─── /api/scores ─────────────────────────────────────────────────────────────
@app.get("/api/scores")
def scores(var: str = Query("rain")):
    """RMSE scorecard per source and lead day."""
    df = pd.read_csv(DATA_DIR / "blend_scores.csv")
    df = df[df["var"] == var].sort_values("lead")
    sources = df["source"].unique().tolist()
    leads   = sorted(df["lead"].unique().tolist())

    series = []
    for src in sources:
        g = df[df["source"] == src]
        series.append({
            "source": src,
            "data": [{"lead": int(row["lead"]), "rmse": round(float(row["rmse"]), 3)}
                     for _, row in g.iterrows()]
        })
    return {"var": var, "leads": leads, "series": series}


# ─── /api/scores/full ────────────────────────────────────────────────────────
@app.get("/api/scores/full")
def scores_full(var: str = Query("rain")):
    """Full scorecard: RMSE, bias and correlation from full_scores.csv."""
    path = DATA_DIR / "full_scores.csv"
    if not path.exists():
        raise HTTPException(404, "full_scores.csv not found. Run: python -m verify.scores")
    df = pd.read_csv(path)
    if "var" in df.columns:
        df = df[df["var"] == var]
    return df.sort_values(["source", "lead"]).to_dict(orient="records")


# ─── /api/alerts/summary ─────────────────────────────────────────────────────
@app.get("/api/alerts/summary")
def alerts_summary():
    """Count of alerts by level grouped by init_date."""
    df = pd.read_csv(DATA_DIR / "alerts.csv", parse_dates=["init_date", "valid_date"])
    df["level"]     = df["level"].str.lower().str.strip()
    df["init_date"] = df["init_date"].dt.strftime("%Y-%m-%d")

    grouped = df.groupby(["init_date", "level"]).size().reset_index(name="count")
    result = {}
    for date, g in grouped.groupby("init_date"):
        result[date] = {row["level"]: int(row["count"]) for _, row in g.iterrows()}
    return result


# ─── /api/alerts ─────────────────────────────────────────────────────────────
@app.get("/api/alerts")
def alerts(
    init_date: str  = Query(None),
    level: str      = Query(None),
    hazard: str     = Query(None),
    district: str   = Query(None),
    limit: int      = Query(200),
    offset: int     = Query(0),
):
    """List alerts with optional filters and pagination."""
    df = pd.read_csv(DATA_DIR / "alerts.csv", parse_dates=["init_date", "valid_date"])
    df["level"]      = df["level"].str.lower().str.strip()
    df["init_date"]  = df["init_date"].dt.strftime("%Y-%m-%d")
    df["valid_date"] = df["valid_date"].dt.strftime("%Y-%m-%d")

    if init_date:
        df = df[df["init_date"] == init_date]
    if level:
        df = df[df["level"] == level.lower()]
    if hazard:
        df = df[df["hazard"] == hazard]
    if district:
        df = df[df["district"].str.lower() == district.lower()]

    total = len(df)
    page  = df.iloc[offset : offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "data": page.to_dict(orient="records")}


# ─── /api/forecast/stats ─────────────────────────────────────────────────────
@app.get("/api/forecast/stats")
def forecast_stats(var: str = Query("rain"), lead: int = Query(1), date: str = Query(None)):
    """Area mean/max/min for a given variable, lead, init_date."""
    with xr.open_dataset(DATA_DIR / "blend_forecast.nc") as ds:
        if date:
            field = ds[var].sel(init_time=pd.Timestamp(date), method="nearest").sel(lead=lead)
        else:
            field = ds[var].isel(init_time=-1).sel(lead=lead)

        init_time = str(pd.Timestamp(field.init_time.values).date())
        return {
            "var":       var,
            "lead":      lead,
            "init_date": init_time,
            "mean":  round(float(field.mean()), 2),
            "max":   round(float(field.max()),  2),
            "min":   round(float(field.min()),  2),
            "std":   round(float(field.std()),  2),
        }


# ─── /api/forecast/timeseries ────────────────────────────────────────────────
@app.get("/api/forecast/timeseries")
def forecast_timeseries(var: str = Query("rain"), lead: int = Query(1)):
    """Area-mean value over all init_times for a given variable and lead."""
    with xr.open_dataset(DATA_DIR / "blend_forecast.nc") as ds:
        series = ds[var].sel(lead=lead).mean(dim=["lat", "lon"])
        return {
            "var":  var,
            "lead": lead,
            "data": [
                {"date": str(pd.Timestamp(t).date()), "value": round(float(v), 2)}
                for t, v in zip(ds.init_time.values, series.values)
            ]
        }


# ─── /api/forecast/map ───────────────────────────────────────────────────────
@app.get("/api/forecast/map")
def forecast_map(var: str = Query("rain"), lead: int = Query(1), date: str = Query(None)):
    """Full 2D gridded field (lat, lon, value) for a variable/lead/date."""
    with xr.open_dataset(DATA_DIR / "blend_forecast.nc") as ds:
        if date:
            field = ds[var].sel(init_time=pd.Timestamp(date), method="nearest").sel(lead=lead)
        else:
            field = ds[var].isel(init_time=-1).sel(lead=lead)

        lats = field.lat.values.tolist()
        lons = field.lon.values.tolist()
        vals = np.where(np.isnan(field.values), None, np.round(field.values, 2)).tolist()
        init_time = str(pd.Timestamp(field.init_time.values).date())

    return {
        "var":       var,
        "lead":      lead,
        "init_date": init_time,
        "lat":       lats,
        "lon":       lons,
        "values":    vals,
        "units":     "mm/day" if var == "rain" else "degC",
    }


# ─── /api/weights ─────────────────────────────────────────────────────────────
@app.get("/api/weights")
def weights(var: str = Query("rain"), lead: int = Query(1)):
    """Blend weight maps per source for a given variable and lead."""
    with xr.open_dataset(DATA_DIR / "blend_weights.nc") as ds:
        w = ds[var].sel(lead=lead)
        sources = [str(s) for s in w.source.values]
        lats    = w.lat.values.tolist()
        lons    = w.lon.values.tolist()
        result  = {}
        for s in sources:
            arr = w.sel(source=s).values
            result[s] = np.where(np.isnan(arr), None, np.round(arr, 4)).tolist()
    return {
        "var":     var,
        "lead":    lead,
        "lat":     lats,
        "lon":     lons,
        "sources": sources,
        "weights": result,
    }


# ─── /api/districts ───────────────────────────────────────────────────────────
@app.get("/api/districts")
def districts():
    """GeoJSON of AP + Telangana district boundaries."""
    path = DATA_DIR / "districts_ap_ts.geojson"
    if not path.exists():
        raise HTTPException(404, "districts_ap_ts.geojson not found")
    with open(path, "r", encoding="utf-8") as f:
        return JSONResponse(content=json.load(f))


# ─── District Centroid Cache & Fuzzy Matcher ────────────────────────────────
_DISTRICT_CACHE = {}


def _get_district_centers():
    global _DISTRICT_CACHE
    if _DISTRICT_CACHE:
        return _DISTRICT_CACHE
    path = DATA_DIR / "districts_ap_ts.geojson"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for feat in data.get("features", []):
        name = feat["properties"]["district"]
        state = feat["properties"].get("state", "AP/Telangana")
        coords = feat["geometry"]["coordinates"]
        lons, lats = [], []

        def _flatten(c):
            for item in c:
                if isinstance(item[0], list):
                    _flatten(item)
                else:
                    lons.append(item[0])
                    lats.append(item[1])

        _flatten(coords)
        if lons and lats:
            _DISTRICT_CACHE[name] = {
                "name": name,
                "state": state,
                "lon": round(sum(lons) / len(lons), 3),
                "lat": round(sum(lats) / len(lats), 3),
            }
    return _DISTRICT_CACHE


def _match_district(query: str):
    """Fuzzy matches query text to a district name in AP/Telangana."""
    q = query.lower().strip()
    centers = _get_district_centers()

    # Aliases (English, Telugu, Hindi)
    aliases = {
        # English
        "visakhapatnam": "Visakhapatanam",
        "visakhapatanam": "Visakhapatanam",
        "vizag": "Visakhapatanam",
        "waltair": "Visakhapatanam",
        "vijayawada": "Ntr",
        "bezawada": "Ntr",
        "ntr": "Ntr",
        "kadapa": "Y.S.R.",
        "cuddapah": "Y.S.R.",
        "ysr": "Y.S.R.",
        "y.s.r.": "Y.S.R.",
        "nellore": "Spsr Nellore",
        "spsr nellore": "Spsr Nellore",
        "sps nellore": "Spsr Nellore",
        "rajahmundry": "East Godavari",
        "rajamundry": "East Godavari",
        "hyd": "Hyderabad",
        "secunderabad": "Hyderabad",
        "cyberabad": "Hyderabad",
        "tirupathi": "Tirupati",
        "tirupati": "Tirupati",
        "bapatla": "Bapatla",
        "gunturu": "Guntur",
        "kurnoolu": "Kurnool",
        "araku": "Alluri Sitharama Raju",
        "machilipatnam": "Krishna",

        # Telugu
        "హైదరాబాద్": "Hyderabad",
        "విశాఖపట్నం": "Visakhapatanam",
        "వైజాగ్": "Visakhapatanam",
        "విజయవాడ": "Ntr",
        "తిరుపతి": "Tirupati",
        "గుంటూరు": "Guntur",
        "వరంగల్": "Warangal",
        "కర్నూలు": "Kurnool",
        "నెల్లూరు": "Spsr Nellore",
        "బాపట్ల": "Bapatla",
        "ఖమ్మం": "Khammam",
        "నిజామాబాద్": "Nizamabad",
        "కడప": "Y.S.R.",
        "అనంతపురం": "Anantapur",

        # Hindi
        "हैदराबाद": "Hyderabad",
        "विशाखापट्टनम": "Visakhapatanam",
        "विजाग": "Visakhapatanam",
        "विजयवाड़ा": "Ntr",
        "तिरुपति": "Tirupati",
        "गुंटूर": "Guntur",
        "वारंगल": "Warangal",
        "कुर्नूल": "Kurnool",
        "नेल्लोर": "Spsr Nellore",
        "बापटला": "Bapatla",
        "खम्मम": "Khammam",
        "कडपा": "Y.S.R.",
    }
    for alias, target in aliases.items():
        if alias in q:
            return centers.get(target)

    # Direct match or substring
    for d_name, info in centers.items():
        dn = d_name.lower()
        if dn in q or (len(dn) > 4 and dn[:5] in q):
            return info

    return None


def _get_nearest_valid(ds, var, init_date, lead, lat, lon):
    """Finds nearest non-NaN grid point within search radius."""
    sub = ds[var].sel(init_time=init_date, method="nearest").sel(lead=lead)
    # Try exact point
    pt = sub.sel(lat=lat, lon=lon, method="nearest").values
    val = float(pt) if not np.isnan(pt) else None
    if val is not None:
        return round(val, 2)

    # Search nearby radius 0.5 degrees
    window = sub.sel(
        lat=slice(lat - 0.5, lat + 0.5),
        lon=slice(lon - 0.5, lon + 0.5)
    ).values
    valid_vals = window[~np.isnan(window)]
    if len(valid_vals) > 0:
        return round(float(valid_vals.mean()), 2)
    return None


# ─── /api/forecast/district ──────────────────────────────────────────────────
@app.get("/api/forecast/district")
def district_forecast(name: str = Query(...), date: str = Query(None)):
    """5-day forecast for a specific city or district."""
    dist_info = _match_district(name)
    if not dist_info:
        centers = _get_district_centers()
        raise HTTPException(
            404,
            f"District '{name}' not found. Available districts: {list(centers.keys())[:10]}..."
        )

    d_name = dist_info["name"]
    lat = dist_info["lat"]
    lon = dist_info["lon"]
    state = dist_info["state"]

    with xr.open_dataset(DATA_DIR / "blend_forecast.nc") as ds:
        init_time = pd.Timestamp(date) if date else pd.Timestamp(ds.init_time.values[-1])
        init_str = str(init_time.date())
        leads = [int(l) for l in ds.lead.values]

        forecast_days = []
        for l in leads:
            valid_dt = init_time + pd.Timedelta(days=l)
            r = _get_nearest_valid(ds, "rain", init_time, l, lat, lon)
            t = _get_nearest_valid(ds, "tmax", init_time, l, lat, lon)

            rain_val = r if r is not None else 0.0
            tmax_val = t if t is not None else 31.0

            # Categorization
            if rain_val < 1.0:
                cat = "Dry / Sunny"
                icon = "☀️"
            elif rain_val < 15.0:
                cat = "Light Showers"
                icon = "🌦"
            elif rain_val < 35.0:
                cat = "Moderate Rain"
                icon = "🌧"
            elif rain_val < 65.0:
                cat = "Heavy Rainfall"
                icon = "⛈"
            else:
                cat = "Extremely Heavy Rainfall"
                icon = "🚨"

            forecast_days.append({
                "lead": l,
                "valid_date": str(valid_dt.date()),
                "day_name": valid_dt.strftime("%A"),
                "rain_mm": rain_val,
                "tmax_c": tmax_val,
                "condition": cat,
                "icon": icon,
            })

    # Check alerts from alerts.csv
    alerts_df = pd.read_csv(DATA_DIR / "alerts.csv", parse_dates=["init_date", "valid_date"])
    alerts_match = alerts_df[
        (alerts_df["district"].str.lower() == d_name.lower())
        & (alerts_df["init_date"].dt.strftime("%Y-%m-%d") == init_str)
    ]
    alerts_list = alerts_match.to_dict(orient="records") if not alerts_match.empty else []

    return {
        "district": d_name,
        "state": state,
        "coordinates": {"lat": lat, "lon": lon},
        "issued_date": init_str,
        "forecast": forecast_days,
        "alerts": alerts_list,
    }


# ─── /api/chat ───────────────────────────────────────────────────────────────
@app.get("/api/chat")
@app.post("/api/chat")
def chat(q: str = Query(None), body: dict = None):
    """
    Intelligent Weather Chatbot:
    Answers queries like: 'What will be the weather in Hyderabad over the next 5 days?'
    """
    query_text = (q or (body.get("message") if body else "") or "").strip()
    if not query_text:
        return {
            "reply": (
                "👋 **Namaste! I am Megha Mitra (మేఘ మిత్ర / मेघ मित्र)**, your AI meteorological companion for Andhra Pradesh & Telangana. "
                "You can ask me questions like:\n\n"
                "• *'What is the 5-day weather in Hyderabad?'*\n"
                "• *'Will it rain in Visakhapatnam this week?'*\n"
                "• *'What is the temperature in Vijayawada?'*\n"
                "• *'Are there any red alerts in Bapatla or Nellore?'*"
            ),
            "district": None,
            "forecast": []
        }

    q_lower = query_text.lower()
    dist_info = _match_district(query_text)

    # Detect language
    is_telugu = any('\u0c00' <= ch <= '\u0c7f' for ch in query_text)
    is_hindi = any('\u0900' <= ch <= '\u097f' for ch in query_text)

    # Default to Hyderabad if asking general weather without a district
    if not dist_info:
        if "cyclone" in q_lower or "michaung" in q_lower:
            dist_info = _get_district_centers().get("Bapatla")
        elif "capital" in q_lower or "today" in q_lower:
            dist_info = _get_district_centers().get("Hyderabad")
        else:
            return {
                "reply": (
                    f"I couldn't identify the specific district in your query: *\"{query_text}\"*. "
                    "Please specify one of the 59 districts in Andhra Pradesh or Telangana "
                    "(e.g., *Hyderabad, Visakhapatnam, Vijayawada, Tirupati, Guntur, Warangal, Kurnool, Bapatla*)."
                ),
                "district": None,
                "forecast": []
            }

    d_name = dist_info["name"]
    state = dist_info["state"]

    # Check if querying Cyclone Michaung specific date
    date_to_use = "2023-12-04" if ("michaung" in q_lower or "cyclone" in q_lower) else None
    fc = district_forecast(name=d_name, date=date_to_use)

    forecast_items = fc["forecast"]
    alerts = fc["alerts"]

    # Construct intelligent conversational reply
    lead1 = forecast_items[0]
    total_rain = sum(f["rain_mm"] for f in forecast_items)
    max_temp = max(f["tmax_c"] for f in forecast_items)

    lines = []
    if is_telugu:
        lines.append(f"🌦 **{d_name} ({state}) రాబోయే 5 రోజుల వాతావరణ నివేదిక:**\n")
        lines.append(f"• **రేపటి వాతావరణం ({lead1['day_name']}):** గరిష్ట ఉష్ణోగ్రత **{lead1['tmax_c']}°C**, వర్షపాతం **{lead1['rain_mm']} mm** ({lead1['condition']}).")
        lines.append(f"• **5 రోజుల సారాంశం:** మొత్తం వర్షపాతం ~**{total_rain:.1f} mm**, గరిష్ట ఉష్ణోగ్రత **{max_temp:.1f}°C**.")
    elif is_hindi:
        lines.append(f"🌦 **{d_name} ({state}) के लिए अगले 5 दिनों का मौसम पूर्वानुमान:**\n")
        lines.append(f"• **कल का मौसम ({lead1['day_name']}):** अधिकतम तापमान **{lead1['tmax_c']}°C**, वर्षा **{lead1['rain_mm']} mm** ({lead1['condition']}).")
        lines.append(f"• **5-दिवसीय सारांश:** कुल अनुमानित वर्षा ~**{total_rain:.1f} mm**, अधिकतम तापमान **{max_temp:.1f}°C**.")
    else:
        lines.append(f"🌦 **5-Day Weather Outlook for {d_name} ({state}):**\n")
        lines.append(f"• **Tomorrow ({lead1['day_name']}):** High of **{lead1['tmax_c']}°C** with **{lead1['rain_mm']} mm** rainfall ({lead1['condition']}).")
        lines.append(f"• **5-Day Total:** Expected accumulated rainfall is **{total_rain:.1f} mm**, with peak temperature reaching **{max_temp:.1f}°C**.")

    # Alert warning check
    if alerts:
        highest_alert = alerts[0]
        lvl = highest_alert.get("level", "alert").upper()
        msg = highest_alert.get("message_en", "")
        if is_telugu and highest_alert.get("message_te"):
            msg = highest_alert.get("message_te")
        lines.append(f"\n⚠️ **{lvl} ALERT ACTIVE:** {msg}")
    else:
        lines.append("\n✅ **No severe weather alerts** active for this district.")

    lines.append("\n**📅 Day-by-Day Forecast Table:**")
    for f in forecast_items:
        lines.append(f"- **Day {f['lead']} ({f['day_name'][:3]}, {f['valid_date'][5:]}):** {f['icon']} {f['rain_mm']} mm | 🌡 {f['tmax_c']}°C ({f['condition']})")

    reply_str = "\n".join(lines)

    return {
        "query": query_text,
        "district": d_name,
        "state": state,
        "reply": reply_str,
        "forecast": forecast_items,
        "alerts": alerts,
        "total_rain_mm": round(total_rain, 1),
        "max_temp_c": round(max_temp, 1)
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)

