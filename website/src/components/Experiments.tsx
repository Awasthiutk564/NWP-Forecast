import { motion } from "framer-motion";
import { SOURCE_META } from "../lib/colors";
import { bestByLead, scoreOf, useData, type Scores, type Weights } from "../lib/data";
import { Loading, Reveal, SectionHead } from "./ui/primitives";
import "./experiments.css";

const LEADS = [1, 2, 3, 4, 5];
const SEASON_LABEL: Record<string, string> = { "all year": "All year", winter: "Winter", pre_monsoon: "Pre-monsoon", monsoon: "Monsoon", post_monsoon: "Post-monsoon" };

/** Diverging cell: blue = the variant has lower error, red = higher error, grey = no change. */
function cellColor(p: number) {
  const t = Math.max(-1, Math.min(1, p / 1.5));
  if (Math.abs(t) < 0.04) return "rgba(128,128,128,0.16)";
  return t > 0 ? `rgba(57,135,229,${0.15 + 0.6 * t})` : `rgba(208,59,59,${0.15 + 0.6 * -t})`;
}

function PctGrid({ rows, title }: { rows: { label: string; vals: number[] }[]; title: string }) {
  return (
    <div className="pct-grid" role="table" aria-label={title}>
      <div className="pct-row pct-head" role="row">
        <span role="columnheader" />
        {LEADS.map((L) => <span key={L} role="columnheader" className="mono xs faint">D{L}</span>)}
      </div>
      {rows.map((r) => (
        <div key={r.label} className="pct-row" role="row">
          <span role="rowheader" className="small muted">{r.label}</span>
          {r.vals.map((p, i) => (
            <span key={i} role="cell" className="pct-cell num" style={{ background: cellColor(p) }}>
              {p > 0 ? "+" : ""}{p.toFixed(1)}%
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Exp({ id, name, status, tone, children, summary }: { id: string; name: string; status: string; tone: "good" | "warn" | "blue"; summary: string; children: React.ReactNode }) {
  return (
    <Reveal className="exp card">
      <div className="spread">
        <span className="mono xs faint">EXPERIMENT {id}</span>
        <span className={`chip chip--${tone}`}>{status}</span>
      </div>
      <h3 className="h3 exp-title">{name}</h3>
      <p className="small muted">{summary}</p>
      <div className="exp-body">{children}</div>
    </Reveal>
  );
}

export function Experiments() {
  const s = useData<Scores>("scores.json");
  const w = useData<Weights>("weights.json");
  if (!s || !w) return <section className="section" id="experiments"><Loading /></section>;

  const season = (v: string) => ["all year", "winter", "pre_monsoon", "monsoon", "post_monsoon"].map((k) => ({
    label: SEASON_LABEL[k], vals: LEADS.map((L) => s.season.find((r) => r.var === v && r.season === k && r.lead === L)!.pct_better),
  }));
  const regime = (v: string) => ["all days", "wet", "dry"].map((k) => ({
    label: `${v === "rain" ? "Rain" : "Tmax"} · ${k}`, vals: LEADS.map((L) => s.regime.find((r) => r.var === v && r.regime === k && r.lead === L)!.pct_better),
  }));
  const hyBest = { rain: bestByLead(s.hybrid, "rain"), tmax: bestByLead(s.hybrid, "tmax") };
  const s2sW = { rain: w.hybrid.rain.s2s_nwp, tmax: w.hybrid.tmax.s2s_nwp };
  const windBest = bestByLead(s.wind, "wspd");
  const windRows = ["blend", "s2s_nwp", "persistence", "climatology"];
  const windMax = Math.max(...s.wind.map((r) => r.rmse));
  const yellow = s.windAlerts.find((r) => r.level === "yellow")!;

  return (
    <section className="section" id="experiments" aria-labelledby="exp-title">
      <div className="container">
        <SectionHead eyebrow="Experiments" title={<span id="exp-title">Adaptive by region, season,<br />regime and physics</span>}
          lead="The problem statement asks for weights that adapt by region, season and weather regime, and for a hybrid AI–NWP system. Each idea was run as a separate experiment next to the main blend, scored the same honest way, and reported whether it helped or not." />
        <div className="exp-grid">
          <Exp id="S-01" name="Season-aware weights" tone="warn" status="No clear gain"
            summary="Separate weights for each IMD season (learned on 2022). Cells show the change in RMSE against the all-year blend: blue means lower error.">
            <PctGrid title="Season-aware vs all-year blend, rainfall" rows={season("rain")} />
            <p className="xs faint">Rainfall shown. With one training year per season, the extra weights mostly add noise; winter rain is tiny in absolute terms.</p>
          </Exp>

          <Exp id="R-02" name="Weather-regime weights" tone="good" status="Small gain"
            summary="Different weights for wet and dry situations, decided from the area-average rain on the issue day (≥ 5 mm = wet).">
            <PctGrid title="Regime-aware vs standard blend" rows={[...regime("rain"), ...regime("tmax").slice(0, 1)]} />
            <p className="xs faint">Gains are small (under 0.6%) but point the right way on wet days and for Tmax at every lead.</p>
          </Exp>

          <Exp id="H-03" name="Hybrid AI–NWP with NCMRWF S2S" tone="blue" status="Physics earns weight"
            summary="The physical S2S model joins the four AI and statistical sources as a fifth source. Weights learned on 2010–12, tested on 2013–15.">
            <div className="hy-grid">
              {(["tmax", "rain"] as const).map((v) => (
                <div key={v}>
                  <p className="small"><b>{v === "tmax" ? "Max temperature" : "Rainfall"}</b></p>
                  <div className="hy-leads">
                    {LEADS.map((L, i) => (
                      <div key={L} className="hy-lead">
                        <span className="mono xs faint">D{L}</span>
                        <div className="hy-bar"><motion.i initial={{ height: 0 }} whileInView={{ height: `${s2sW[v][i] * 200}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: i * 0.06 }} /></div>
                        <span className="num xs">{(s2sW[v][i] * 100).toFixed(0)}%</span>
                        <span className={`hy-win xs ${hyBest[v][i] === "blend" ? "on" : ""}`}>{hyBest[v][i] === "blend" ? "BLEND best" : SOURCE_META[hyBest[v][i]]?.short ?? hyBest[v][i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="xs faint">Bars: average weight the blend gives S2S. Under each: the lowest-RMSE source at that lead day.</p>
          </Exp>

          <Exp id="W-04" name="10 m wind and high-wind alerts" tone="good" status={`Best at ${windBest.filter((b) => b === "blend").length}/5 leads`}
            summary="Wind blends S2S, persistence and climatology against IMDAA 10 m wind (00 UTC). Tested on 2013–15.">
            <div className="wind-bars">
              {windRows.map((src) => (
                <div key={src} className="wind-row">
                  <span className="row small" style={{ gap: 7 }}><i className="dot" style={{ background: SOURCE_META[src].color }} />{SOURCE_META[src].label}</span>
                  <div className="wind-leads">
                    {LEADS.map((L) => {
                      const r = scoreOf(s.wind, "wspd", src, L);
                      return <span key={L} className="wind-cell" title={`Day ${L}: ${r.toFixed(2)} m/s`}>
                        <motion.i initial={{ width: 0 }} whileInView={{ width: `${(r / windMax) * 100}%` }} viewport={{ once: true }} style={{ background: SOURCE_META[src].color }} />
                      </span>;
                    })}
                  </div>
                  <span className="num xs">{scoreOf(s.wind, "wspd", src, 1).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <p className="xs faint">Bars: RMSE (m/s) at days 1 to 5; number: day 1. Honest caveat: the yellow high-wind alert (≥ 10.8 m/s) scores CSI {yellow.CSI?.toFixed(2)} with {Math.round((yellow.FAR ?? 0) * 100)}% false alarms, and no orange or red events occurred in the test years.</p>
          </Exp>
        </div>
      </div>
    </section>
  );
}
