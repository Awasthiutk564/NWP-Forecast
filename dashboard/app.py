import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd
import geopandas as gpd
import plotly.graph_objects as go
import streamlit as st
from sources.common import load

st.set_page_config(page_title="NWP Hybrid Forecast", layout="wide")

VAR_INFO = {
    "rain": {"label": "Rainfall", "unit": "mm/day", "colorscale": "Blues"},
    "tmax": {"label": "Max temperature", "unit": "°C", "colorscale": "RdYlBu_r"},
}

# One clear colour per source on the scorecard (BLEND is always thick red)
SOURCE_COLORS = {
    "persistence": "#9e9e9e",  # grey
    "climatology": "#4c9be8",  # blue
    "linreg": "#f2c14e",       # yellow
    "lgbm": "#43b581",         # green
}

# Alert level colours (IMD-style colour codes)
LEVEL_COLORS = {
    "yellow": "rgba(255, 212, 0, 0.85)",
    "orange": "rgba(255, 140, 0, 0.85)",
    "red": "rgba(220, 20, 20, 0.85)",
}
LEVEL_RANK = {"yellow": 1, "orange": 2, "red": 3}


def var_label(v):
    return VAR_INFO.get(v, {}).get("label", v)


def polygons(geom):
    """A district can be one polygon or several (islands); always return a list."""
    return list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]


# ---------- cached loaders (so the app doesn't reload files on every click) ----------
@st.cache_resource
def get_dataset(name):
    return load(name)


@st.cache_resource
def get_districts():
    return gpd.read_file(ROOT / "data" / "districts_ap_ts.geojson")


@st.cache_data
def district_lines():
    """All district outlines as one long list of x/y points, separated by None."""
    xs, ys = [], []
    for geom in get_districts().geometry:
        for p in polygons(geom):
            x, y = p.exterior.xy
            xs += list(x) + [None]
            ys += list(y) + [None]
    return xs, ys


@st.cache_data
def get_scores():
    return pd.read_csv(ROOT / "data" / "blend_scores.csv")


def map_figure(field, var, title):
    """Gridded field as a heatmap with district outlines on top."""
    info = VAR_INFO[var]
    xs, ys = district_lines()
    fig = go.Figure()
    fig.add_trace(go.Heatmap(
        x=field.lon.values, y=field.lat.values, z=field.values,
        colorscale=info["colorscale"],
        zmin=0 if var == "rain" else None,
        colorbar=dict(title=info["unit"]),
        hovertemplate="lon %{x}<br>lat %{y}<br>%{z:.1f} " + info["unit"] + "<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=xs, y=ys, mode="lines",
        line=dict(color="gray", width=0.8),
        hoverinfo="skip", showlegend=False,
    ))
    fig.update_yaxes(scaleanchor="x", scaleratio=1, title="Latitude (°N)")
    fig.update_xaxes(title="Longitude (°E)")
    fig.update_layout(title=title, height=650, margin=dict(l=10, r=10, t=50, b=10))
    return fig


def weight_figure(field, title, zmax):
    """One small map of blend weights (0 = ignored, higher = trusted more)."""
    xs, ys = district_lines()
    fig = go.Figure()
    fig.add_trace(go.Heatmap(
        x=field.lon.values, y=field.lat.values, z=field.values,
        colorscale="Viridis", zmin=0, zmax=zmax,
        colorbar=dict(title="weight"),
        hovertemplate="lon %{x}<br>lat %{y}<br>weight %{z:.2f}<extra></extra>",
    ))
    fig.add_trace(go.Scatter(
        x=xs, y=ys, mode="lines",
        line=dict(color="white", width=0.6),
        hoverinfo="skip", showlegend=False,
    ))
    fig.update_yaxes(scaleanchor="x", scaleratio=1)
    fig.update_layout(title=title, height=420, margin=dict(l=10, r=10, t=40, b=10))
    return fig


# ---------- sidebar ----------
page = st.sidebar.radio(
    "Page",
    ["Forecast map", "Weight maps", "Skill scorecard", "Alerts"],
)

st.title("Hybrid AI–NWP Forecast: Andhra Pradesh & Telangana")

# ---------- Page a: Forecast map ----------
if page == "Forecast map":
    ds = get_dataset("blend_forecast")
    dates = pd.to_datetime(ds.init_time.values)

    c1, c2, c3 = st.columns(3)
    var = c1.selectbox("Variable", list(VAR_INFO), format_func=var_label)
    picked = c2.date_input(
        "Forecast issued on",
        value=dates[-1].date(),
        min_value=dates[0].date(),
        max_value=dates[-1].date(),
    )
    lead = c3.select_slider("Lead time (days ahead)", options=list(ds.lead.values), value=1)

    field = ds[var].sel(init_time=pd.Timestamp(picked), method="nearest").sel(lead=lead)
    init = pd.Timestamp(field.init_time.values)
    valid = init + pd.Timedelta(days=int(lead))

    title = (f"Blended {var_label(var).lower()} forecast. "
             f"Issued {init:%d %b %Y}, valid {valid:%d %b %Y} (day {lead})")
    st.plotly_chart(map_figure(field, var, title), width="stretch")

    st.caption(
        f"Area max: {float(field.max()):.1f} {VAR_INFO[var]['unit']} · "
        f"Area mean: {float(field.mean()):.1f} {VAR_INFO[var]['unit']}"
    )

# ---------- Page b: Weight maps ----------
elif page == "Weight maps":
    wds = get_dataset("blend_weights")

    c1, c2 = st.columns(2)
    var = c1.selectbox("Variable", list(VAR_INFO), format_func=var_label, key="w_var")
    lead = c2.select_slider("Lead time (days ahead)",
                            options=list(wds.lead.values), value=1, key="w_lead")

    w = wds[var].sel(lead=lead)
    zmax = float(w.max())  # same colour scale on all 4 maps so they're comparable
    st.write(f"How much the blend trusts each source for "
             f"**{var_label(var).lower()}** at **day {lead}**. Brighter = more trust.")

    cols = st.columns(2)
    for i, s in enumerate(wds.source.values):
        field = w.sel(source=s)
        title = f"{s} (area mean {float(field.mean()):.2f})"
        cols[i % 2].plotly_chart(weight_figure(field, title, zmax), width="stretch")

# ---------- Page c: Skill scorecard ----------
elif page == "Skill scorecard":
    scores = get_scores()
    var = st.selectbox("Variable", sorted(scores["var"].unique()),
                       format_func=var_label, key="s_var")
    d = scores[scores["var"] == var].sort_values("lead")
    unit = VAR_INFO.get(var, {}).get("unit", "")

    # Find the blend row, whatever capitalisation it uses
    is_blend = d["source"].astype(str).str.lower().str.contains("blend")
    blend_name = d.loc[is_blend, "source"].iloc[0] if is_blend.any() else None

    # Draw the other sources first, then the blend on top
    sources = [s for s in d["source"].unique() if s != blend_name]
    if blend_name is not None:
        sources.append(blend_name)

    fig = go.Figure()
    for s in sources:
        g = d[d["source"] == s]
        if s == blend_name:
            fig.add_trace(go.Scatter(
                x=g["lead"], y=g["rmse"], mode="lines+markers", name="BLEND",
                line=dict(width=5, color="#ff4b4b"), marker=dict(size=11),
            ))
        else:
            color = SOURCE_COLORS.get(str(s).lower(), "#bbbbbb")
            fig.add_trace(go.Scatter(
                x=g["lead"], y=g["rmse"], mode="lines+markers", name=str(s),
                line=dict(width=2, dash="dot", color=color), marker=dict(size=7, color=color),
            ))
    fig.update_xaxes(title="Lead time (days)", dtick=1)
    fig.update_yaxes(title=f"RMSE ({unit}), lower is better")
    fig.update_layout(
        title=f"{var_label(var)}: forecast error vs lead time (test year 2023)",
        height=500, margin=dict(l=10, r=10, t=50, b=10),
    )
    st.plotly_chart(fig, width="stretch")

    # Table: one row per source, one column per lead day
    table = d.pivot_table(index="source", columns="lead", values="rmse").round(2)
    table.columns = [f"Day {c}" for c in table.columns]
    st.dataframe(table, width="stretch")

    # Blend vs best single source at each lead
    if blend_name is None:
        st.warning(f"No blend row found. Sources in the file: {list(d['source'].unique())}")
    else:
        parts = []
        for lead_val, g in d.groupby("lead"):
            blend_rmse = g.loc[g["source"] == blend_name, "rmse"].iloc[0]
            others = g[g["source"] != blend_name]
            best = others.loc[others["rmse"].idxmin()]
            diff = (blend_rmse - best["rmse"]) / best["rmse"] * 100
            parts.append(f"Day {lead_val}: {diff:+.1f}% vs {best['source']}")
        st.caption("Blend RMSE compared with the best single source "
                   "(negative = blend is better): " + " · ".join(parts))

# ---------- Page d: Alerts ----------
elif page == "Alerts":
    path = ROOT / "data" / "alerts.csv"
    if not path.exists():
        st.warning("data/alerts.csv not found yet. P1 is building it.")
        st.stop()

    # Read fresh every time, so P1's new file shows up without restarting
    alerts = pd.read_csv(path, parse_dates=["init_date", "valid_date"], encoding="utf-8")
    alerts["level"] = alerts["level"].astype(str).str.lower().str.strip()
    gdf = get_districts()

    # Safety check: every district in alerts.csv must exist in the map file
    missing = sorted(set(alerts["district"]) - set(gdf["district"]))
    if missing:
        st.warning("These district names in alerts.csv don't match the map file, "
                   "so they won't appear on the map: " + ", ".join(missing))

    c1, c2, c3 = st.columns(3)
    inits = sorted(alerts["init_date"].unique(), reverse=True)
    init = c1.selectbox("Forecast issued on", inits,
                        format_func=lambda d: pd.Timestamp(d).strftime("%d %b %Y"))
    a = alerts[alerts["init_date"] == init]

    valids = sorted(a["valid_date"].unique())
    valid = c2.selectbox("Valid for", valids,
                         format_func=lambda d: pd.Timestamp(d).strftime("%d %b %Y"))

    hazards = sorted(a["hazard"].unique())
    chosen = c3.multiselect("Hazard", hazards, default=hazards,
                            format_func=lambda h: str(h).replace("_", " ").title())

    a = a[(a["valid_date"] == valid) & (a["hazard"].isin(chosen))].copy()
    a["rank"] = a["level"].map(LEVEL_RANK).fillna(0)

    # --- Map: each district coloured by its highest alert level ---
    worst = a.sort_values("rank").groupby("district").tail(1)
    xs, ys = district_lines()
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=xs, y=ys, mode="lines",
        line=dict(color="gray", width=0.8),
        hoverinfo="skip", showlegend=False,
    ))
    shown = set()
    for _, row in worst.sort_values("rank").iterrows():
        match = gdf.loc[gdf["district"] == row["district"], "geometry"]
        if match.empty:
            continue
        lvl = row["level"]
        for p in polygons(match.iloc[0]):
            x, y = p.exterior.xy
            fig.add_trace(go.Scatter(
                x=list(x), y=list(y), mode="lines", fill="toself",
                fillcolor=LEVEL_COLORS.get(lvl, "rgba(150,150,150,0.8)"),
                line=dict(color="black", width=1),
                name=lvl.title(), legendgroup=lvl, showlegend=lvl not in shown,
                hoveron="fills", hoverinfo="text",
                text=f"{row['district']} ({lvl}): {row['message_en']}",
            ))
            shown.add(lvl)
    fig.update_yaxes(scaleanchor="x", scaleratio=1, title="Latitude (°N)")
    fig.update_xaxes(title="Longitude (°E)")
    fig.update_layout(
        title=(f"District alerts valid {pd.Timestamp(valid):%d %b %Y} "
               f"(issued {pd.Timestamp(init):%d %b %Y})"),
        height=650, margin=dict(l=10, r=10, t=50, b=10),
    )
    st.plotly_chart(fig, width="stretch")

    # --- Table ---
    if a.empty:
        st.success("No alerts for this selection.")
    else:
        st.caption(f"{len(a)} alert(s) · worst first")
        table = a.sort_values(["rank", "district"], ascending=[False, True])[
            ["district", "state", "hazard", "level", "value", "lead", "message_en", "message_te"]
        ]
        st.dataframe(table, hide_index=True, width="stretch")