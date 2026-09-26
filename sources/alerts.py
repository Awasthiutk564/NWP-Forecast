"""
alerts.py  -  P1: turns the blended forecast into district warnings (English + Telugu).

Run from the repo root:
    python -m sources.alerts

Reads:   data/blend_forecast.nc, data/climatology.nc, data/districts_ap_ts.geojson
Writes:  data/alerts.csv   (UTF-8, columns exactly as P4's Alerts page expects)

Rules (IMD thresholds):
  Heavy rain, 24-h rainfall at any grid point in the district:
    yellow  >= 64.5 mm   (heavy)
    orange  >= 115.6 mm  (very heavy)
    red     >= 204.5 mm  (extremely heavy)
  Heatwave (IMD plains criteria; "normal" = our day-of-year climatology):
    yellow  Tmax >= 40 C and >= 4.5 C above normal, or Tmax >= 45 C   (heatwave)
    orange  Tmax >= 40 C and >= 6.5 C above normal, or Tmax >= 47 C   (severe heatwave)
    red     Tmax >= 47 C
Only the test year (2023) is used, because earlier years were seen during training.
If data/alert_triggers.csv exists (from verify_alerts.py), the forecast is first
calibrated: rain scaled so the learned trigger maps to 64.5 mm (leads 1-2 only),
and a per-lead warm offset added to Tmax. The IMD rules above are then applied.
"""
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd
from sources.common import load, DATA_DIR, LAT, LON

warnings.filterwarnings("ignore")        # all-NaN sea points, centroid-on-lat/lon notices

ALERT_YEAR = "2023"
LEVELS = {1: "yellow", 2: "orange", 3: "red"}

# ---------- Telugu / English text ----------
TE_LEVEL = {"yellow": "పసుపు హెచ్చరిక", "orange": "నారింజ హెచ్చరిక", "red": "ఎరుపు హెచ్చరిక"}
EN_RAIN = {"yellow": "Heavy rain", "orange": "Very heavy rain", "red": "Extremely heavy rain"}
TE_RAIN = {"yellow": "భారీ వర్షాలు", "orange": "అతి భారీ వర్షాలు", "red": "అత్యంత భారీ వర్షాలు"}
EN_HEAT = {"yellow": "Heatwave", "orange": "Severe heatwave", "red": "Extreme heat"}
TE_HEAT = {"yellow": "వడగాలులు", "orange": "తీవ్ర వడగాలులు", "red": "అత్యంత తీవ్ర వడగాలులు"}


def messages(hazard, level, district, date, value):
    d = pd.Timestamp(date).strftime("%d-%m-%Y")
    if hazard == "heavy_rain":
        en = (f"{level.upper()} ALERT: {EN_RAIN[level]} likely in {district} district on {d} "
              f"(calibrated forecast about {value:.0f} mm). Stay alert and avoid low-lying areas.")
        te = (f"{TE_LEVEL[level]}: {district} జిల్లాలో {d} న {TE_RAIN[level]} కురిసే అవకాశం ఉంది "
              f"(సుమారు {value:.0f} మి.మీ.). అప్రమత్తంగా ఉండండి, లోతట్టు ప్రాంతాలకు దూరంగా ఉండండి.")
    else:
        en = (f"{level.upper()} ALERT: {EN_HEAT[level]} likely in {district} district on {d} "
              f"(max temperature {value:.1f} °C). Avoid going out in the afternoon and drink enough water.")
        te = (f"{TE_LEVEL[level]}: {district} జిల్లాలో {d} న {TE_HEAT[level]} వీచే అవకాశం ఉంది "
              f"(గరిష్ఠ ఉష్ణోగ్రత {value:.1f} °C). మధ్యాహ్నం బయటకు వెళ్లకండి, తగినంత నీరు తాగండి.")
    return en, te


# ---------- 1. Which grid cells belong to which district ----------
print("Matching grid cells to districts ...")
gdf = gpd.read_file(DATA_DIR / "districts_ap_ts.geojson")[["district", "state", "geometry"]]
jj, ii = np.meshgrid(np.arange(len(LON)), np.arange(len(LAT)))
lon2d, lat2d = np.meshgrid(LON, LAT)
pts = gpd.GeoDataFrame({"i": ii.ravel(), "j": jj.ravel()},
                       geometry=gpd.points_from_xy(lon2d.ravel(), lat2d.ravel()), crs="EPSG:4326")
joined = gpd.sjoin(pts, gdf.to_crs("EPSG:4326"), predicate="within", how="inner")

cells = {}
n_nearest = 0
for _, row in gdf.iterrows():
    key = (row["district"], row["state"])
    hit = joined[(joined["district"] == row["district"]) & (joined["state"] == row["state"])]
    if len(hit):
        cells[key] = (hit["i"].values, hit["j"].values)
    else:                                   # small district: use the nearest grid point
        p = row["geometry"].representative_point()
        cells[key] = (np.array([np.abs(LAT - p.y).argmin()]), np.array([np.abs(LON - p.x).argmin()]))
        n_nearest += 1
print(f"  {len(cells)} districts ({n_nearest} small ones use their nearest grid point)")

# ---------- 2. Load the forecast for the test year ----------
print(f"Loading blend forecast for {ALERT_YEAR} ...")
fc = load("blend_forecast").sel(init_time=slice(f"{ALERT_YEAR}-01-01", f"{ALERT_YEAR}-12-31")).load()
clim = load("climatology").sel(init_time=fc.init_time, lead=fc.lead).load()
init = fc.init_time.values
leads = fc.lead.values

rain = fc["rain"].transpose("init_time", "lead", "lat", "lon").values
tmax = fc["tmax"].transpose("init_time", "lead", "lat", "lon").values
dep = tmax - clim["tmax"].transpose("init_time", "lead", "lat", "lon").values

# ---------- Calibration from verify_alerts.py (learned on 2022) ----------
trig_path = DATA_DIR / "alert_triggers.csv"
if trig_path.exists():
    trig = pd.read_csv(trig_path).set_index("lead").reindex(leads)
    scale = (64.5 / trig["rain_trigger_mm"].values)[None, :, None, None]   # calibrated rain
    on = trig["rain_alerts_on"].values.astype(bool)[None, :, None, None]
    off = trig["heat_offset_c"].values[None, :, None, None]
    rain = np.where(on, rain * scale, 0.0)
    tmax, dep = tmax + off, dep + off
    print("  Using calibrated triggers from alert_triggers.csv")
else:
    print("  No alert_triggers.csv - using raw IMD thresholds (run verify_alerts first)")

rain_lvl = (rain >= 64.5).astype(int) + (rain >= 115.6) + (rain >= 204.5)
hw = ((tmax >= 40) & (dep >= 4.5)) | (tmax >= 45)
severe = ((tmax >= 40) & (dep >= 6.5)) | (tmax >= 47)
heat_lvl = hw.astype(int) + severe + (tmax >= 47)

# Next-day alerts only: verification on 2023 shows skill at lead 1; longer leads
# either miss almost everything or flood the map with false alarms.
ALERT_MAX_LEAD = 1
day_ok = (leads <= ALERT_MAX_LEAD)[None, :, None, None]
rain_lvl, heat_lvl = rain_lvl * day_ok, heat_lvl * day_ok

# ---------- 3. District-level alerts ----------
rows = []
for (district, state), (I, J) in cells.items():
    for hazard, lvl, val in [("heavy_rain", rain_lvl, rain), ("heatwave", heat_lvl, tmax)]:
        d_lvl = lvl[:, :, I, J].max(axis=-1)                 # worst cell in the district
        d_val = np.nanmax(val[:, :, I, J], axis=-1)
        for t, l in np.argwhere(d_lvl > 0):
            level = LEVELS[int(d_lvl[t, l])]
            valid = init[t] + np.timedelta64(int(leads[l]), "D")
            en, te = messages(hazard, level, district, valid, float(d_val[t, l]))
            rows.append({
                "init_date": pd.Timestamp(init[t]).strftime("%Y-%m-%d"),
                "valid_date": pd.Timestamp(valid).strftime("%Y-%m-%d"),
                "lead": int(leads[l]),
                "district": district,
                "state": state,
                "hazard": hazard,
                "level": level,
                "value": round(float(d_val[t, l]), 1),
                "message_en": en,
                "message_te": te,
            })

cols = ["init_date", "valid_date", "lead", "district", "state",
        "hazard", "level", "value", "message_en", "message_te"]
alerts = pd.DataFrame(rows, columns=cols).sort_values(["init_date", "lead", "district", "hazard"])
alerts.to_csv(DATA_DIR / "alerts.csv", index=False, encoding="utf-8")

# ---------- 4. Summary ----------
print(f"\nSaved {DATA_DIR / 'alerts.csv'}  ({len(alerts)} alerts)")
if len(alerts):
    print("\nAlerts by hazard and level:")
    print(alerts.groupby(["hazard", "level"]).size().to_string())
    print(f"\nDistricts with at least one alert: {alerts['district'].nunique()} of {len(cells)}")
    print("\nExample:")
    print(" ", alerts.iloc[0]["message_en"])
else:
    print("No thresholds crossed in the forecast - see note from Claude before changing anything.")
