"""
mera_check.py  -  P3: cross-check BLEND rain against a second "truth" (MERA).

MERA (NCMRWF reanalysis) covers Jun-Sep 2023 only and is already on our grid.
Its raw 'Rainfall' has no units attribute; its mean is ~1/24 of IMD's, so it is
treated as mm/hour and multiplied by 24 -> mm/day (MERA_SCALE). Correlation does
not depend on this choice; RMSE and bias do.

For each lead: BLEND vs MERA and BLEND vs IMD, on the SAME points
(valid date Jun-Sep 2023, where BLEND, MERA and IMD are all valid).

Run:
    python -m verify.mera_check    -> verify/mera_scores.csv
"""
from pathlib import Path

import numpy as np
import pandas as pd

from sources.common import load

MERA_SCALE = 24.0          # mm/hour -> mm/day (see note above)
START, END = np.datetime64("2023-06-01"), np.datetime64("2023-09-30")
OUT = Path(__file__).resolve().parent / "mera_scores.csv"


def stats(f, y):
    err = f - y
    return {"rmse": float(np.sqrt(np.mean(err ** 2))), "bias": float(np.mean(err)),
            "corr": float(np.corrcoef(f, y)[0, 1])}


def main():
    blend = load("blend_forecast")["rain"]
    imd = load("imd_obs")["rain"]
    mera = load("mera_obs")["rain"] * MERA_SCALE

    rows = []
    for L in blend.lead.values:
        lag = np.timedelta64(int(L), "D")
        valid = pd.date_range(START, END).values
        f = blend.sel(lead=L).reindex(init_time=valid - lag).values
        yi = imd.reindex(time=valid).values
        ym = mera.reindex(time=valid).values
        ok = ~np.isnan(f) & ~np.isnan(yi) & ~np.isnan(ym)
        fv, iv, mv = (a[ok].astype("float64") for a in (f, yi, ym))
        for truth, y in (("IMD", iv), ("MERA", mv)):
            rows.append({"lead": int(L), "truth": truth, **stats(fv, y),
                         "obs_mean": float(y.mean()), "n": int(ok.sum())})
        # how well the two "truths" agree with each other (same points)
        if L == blend.lead.values[0]:
            imd_vs_mera = stats(mv, iv)

    df = pd.DataFrame(rows)
    df.to_csv(OUT, index=False)

    print(f"BLEND rain, valid Jun-Sep 2023, same points for both truths "
          f"(MERA x{MERA_SCALE:g} to mm/day)\n")
    for col in ("rmse", "bias", "corr"):
        print(f"{col}:\n{df.pivot(index='truth', columns='lead', values=col).round(3)}\n")
    print(f"mean obs rain (mm/day): {df.groupby('truth')['obs_mean'].first().round(2).to_dict()}")
    print(f"n per lead: {df.groupby('lead')['n'].first().to_dict()}")
    print(f"\nIMD vs MERA agreement (MERA as 'forecast' of IMD): "
          + ", ".join(f"{k}={v:.3f}" for k, v in imd_vs_mera.items()))
    print(f"\nSaved {OUT}")


if __name__ == "__main__":
    main()
