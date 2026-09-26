"""
make_figures.py  -  P3: presentation figures -> slides/figures/

Needs data/full_scores.csv (run `python -m verify.scores` first).

Run:
    python -m verify.make_figures
"""
from pathlib import Path

import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, ListedColormap
import matplotlib.patheffects as pe
import numpy as np
import pandas as pd

from sources.common import load, DATA_DIR

OUT = Path(__file__).resolve().parent.parent / "slides" / "figures"
OUT.mkdir(parents=True, exist_ok=True)
DPI = 200

# ---- One fixed colour + marker per source, used in every chart ----
COLOR = {"blend": "#2a78d6", "lgbm": "#eb6834", "linreg": "#1baf7a",
         "persistence": "#4a3aa7", "climatology": "#eda100"}
MARKER = {"blend": "o", "lgbm": "s", "linreg": "^", "persistence": "D", "climatology": "v"}
LABEL = {"blend": "BLEND", "lgbm": "LightGBM", "linreg": "Linear reg.",
         "persistence": "Persistence", "climatology": "Climatology"}
ORDER = ["persistence", "climatology", "lgbm", "linreg", "blend"]   # blend drawn last (on top)
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e4e3df"

plt.rcParams.update({
    "font.size": 16, "axes.titlesize": 20, "axes.titleweight": "bold",
    "axes.labelsize": 17, "xtick.labelsize": 15, "ytick.labelsize": 15,
    "legend.fontsize": 15, "axes.edgecolor": INK2, "axes.labelcolor": INK,
    "xtick.color": INK2, "ytick.color": INK2, "text.color": INK,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 1,
    "axes.spines.top": False, "axes.spines.right": False,
    "figure.facecolor": "white", "axes.facecolor": "white",
})

VAR_INFO = {"rain": ("Rainfall", "mm/day"), "tmax": ("Max temperature", "°C")}


def save(fig, name):
    path = OUT / name
    fig.savefig(path, dpi=DPI, bbox_inches="tight")
    plt.close(fig)
    print(f"  saved {path.relative_to(OUT.parent.parent)}")


def spread(ys, min_gap):
    """Nudge label y-positions apart so direct labels don't overlap."""
    order = np.argsort(ys)
    out = np.array(ys, dtype=float)
    for _ in range(50):
        moved = False
        for a, b in zip(order[:-1], order[1:]):
            if out[b] - out[a] < min_gap:
                mid = (out[a] + out[b]) / 2
                out[a], out[b] = mid - min_gap / 2, mid + min_gap / 2
                moved = True
        if not moved:
            break
    return out


def rain_note(ax, d):
    """Text box: how far BLEND is from the best source, computed from the scores."""
    t = d.pivot(index="source", columns="lead", values="rmse")
    gap = 100 * (t.loc["blend"] - t.min()) / t.min()          # % BLEND trails the best
    later = gap.loc[2:5].max()
    lg1, bl1 = t.loc["lgbm", 1], t.loc["blend", 1]
    text = (f"BLEND within {later:.1f}% of the best model at days 2-5;\n"
            f"LightGBM {gap.loc[1]:.1f}% better at day 1 "
            f"({lg1:.2f} vs {bl1:.2f} mm/day)")
    ax.text(0.97, 0.42, text, transform=ax.transAxes, ha="right", va="center", fontsize=15,
            color=INK, bbox=dict(boxstyle="round,pad=0.5", fc="white", ec=INK2, lw=1))


# ---------------- a. RMSE vs lead ----------------
def rmse_vs_lead(scores, var):
    name, unit = VAR_INFO[var]
    d = scores[scores["var"] == var]
    fig, ax = plt.subplots(figsize=(10, 6.5))
    ends = {}
    for s in ORDER:
        r = d[d["source"] == s].sort_values("lead")
        is_blend = s == "blend"
        ax.plot(r["lead"], r["rmse"], color=COLOR[s], marker=MARKER[s],
                lw=4.5 if is_blend else 2, ms=11 if is_blend else 8,
                zorder=5 if is_blend else 3, label=LABEL[s],
                markeredgecolor="white", markeredgewidth=1.5)
        ends[s] = r["rmse"].iloc[-1]
    # direct labels at the right end
    lo, hi = ax.get_ylim()
    ys = spread([ends[s] for s in ORDER], (hi - lo) * 0.055)
    for s, y in zip(ORDER, ys):
        ax.annotate(LABEL[s], xy=(5, ends[s]), xytext=(5.18, y), va="center",
                    fontsize=15, fontweight="bold" if s == "blend" else "normal",
                    color=INK, annotation_clip=False,
                    arrowprops=dict(arrowstyle="-", color=COLOR[s], lw=1.2))
    ax.set_xticks([1, 2, 3, 4, 5])
    ax.set_xlim(0.8, 5.15)
    ax.set_xlabel("Lead time (days)")
    ax.set_ylabel(f"RMSE ({unit})  — lower is better")
    ax.set_title(f"{name}: forecast error vs lead time (2023)", loc="left")
    if var == "rain":
        rain_note(ax, d)
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=5,
              fontsize=14, handlelength=1.6, columnspacing=1.2)
    save(fig, f"rmse_vs_lead_{var}.png")


# ---------------- b. % improvement of blend over baselines ----------------
def improvement(scores):
    piv = scores.pivot_table(index=["var", "lead"], columns="source", values="rmse")
    fig, axes = plt.subplots(1, 2, figsize=(15, 6.5), sharey=True)
    w = 0.38
    for ax, var in zip(axes, ["rain", "tmax"]):
        p = piv.loc[var]
        leads = p.index.values
        for k, base in enumerate(["persistence", "climatology"]):
            imp = 100 * (p[base] - p["blend"]) / p[base]
            x = leads + (k - 0.5) * w
            bars = ax.bar(x, imp, width=w - 0.04, color=COLOR[base],
                          label=f"vs {LABEL[base]}", zorder=3)
            for b, v in zip(bars, imp):
                ax.text(b.get_x() + b.get_width() / 2, v + (0.8 if v >= 0 else -0.8),
                        f"{v:.1f}", ha="center", va="bottom" if v >= 0 else "top",
                        fontsize=13, color=INK)
        ax.axhline(0, color=INK2, lw=1.2)
        ax.set_ylim(-4, 58)
        ax.set_xticks(leads)
        ax.set_xlabel("Lead time (days)")
        ax.set_title(VAR_INFO[var][0], loc="left")
        ax.grid(axis="x", visible=False)
    axes[0].set_ylabel("RMSE improvement of BLEND (%)")
    axes[1].legend(loc="upper right", frameon=False)
    fig.suptitle("How much BLEND reduces error vs simple baselines (2023)",
                 x=0.06, ha="left", fontsize=22, fontweight="bold")
    fig.tight_layout()
    save(fig, "improvement_vs_baselines.png")


# ---------------- c. Blend weights vs lead (tmax) ----------------
def blend_weights():
    w = load("blend_weights")["tmax"]
    avg = w.mean(("lat", "lon"), skipna=True).to_pandas()      # (source, lead)
    srcs = [s for s in ORDER if s in avg.index]
    fig, ax = plt.subplots(figsize=(10, 6.5))
    for s in srcs:
        ax.plot(avg.columns, avg.loc[s], color=COLOR[s], marker=MARKER[s], lw=2.5, ms=9,
                label=LABEL[s], markeredgecolor="white", markeredgewidth=1.5)
    ys = spread([avg.loc[s].iloc[-1] for s in srcs], 0.03)
    for s, y in zip(srcs, ys):
        ax.annotate(LABEL[s], xy=(5, avg.loc[s].iloc[-1]), xytext=(5.18, y), va="center",
                    fontsize=15, color=INK, annotation_clip=False,
                    arrowprops=dict(arrowstyle="-", color=COLOR[s], lw=1.2))
    ax.set_xticks([1, 2, 3, 4, 5])
    ax.set_xlim(0.8, 5.15)
    ax.set_ylim(0, None)
    ax.set_xlabel("Lead time (days)")
    ax.set_ylabel("Average weight in BLEND (0–1)")
    ax.set_title("Max temperature: how much BLEND trusts each source", loc="left")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), frameon=False, ncol=5,
              fontsize=14, handlelength=1.6, columnspacing=1.2)
    save(fig, "blend_weights_tmax.png")


# ---------------- d. Alert verification ----------------
def alert_scores():
    """Reads data/alert_scores.csv (written by `python -m sources.verify_alerts`),
    so the chart always shows the latest numbers. Raw rule vs calibrated, per hazard."""
    df = pd.read_csv(DATA_DIR / "alert_scores.csv")
    metrics = ["POD", "FAR", "CSI"]
    hazards = [("heatwave", "Heatwave", "#e34948"), ("heavy_rain", "Heavy rain", "#1c5cab")]
    fig, axes = plt.subplots(1, 2, figsize=(15, 6.8), sharey=True)
    w = 0.38
    for ax, (hz, title, col) in zip(axes, hazards):
        d = df[df["hazard"] == hz]
        raw = d[~d["rule"].str.startswith("calibrated")].iloc[0]
        cal = d[d["rule"].str.startswith("calibrated")].iloc[0]
        for k, (row, colour) in enumerate([(raw, "#9a9893"), (cal, col)]):
            xs = np.arange(len(metrics)) + (k - 0.5) * w
            vs = [float(row[m]) if pd.notna(row[m]) else 0.0 for m in metrics]
            bars = ax.bar(xs, vs, width=w - 0.04, color=colour, zorder=3,
                          label=row["rule"].replace(" C)", " °C)"))
            for b, v in zip(bars, vs):
                ax.text(b.get_x() + b.get_width() / 2, v + 0.015, f"{v:.2f}",
                        ha="center", va="bottom", fontsize=15, color=INK)
        ax.set_xticks(range(len(metrics)))
        ax.set_xticklabels(["POD\nhit rate\n(higher = better)",
                            "FAR\nfalse alarms\n(lower = better)",
                            "CSI\noverall skill\n(higher = better)"])
        ax.set_ylim(0, 1.08)
        ax.grid(axis="x", visible=False)
        ax.set_title(f"{title}  ({int(cal['hits'])} hits, {int(cal['misses'])} misses, "
                     f"{int(cal['false_alarms'])} false alarms)", loc="left", fontsize=16)
        ax.legend(loc="upper right", frameon=False, fontsize=14)
    axes[0].set_ylabel("Score (0–1)")
    fig.suptitle("Next-day district alerts, 2023 (calibrated on 2022, tested on 2023)",
                 x=0.06, ha="left", fontsize=22, fontweight="bold")
    fig.tight_layout()
    save(fig, "alert_scores.png")


# ---------------- e. Cyclone Michaung case ----------------
# Districts hit hardest; label position (lon, lat): coastal ones out to sea, inland ones west
FOCUS_LABELS = {"Spsr Nellore": (81.2, 15.0), "Tirupati": (81.2, 13.6),
                "Annamayya": (77.9, 15.5), "Chittoor": (77.6, 12.6)}

def michaung():
    init, lead = np.datetime64("2023-12-03"), 1
    valid = init + np.timedelta64(lead, "D")
    fc = load("blend_forecast")["rain"].sel(init_time=init, lead=lead)
    ob = load("imd_obs")["rain"].sel(time=valid)
    box = dict(lat=slice(12, 20), lon=slice(76, 85))
    fc, ob = fc.sel(**box), ob.sel(**box)

    # IMD daily rainfall categories (mm/day), one-hue blue ramp
    levels = [0, 2.5, 15.6, 35.5, 64.5, 115.6, 204.5, 400]
    ramp = ["#f0efec", "#cde2fb", "#86b6ef", "#3987e5", "#256abf", "#184f95", "#0d366b"]
    cmap = ListedColormap(ramp)
    cmap.set_bad("white")
    norm = BoundaryNorm(levels, cmap.N)
    districts = gpd.read_file(DATA_DIR / "districts_ap_ts.geojson")
    focus = districts[districts["district"].isin(FOCUS_LABELS)].set_index("district")
    focus["pt"] = focus.geometry.representative_point()

    fig, axes = plt.subplots(1, 2, figsize=(16, 8), sharey=True)
    panels = [(fc, f"BLEND forecast\n(made {str(init)}, lead {lead} day)"),
              (ob, f"IMD observed\n({str(valid)})")]
    for ax, (da, title) in zip(axes, panels):
        m = ax.pcolormesh(da.lon, da.lat, da.values, cmap=cmap, norm=norm, shading="nearest")
        districts.boundary.plot(ax=ax, color="#52514e", lw=0.5)
        focus.boundary.plot(ax=ax, color=INK, lw=2)
        for dist, (tx, ty) in FOCUS_LABELS.items():
            px, py = focus.loc[dist, "pt"].x, focus.loc[dist, "pt"].y
            ax.annotate(dist, xy=(px, py), xytext=(tx, ty), fontsize=13, fontweight="bold",
                        color=INK, ha="left" if tx > px else "right", va="center",
                        arrowprops=dict(arrowstyle="-", color=INK, lw=1),
                        path_effects=[pe.withStroke(linewidth=3, foreground="white")])
        ax.set_xlim(76, 85)
        ax.set_ylim(12, 20)
        ax.set_aspect("equal")
        ax.grid(False)
        ax.set_title(title + f"\nmax {float(da.max()):.0f} mm", loc="left", fontsize=18)
        ax.set_xlabel("Longitude (°E)")
    axes[0].set_ylabel("Latitude (°N)")
    cb = fig.colorbar(m, ax=axes, orientation="horizontal", fraction=0.05, pad=0.1,
                      ticks=levels, aspect=40)
    cb.set_label("Rainfall (mm/day) — IMD categories: 64.5 heavy, 115.6 very heavy, "
                 "204.5 extremely heavy")
    fig.suptitle("Cyclone Michaung heavy rain (4 Dec 2023): 1-day-ahead BLEND vs observed",
                 x=0.12, y=1.06, ha="left", fontsize=22, fontweight="bold")
    fig.text(0.12, -0.04, "Alerts use a trigger calibrated on 2022, lower than 64.5 mm, "
             "because blending smooths extremes.", ha="left", fontsize=15, color=INK2,
             style="italic")
    save(fig, "michaung_case.png")


if __name__ == "__main__":
    scores = pd.read_csv(DATA_DIR / "full_scores.csv")
    print("Making figures ...")
    rmse_vs_lead(scores, "rain")
    rmse_vs_lead(scores, "tmax")
    improvement(scores)
    blend_weights()
    alert_scores()
    michaung()
    print("Done.")
