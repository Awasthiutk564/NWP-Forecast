"""
scores.py  -  P3: full scorecard for 2023.

A forecast made on init_time T for lead L is valid on T + L days; it is
compared with the IMD observation on that valid date.

  - Test period (team convention): init date in 2023 (default, same as
    sources/blend.py and data/blend_scores.csv). --by valid scores forecasts
    whose valid date is in 2023 instead (for comparison only).
  - 5 sources x 5 leads x 2 vars: RMSE, bias (forecast - obs), Pearson r.
  - Only points (date, lat, lon) where ALL sources AND the obs are valid,
    separately for each var and lead, so every source is scored on the same set.

Run:
    python -m verify.scores             -> saves data/full_scores.csv
    python -m verify.scores --by valid  -> prints only (no file written)
"""
import argparse

import numpy as np
import pandas as pd

from sources.common import load, DATA_DIR

SOURCES = {"persistence": "persistence", "climatology": "climatology",
           "lgbm": "lgbm_forecast", "linreg": "linreg_forecast",
           "blend": "blend_forecast"}
VARS = ["rain", "tmax"]
YEAR = "2023"

# Known reference RMSEs (from the team) for the sanity check
KNOWN = {("tmax", 5, "blend"): 1.78, ("tmax", 5, "lgbm"): 1.82,
         ("tmax", 5, "persistence"): 2.16,
         ("rain", 1, "lgbm"): 8.22, ("rain", 1, "blend"): 8.43}


def scores(by="init"):
    obs = load("imd_obs")[VARS]
    fcs = {name: load(f)[VARS] for name, f in SOURCES.items()}
    leads = fcs["blend"].lead.values
    start, end = np.datetime64(f"{YEAR}-01-01"), np.datetime64(f"{YEAR}-12-31")

    rows = []
    for var in VARS:
        for L in leads:
            lag = np.timedelta64(int(L), "D")
            # init times this (lead, test period) needs
            if by == "valid":
                init = pd.date_range(start - lag, end - lag).values
            else:
                init = pd.date_range(start, end).values
            valid = init + lag

            y = obs[var].reindex(time=valid).values                      # (t, lat, lon)
            F = {n: ds[var].sel(lead=L).reindex(init_time=init).values   # (t, lat, lon)
                 for n, ds in fcs.items()}

            ok = ~np.isnan(y)
            for f in F.values():
                ok &= ~np.isnan(f)
            yv = y[ok].astype("float64")

            for n, f in F.items():
                fv = f[ok].astype("float64")
                err = fv - yv
                rows.append({"var": var, "lead": int(L), "source": n,
                             "rmse": float(np.sqrt(np.mean(err ** 2))),
                             "bias": float(np.mean(err)),
                             "corr": float(np.corrcoef(fv, yv)[0, 1]),
                             "n": int(ok.sum())})
    return pd.DataFrame(rows)


def sanity_check(df):
    print("\n--- Compare with data/blend_scores.csv (init date in 2023) ---")
    ref = pd.read_csv(DATA_DIR / "blend_scores.csv")
    ref["source"] = ref["source"].str.lower()
    m = df.merge(ref, on=["var", "lead", "source"], suffixes=("", "_ref"))
    m["diff"] = m["rmse"] - m["rmse_ref"]
    print(m[["var", "lead", "source", "rmse", "rmse_ref", "diff"]]
          .to_string(index=False, float_format="%.3f"))
    print(f"max |diff| = {m['diff'].abs().max():.3f}")

    print("\n--- Compare with known numbers ---")
    for (var, L, src), known in KNOWN.items():
        got = df.query("var == @var and lead == @L and source == @src")["rmse"].item()
        print(f"  {var:4s} lead {L} {src:12s} known {known:5.2f}  ours {got:5.2f}"
              f"  diff {got - known:+.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--by", choices=["init", "valid"], default="init",
                    help="which date must fall in 2023")
    args = ap.parse_args()

    df = scores(args.by)
    pd.set_option("display.width", 120)
    for var in VARS:
        print(f"\n=== {var}  (test: {args.by} date in {YEAR}) ===")
        for col in ("rmse", "bias", "corr"):
            t = df[df["var"] == var].pivot(index="source", columns="lead", values=col)
            print(f"\n{col}:\n{t.loc[list(SOURCES)].round(3)}")
        print(f"\nn per lead: {df[df['var'] == var].groupby('lead')['n'].first().to_dict()}")

    sanity_check(df)

    if args.by == "init":
        out = DATA_DIR / "full_scores.csv"
        df.to_csv(out, index=False)
        print(f"\nSaved {out}")
