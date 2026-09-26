"""
verify_alerts.py  -  P1: how good are our alerts, and how should the rain trigger be set?

Run from the repo root:
    python -m sources.verify_alerts

For every district and day, an "observed event" uses the SAME rules on IMD observations:
  heavy rain = observed 24-h rain >= 64.5 mm somewhere in the district
  heatwave   = observed IMD heatwave criteria somewhere in the district

Scores (per lead day):
  POD  = share of real events we warned about          (higher is better)
  FAR  = share of our warnings that did not happen     (lower is better)
  CSI  = hits / (hits + misses + false alarms)          (higher is better)

Calibration (learned on 2022 only, tested on 2023): the blend smooths extremes, so
  rain: one forecast trigger (mm) that best predicts an observed >= 64.5 mm day, leads 1-2
  heat: a per-lead warm offset (C) added to the forecast before applying IMD criteria
Saved to data/alert_triggers.csv; alerts.py applies it automatically.
"""
import warnings
import numpy as np
import pandas as pd
import geopandas as gpd
from sources.common import load, DATA_DIR, LAT, LON

warnings.filterwarnings("ignore")
HEAVY = 64.5
TRIGGERS = np.round(np.arange(10.0, 65.0, 2.5), 1)

# ---------- district -> grid cells (same rule as alerts.py) ----------
gdf = gpd.read_file(DATA_DIR / "districts_ap_ts.geojson")[["district", "state", "geometry"]]
jj, ii = np.meshgrid(np.arange(len(LON)), np.arange(len(LAT)))
lon2d, lat2d = np.meshgrid(LON, LAT)
pts = gpd.GeoDataFrame({"i": ii.ravel(), "j": jj.ravel()},
                       geometry=gpd.points_from_xy(lon2d.ravel(), lat2d.ravel()), crs="EPSG:4326")
joined = gpd.sjoin(pts, gdf.to_crs("EPSG:4326"), predicate="within", how="inner")
cells = []
for _, row in gdf.iterrows():
    hit = joined[(joined["district"] == row["district"]) & (joined["state"] == row["state"])]
    if len(hit):
        cells.append((hit["i"].values, hit["j"].values))
    else:
        p = row["geometry"].representative_point()
        cells.append((np.array([np.abs(LAT - p.y).argmin()]), np.array([np.abs(LON - p.x).argmin()])))

obs = load("imd_obs")[["rain", "tmax"]].load()
blend_all = load("blend_forecast")
clim_all = load("climatology")


def prepare(year):
    """District-level forecast and observed values for one year: arrays (district, init, lead)."""
    fc = blend_all.sel(init_time=slice(f"{year}-01-01", f"{year}-12-31")).load()
    cl = clim_all.sel(init_time=fc.init_time, lead=fc.lead).load()
    init, leads = fc.init_time.values, fc.lead.values

    def at_valid(var):
        out = np.empty((len(init), len(leads), len(LAT), len(LON)), dtype="float32")
        for li, L in enumerate(leads):
            out[:, li] = obs[var].reindex(time=init + np.timedelta64(int(L), "D")).values
        return out

    order = ("init_time", "lead", "lat", "lon")
    f_rain = fc["rain"].transpose(*order).values
    f_tmax = fc["tmax"].transpose(*order).values
    normal = cl["tmax"].transpose(*order).values
    o_rain, o_tmax = at_valid("rain"), at_valid("tmax")

    return {
        "leads": leads,
        "f_rain": district(f_rain, np.nanmax), "o_rain": district(o_rain, np.nanmax),
        "f_tmax": f_tmax, "f_dep": f_tmax - normal,
        "o_heat": district(heat(o_tmax, o_tmax - normal), np.any),
    }


def heat(t, dep):
    """IMD heatwave (plains): >= 40 C and >= 4.5 C above normal, or >= 45 C."""
    return ((t >= 40) & (dep >= 4.5)) | (t >= 45)


def district(a, fn):
    """Grid (init, lead, lat, lon) -> districts (district, init, lead)."""
    return np.stack([fn(a[:, :, I, J], axis=-1) for I, J in cells])


def f_heat(d, offsets):
    """Forecast heat events after adding a per-lead warm offset (bias correction)."""
    off = np.asarray(offsets, dtype="float32")[None, :, None, None]
    return district(heat(d["f_tmax"] + off, d["f_dep"] + off), np.any)


def scores(fcst_event, obs_event):
    """POD, FAR, CSI per lead from boolean arrays (district, init, lead)."""
    h = (fcst_event & obs_event).sum(axis=(0, 1))
    m = (~fcst_event & obs_event).sum(axis=(0, 1))
    fa = (fcst_event & ~obs_event).sum(axis=(0, 1))
    with np.errstate(invalid="ignore", divide="ignore"):
        return h, m, fa, h / (h + m), fa / (h + fa), h / (h + m + fa)


def table(name, leads, fe, oe):
    h, m, fa, pod, far, csi = scores(fe, oe)
    df = pd.DataFrame({"lead": leads, "hits": h, "misses": m, "false_alarms": fa,
                       "POD": pod, "FAR": far, "CSI": csi}).set_index("lead")
    print(f"\n{name}")
    print(df.round(2).to_string())
    return df


print("Preparing 2022 (calibration) and 2023 (test) ...")
d22, d23 = prepare("2022"), prepare("2023")
leads = d23["leads"]
o22, o23 = d22["o_rain"] >= HEAVY, d23["o_rain"] >= HEAVY
print(f"Observed heavy-rain district-days in 2023: {int(o23[:, :, 0].sum())}")

RAIN_MAX_LEAD = 1          # rain alerts only where the system has skill
OFFSETS = np.round(np.arange(0.0, 4.01, 0.5), 1)
nL = len(leads)

# ---------- 1. Current rules, 2023 ----------
table("HEATWAVE alerts, 2023 (current rules)", leads, f_heat(d23, np.zeros(nL)), d23["o_heat"])
table("HEAVY RAIN alerts, 2023 (current rule: forecast >= 64.5 mm)", leads,
      d23["f_rain"] >= HEAVY, o23)

# ---------- 2. Calibrate on 2022 only ----------
# Rain: ONE trigger shared by leads 1-2 (pooled, so a single noisy year can't overfit each lead)
use = slice(0, RAIN_MAX_LEAD)
pooled = [np.nan_to_num(scores((d22["f_rain"][:, :, use] >= t).reshape(-1, 1, 1),
                                o22[:, :, use].reshape(-1, 1, 1))[5][0]) for t in TRIGGERS]
rain_trig = float(TRIGGERS[int(np.argmax(pooled))])

# Heat: per-lead warm offset in C (the blend is too cool at longer leads)
heat_off = []
for li in range(nL):
    csis = []
    for o in OFFSETS:
        offs = np.zeros(nL); offs[li] = o
        csis.append(np.nan_to_num(scores(f_heat(d22, offs)[:, :, li:li + 1],
                                         d22["o_heat"][:, :, li:li + 1])[5][0]))
    heat_off.append(float(OFFSETS[int(np.argmax(csis))]))
heat_off = np.array(heat_off)

print(f"\nCalibrated on 2022:  rain trigger = {rain_trig:.1f} mm (leads 1-{RAIN_MAX_LEAD} only)")
print("                     heat offset  = " + "  ".join(f"L{L}=+{o:.1f}C" for L, o in zip(leads, heat_off)))

# ---------- 3. Test the calibrated rules on 2023 ----------
rain_fe = (d23["f_rain"] >= rain_trig) & (np.arange(nL) < RAIN_MAX_LEAD)[None, None, :]
table("HEAVY RAIN alerts, 2023 (calibrated, leads 1-2 only)", leads, rain_fe, o23)
table("HEATWAVE alerts, 2023 (calibrated)", leads, f_heat(d23, heat_off), d23["o_heat"])

pd.DataFrame({
    "lead": leads,
    "rain_trigger_mm": rain_trig,
    "rain_alerts_on": np.arange(nL) < RAIN_MAX_LEAD,
    "heat_offset_c": heat_off,
}).to_csv(DATA_DIR / "alert_triggers.csv", index=False)
print(f"\nSaved {DATA_DIR / 'alert_triggers.csv'}  (alerts.py will use it)")
