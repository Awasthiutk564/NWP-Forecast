"""
run_pipeline.py  -  the operational workflow: one command runs the whole system.

The problem statement asks for an "automated script/dashboard for routine
forecast blending". This is that script. It runs every stage in the right
order, stops on the first failure, and prints a timed summary.

Run from the repo root:
    python -m run_pipeline              # the main AI-only system (test year 2023)
    python -m run_pipeline --hybrid     # the Hybrid AI-NWP system (S2S, 2013-2015)
    python -m run_pipeline --all        # both, plus season-aware blending
    python -m run_pipeline --fetch      # also re-download IMD data first (slow)
    python -m run_pipeline --dashboard  # launch the Streamlit dashboard at the end

Each stage is just a module, so you can still run any single one by hand,
e.g. python -m sources.blend
"""
import argparse
import subprocess
import sys
import time

MAIN = [
    ("sources.baselines", "Persistence + climatology baselines"),
    ("sources.train_models", "Train LightGBM + Ridge (2010-2021)"),
    ("sources.blend", "Adaptive blend (weights 2022, test 2023)"),
    ("sources.verify_alerts", "Verify alerts + calibrate triggers on 2022"),
    ("sources.alerts", "Generate next-day district alerts (English + Telugu)"),
    ("verify.scores", "Full scorecard: RMSE, bias, correlation"),
    ("verify.make_figures", "Presentation figures"),
]

HYBRID = [
    ("sources.fetch_s2s", "Convert NCMRWF S2S NWP forecasts"),
    ("sources.s2s_mos", "MOS-correct S2S 925hPa temperature to surface Tmax"),
    ("sources.train_models_hybrid", "Train LightGBM + Ridge (2016-2023 only)"),
    ("sources.baselines_hybrid", "Climatology (2016-2023 only)"),
    ("sources.blend_hybrid", "Hybrid AI-NWP blend (weights 2010-2012, test 2013-2015)"),
]

SEASON = [
    ("sources.blend_season", "Season-aware blend (weights per IMD season)"),
]

FETCH = [
    ("sources.fetch_imd", "Download IMD gridded observations (slow)"),
    ("sources.fetch_ncmrwf", "Convert IMDAA + MERA reanalyses"),
]


def run(module, description):
    print(f"\n{'=' * 70}\n>>> {description}\n    python -m {module}\n{'=' * 70}")
    t0 = time.time()
    result = subprocess.run([sys.executable, "-m", module])
    secs = time.time() - t0
    if result.returncode != 0:
        print(f"\n!!! FAILED after {secs:.0f}s: {module}")
        print("    Fix the error above, then re-run. Earlier stages are already saved,")
        print("    so you can also continue by hand from this stage onwards.")
        sys.exit(result.returncode)
    print(f"--- done in {secs:.0f}s")
    return secs


def main():
    ap = argparse.ArgumentParser(description="Run the SamanvayCast forecast pipeline.")
    ap.add_argument("--hybrid", action="store_true", help="run the Hybrid AI-NWP system instead")
    ap.add_argument("--season", action="store_true", help="run the season-aware blend")
    ap.add_argument("--all", action="store_true", help="run everything (main + hybrid + season)")
    ap.add_argument("--fetch", action="store_true", help="re-download source data first (slow)")
    ap.add_argument("--dashboard", action="store_true", help="launch the dashboard at the end")
    args = ap.parse_args()

    stages = []
    if args.fetch:
        stages += FETCH
    if args.all:
        stages += MAIN + HYBRID + SEASON
    elif args.hybrid:
        stages += HYBRID
    elif args.season:
        stages += SEASON
    else:
        stages += MAIN

    print(f"SamanvayCast pipeline: {len(stages)} stage(s)")
    for i, (m, d) in enumerate(stages, 1):
        print(f"  {i}. {d}")

    t0 = time.time()
    times = [(d, run(m, d)) for m, d in stages]

    print(f"\n{'=' * 70}\nPIPELINE COMPLETE in {time.time() - t0:.0f}s\n{'=' * 70}")
    for d, s in times:
        print(f"  {s:6.0f}s  {d}")

    print("\nOutputs are in data/ and slides/figures/.")
    if args.dashboard:
        print("\nLaunching dashboard ...")
        subprocess.run([sys.executable, "-m", "streamlit", "run", "dashboard/app.py"])
    else:
        print("Dashboard:  streamlit run dashboard/app.py")


if __name__ == "__main__":
    main()
