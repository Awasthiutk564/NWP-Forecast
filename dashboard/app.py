import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
import geopandas as gpd
import plotly.graph_objects as go
import streamlit as st
import xarray as xr
from sources.common import load

st.set_page_config(page_title="NWP Hybrid Forecast", layout="wide")

VAR_INFO = {
    "rain": {"label": "Rainfall", "unit": "mm/day", "colorscale": "Blues"},
    "tmax": {"label": "Max temperature", "unit": "°C", "colorscale": "RdYlBu_r"},
    "wspd": {"label": "Wind speed", "unit": "m/s", "colorscale": "Purples"},
}

# One clear colour per source on the scorecard (BLEND is always thick red)
SOURCE_COLORS = {
    "persistence": "#9e9e9e",  # grey
    "climatology": "#4c9be8",  # blue
    "linreg": "#f2c14e",       # yellow
    "lgbm": "#43b581",         # green
    "s2s_nwp": "#b57edc",      # purple - the physical NWP model
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


def data_file(name):
    return ROOT / "data" / name


def need(name, what):
    """Stop the page cleanly if a data file hasn't been generated yet."""
    if not data_file(name).exists():
        st.warning(f"`data/{name}` not found. Run `{what}` first.")
        st.stop()


# ---------- cached loaders (so the app doesn't reload files on every click) ----------
@st.cache_resource
def get_dataset(name):
    return load(name)


@st.cache_resource
def open_nc(name):
    return xr.open_dataset(data_file(name))


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
def read_csv(name):
    return pd.read_csv(data_file(name))


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
        zmin=0 if var in ("rain", "wspd") else None,
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


def skill_chart(d, var, title, blend_label="BLEND"):
    """Line chart of RMSE vs lead, one line per source, blend drawn thick."""
    unit = VAR_INFO.get(var, {}).get("unit", "")
    is_blend = d["source"].astype(str).str.lower().str.contains("blend")
    blend_name = d.loc[is_blend, "source"].iloc[0] if is_blend.any() else None
    sources = [s for s in d["source"].unique() if s != blend_name]
    if blend_name is not None:
        sources.append(blend_name)

    fig = go.Figure()
    for s in sources:
        g = d[d["source"] == s].sort_values("lead")
        if s == blend_name:
            fig.add_trace(go.Scatter(
                x=g["lead"], y=g["rmse"], mode="lines+markers", name=blend_label,
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
    fig.update_layout(title=title, height=500, margin=dict(l=10, r=10, t=50, b=10))
    return fig, blend_name


def blend_vs_best(d, blend_name):
    """Caption comparing the blend with the best single source at each lead."""
    if blend_name is None:
        return None
    parts = []
    for lead_val, g in d.groupby("lead"):
        blend_rmse = g.loc[g["source"] == blend_name, "rmse"].iloc[0]
        others = g[g["source"] != blend_name]
        if others.empty:
            continue
        best = others.loc[others["rmse"].idxmin()]
        diff = (blend_rmse - best["rmse"]) / best["rmse"] * 100
        parts.append(f"Day {lead_val}: {diff:+.1f}% vs {best['source']}")
    return ("Blend RMSE compared with the best single source "
            "(negative = blend is better): " + " · ".join(parts))


# ---------- sidebar ----------
page = st.sidebar.radio(
    "Page",
    ["Forecast map", "Weight maps", "Skill scorecard", "Alerts",
     "Hybrid AI–NWP", "Wind", "Adaptive weighting"],
)

st.title("Hybrid AI–NWP Forecast: Andhra Pradesh & Telangana")

# ---------- Page a: Forecast map ----------
if page == "Forecast map":
    ds = get_dataset("blend_forecast")
    dates = pd.to_datetime(ds.init_time.values)

    c1, c2, c3 = st.columns(3)
    var = c1.selectbox("Variable", ["rain", "tmax"], format_func=var_label)
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
    var = c1.selectbox("Variable", ["rain", "tmax"], format_func=var_label, key="w_var")
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

    fig, blend_name = skill_chart(
        d, var, f"{var_label(var)}: forecast error vs lead time (test year 2023)")
    st.plotly_chart(fig, width="stretch")

    table = d.pivot_table(index="source", columns="lead", values="rmse").round(2)
    table.columns = [f"Day {c}" for c in table.columns]
    st.dataframe(table, width="stretch")

    if blend_name is None:
        st.warning(f"No blend row found. Sources in the file: {list(d['source'].unique())}")
    else:
        st.caption(blend_vs_best(d, blend_name))

# ---------- Page d: Alerts ----------
elif page == "Alerts":
    path = ROOT / "data" / "alerts.csv"
    if not path.exists():
        st.warning("data/alerts.csv not found yet. Run `python -m sources.alerts`.")
        st.stop()

    # Read fresh every time, so a new file shows up without restarting
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
    fig.update_xaxes(title="Longitude (°E)", range=[76, 85])
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

# ---------- Page e: Hybrid AI-NWP ----------
elif page == "Hybrid AI–NWP":
    need("blend_scores_hybrid.csv", "python -m run_pipeline --hybrid")
    st.write(
        "The full **Hybrid AI–NWP** system: the four AI/statistical sources plus "
        "**NCMRWF's S2S physical NWP ensemble** (Unified Model). Because S2S covers "
        "2010–2015, this system has its own honest split: AI models trained on "
        "2016–2023, blend weights learned on 2010–2012, tested on **2013–2015**."
    )

    scores = read_csv("blend_scores_hybrid.csv")
    var = st.selectbox("Variable", sorted(scores["var"].unique()),
                       format_func=var_label, key="h_var")
    d = scores[scores["var"] == var].sort_values("lead")

    fig, blend_name = skill_chart(
        d, var, f"{var_label(var)}: hybrid blend vs each source (test 2013–2015)",
        blend_label="HYBRID BLEND")
    st.plotly_chart(fig, width="stretch")

    table = d.pivot_table(index="source", columns="lead", values="rmse").round(3)
    table.columns = [f"Day {c}" for c in table.columns]
    st.dataframe(table, width="stretch")
    cap = blend_vs_best(d, blend_name)
    if cap:
        st.caption(cap)

    st.caption(
        "S2S issues forecasts on the 1st of each month only, so this test uses 36 days — "
        "a smaller sample than the main 2023 system (360 days)."
    )

    if data_file("blend_weights_hybrid.nc").exists():
        st.subheader("How much the hybrid blend trusts each source")
        wds = open_nc("blend_weights_hybrid.nc")
        lead = st.select_slider("Lead time (days ahead)",
                                options=list(wds.lead.values), value=1, key="h_lead")
        w = wds[var].sel(lead=lead)
        zmax = float(w.max())
        cols = st.columns(3)
        for i, s in enumerate(wds.source.values):
            field = w.sel(source=s)
            title = f"{s} (mean {float(field.mean()):.2f})"
            cols[i % 3].plotly_chart(weight_figure(field, title, zmax), width="stretch")

# ---------- Page f: Wind ----------
elif page == "Wind":
    need("wind_scores.csv", "python -m sources.blend_wind")
    st.write(
        "**10 m wind speed**, blended from persistence, climatology and the "
        "NCMRWF S2S NWP forecast, verified against **IMDAA** (NCMRWF's Indian "
        "reanalysis) at 00 UTC. Weights learned on 2010–2012, tested on 2013–2015."
    )

    scores = read_csv("wind_scores.csv")
    fig, blend_name = skill_chart(
        scores.sort_values("lead"), "wspd",
        "Wind speed: blend vs each source (test 2013–2015)")
    st.plotly_chart(fig, width="stretch")

    table = scores.pivot_table(index="source", columns="lead", values="rmse").round(3)
    table.columns = [f"Day {c}" for c in table.columns]
    st.dataframe(table, width="stretch")
    cap = blend_vs_best(scores, blend_name)
    if cap:
        st.caption(cap)

    if data_file("blend_wind_forecast.nc").exists():
        st.subheader("Blended wind forecast")
        wf = open_nc("blend_wind_forecast.nc")
        dates = pd.to_datetime(wf.init_time.values)
        c1, c2 = st.columns(2)
        picked = c1.selectbox("Forecast issued on", dates[::-1],
                              format_func=lambda d: pd.Timestamp(d).strftime("%d %b %Y"),
                              key="wind_date")
        lead = c2.select_slider("Lead time (days ahead)",
                                options=list(wf.lead.values), value=1, key="wind_lead")
        field = wf["wspd"].sel(init_time=pd.Timestamp(picked)).sel(lead=lead)
        valid = pd.Timestamp(picked) + pd.Timedelta(days=int(lead))
        st.plotly_chart(
            map_figure(field, "wspd",
                       f"Blended 10 m wind speed, valid {valid:%d %b %Y} (day {lead})"),
            width="stretch")

    if data_file("wind_alert_scores.csv").exists():
        st.subheader("High-wind alerts: honest verification")
        wa = read_csv("wind_alert_scores.csv")
        st.dataframe(wa.round(3), hide_index=True, width="stretch")
        st.warning(
            "High-wind alerts do **not** yet verify usefully. Blending smooths extremes, "
            "and our matched forecast/observation sample (00 UTC, monthly S2S starts) "
            "contains no gale-force events to calibrate against. Sub-daily wind and gust "
            "data would be needed to make these operational."
        )

# ---------- Page g: Adaptive weighting ----------
elif page == "Adaptive weighting":
    st.write(
        "The problem statement asks for weights that adapt by **region, lead time, "
        "season and weather regime**. Region and lead time are on the *Weight maps* "
        "page. This page shows the other two."
    )

    tab_season, tab_regime = st.tabs(["By season", "By weather regime"])

    with tab_season:
        if not data_file("blend_weights_season.nc").exists():
            st.warning("Run `python -m sources.blend_season` first.")
        else:
            wds = open_nc("blend_weights_season.nc")
            c1, c2 = st.columns(2)
            var = c1.selectbox("Variable", ["rain", "tmax"], format_func=var_label,
                               key="se_var")
            lead = c2.select_slider("Lead time (days ahead)",
                                    options=list(wds.lead.values), value=1, key="se_lead")
            avg = (wds[var].sel(lead=lead).mean(("lat", "lon"), skipna=True)
                   .to_pandas().round(3))
            fig = go.Figure()
            for s in wds.source.values:
                y = [float(wds[var].sel(lead=lead, source=s, season=se)
                           .mean(skipna=True)) for se in wds.season.values]
                fig.add_trace(go.Bar(name=str(s), x=list(wds.season.values), y=y,
                                     marker_color=SOURCE_COLORS.get(str(s).lower(), "#bbb")))
            fig.update_layout(barmode="group", height=420,
                              title=f"Average weight per season · {var_label(var)}, day {lead}",
                              yaxis_title="weight (sums to 1)")
            st.plotly_chart(fig, width="stretch")
            st.dataframe(avg, width="stretch")

            if data_file("blend_scores_by_season.csv").exists():
                st.caption("Season-aware vs standard blend, per season:")
                st.dataframe(read_csv("blend_scores_by_season.csv").round(3),
                             hide_index=True, width="stretch")
            st.info(
                "The weights differ clearly by season — in winter the system trusts "
                "persistence about 3× more than in the monsoon. On the 2023 test year this "
                "did not improve overall skill, because winter rainfall errors are already "
                "near zero (RMSE 0.37 vs 12.49 in the monsoon) and one training year gives "
                "only ~60 days per season."
            )

    with tab_regime:
        if not data_file("blend_weights_regime.nc").exists():
            st.warning("Run `python -m sources.blend_regime` first.")
        else:
            wds = open_nc("blend_weights_regime.nc")
            c1, c2 = st.columns(2)
            var = c1.selectbox("Variable", ["rain", "tmax"], format_func=var_label,
                               key="rg_var")
            lead = c2.select_slider("Lead time (days ahead)",
                                    options=list(wds.lead.values), value=1, key="rg_lead")
            avg = (wds[var].sel(lead=lead).mean(("lat", "lon"), skipna=True)
                   .to_pandas().round(3))
            fig = go.Figure()
            for s in wds.source.values:
                y = [float(wds[var].sel(lead=lead, source=s, regime=rg)
                           .mean(skipna=True)) for rg in wds.regime.values]
                fig.add_trace(go.Bar(name=str(s), x=list(wds.regime.values), y=y,
                                     marker_color=SOURCE_COLORS.get(str(s).lower(), "#bbb")))
            fig.update_layout(barmode="group", height=420,
                              title=f"Average weight per regime · {var_label(var)}, day {lead}",
                              yaxis_title="weight (sums to 1)")
            st.plotly_chart(fig, width="stretch")
            st.dataframe(avg, width="stretch")

            if data_file("blend_scores_regime.csv").exists():
                st.caption("Regime-aware vs standard blend:")
                st.dataframe(read_csv("blend_scores_regime.csv").round(3),
                             hide_index=True, width="stretch")
            st.info(
                "A day is **wet** if the area-average rain on the day the forecast is issued "
                "is at least 5 mm — information a forecaster genuinely has at issue time. "
                "Regime-aware weighting gives a small consistent gain on wet days (+0.3% for "
                "both rainfall and temperature), which is where the largest errors occur."
            )
