import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { SOURCE_META, SOURCE_ORDER } from "../lib/colors";
import { bestByLead, scoreOf, sourcesIn, useData, type ScoreRow, type Scores } from "../lib/data";
import { LineChart } from "./ui/LineChart";
import { Loading, Reveal, SectionHead, Segmented } from "./ui/primitives";
import "./console.css";

type ViewId = "main-tmax" | "main-rain" | "hy-tmax" | "hy-rain" | "hy-wspd";
const VIEWS: { id: ViewId; group: string; label: string; var: string; unit: string; table: "main" | "hybrid" | "wind"; test: string }[] = [
  { id: "main-tmax", group: "AI blend · tested on 2023", label: "Max temperature", var: "tmax", unit: "°C", table: "main", test: "2023" },
  { id: "main-rain", group: "AI blend · tested on 2023", label: "Rainfall", var: "rain", unit: "mm/day", table: "main", test: "2023" },
  { id: "hy-tmax", group: "Hybrid AI–NWP · tested on 2013–15", label: "Max temperature", var: "tmax", unit: "°C", table: "hybrid", test: "2013–15" },
  { id: "hy-rain", group: "Hybrid AI–NWP · tested on 2013–15", label: "Rainfall", var: "rain", unit: "mm/day", table: "hybrid", test: "2013–15" },
  { id: "hy-wspd", group: "Hybrid AI–NWP · tested on 2013–15", label: "10 m wind speed", var: "wspd", unit: "m/s", table: "wind", test: "2013–15" },
];
const LEADS = [1, 2, 3, 4, 5];
type Metric = "rmse" | "bias" | "corr";

const pct = (a: number, b: number) => ((b - a) / b) * 100;

const OPPORTUNITIES = [
  { t: "Add NCMRWF operational NWP (NCUM, NEPS)", d: "The 2023 blend has no physical-model source yet. The hybrid run shows S2S already earns weight; operational NWP is the next source to plug in." },
  { t: "Learn weights from more than one year", d: "Blend weights come from 2022 alone. More years would make the per-grid-point weights steadier." },
  { t: "Keep the extremes", d: "Blending smooths peaks (Cyclone Michaung: about 43 mm forecast vs 244 mm observed), so heavy-rain alerts rely on a calibrated trigger." },
];

function rowsFor(scores: Scores, table: "main" | "hybrid" | "wind"): ScoreRow[] {
  return table === "main" ? scores.main : table === "hybrid" ? scores.hybrid : scores.wind;
}

export function Console() {
  const scores = useData<Scores>("scores.json");
  const [viewId, setViewId] = useState<ViewId>("main-tmax");
  const [lead, setLead] = useState(1);
  const [metric, setMetric] = useState<Metric>("rmse");
  const view = VIEWS.find((v) => v.id === viewId)!;
  const m: Metric = view.table === "main" ? metric : "rmse";

  const derived = useMemo(() => {
    if (!scores) return null;
    const rows = rowsFor(scores, view.table);
    const srcs = SOURCE_ORDER.filter((s) => sourcesIn(rows, view.var).includes(s));
    const series = srcs.map((s) => ({
      id: s, label: SOURCE_META[s].label, color: SOURCE_META[s].color, emphasis: s === "blend",
      values: LEADS.map((L) => scoreOf(rows, view.var, s, L, m)),
    }));
    const blend = scoreOf(rows, view.var, "blend", lead);
    const others = srcs.filter((s) => s !== "blend").map((s) => ({ s, v: scoreOf(rows, view.var, s, lead) }));
    const bestOther = others.reduce((a, b) => (b.v < a.v ? b : a));
    const ranked = [...srcs].sort((a, b) => scoreOf(rows, view.var, a, lead) - scoreOf(rows, view.var, b, lead));
    return {
      rows, srcs, series, blend, bestOther,
      rank: ranked.indexOf("blend") + 1,
      vsPers: pct(blend, scoreOf(rows, view.var, "persistence", lead)),
      vsClim: pct(blend, scoreOf(rows, view.var, "climatology", lead)),
      best: bestByLead(rows, view.var),
    };
  }, [scores, view, lead, m]);

  const groups = [...new Set(VIEWS.map((v) => v.group))];
  const fmt = (v: number) => (m === "corr" ? v.toFixed(2) : m === "bias" ? v.toFixed(3) : v.toFixed(2));
  const blendWins = derived ? derived.best.filter((b) => b === "blend").length : 0;

  return (
    <section className="section" id="results" aria-labelledby="results-title">
      <div className="container">
        <SectionHead
          eyebrow="Results"
          title={<span id="results-title">The verification console</span>}
          lead="Every number here comes straight from the project's scorecards. Forecasts are scored against IMD observations on data that neither the models nor the blend weights ever saw."
        />
        <Reveal delay={0.1}>
          <div className="console panel">
            <div className="console-top">
              <div className="row">
                <span className="win-dots" aria-hidden><i /><i /><i /></span>
                <span className="mono small faint">EdgeCast</span>
                <span className="faint">/</span>
                <span className="mono small">Verification</span>
              </div>
              <span className="chip chip--good">Test {view.test}</span>
            </div>
            <div className="console-body">
              <aside className="console-side" aria-label="Scorecard views">
                {groups.map((g) => (
                  <div key={g} className="side-group">
                    <p className="side-title">{g}</p>
                    {VIEWS.filter((v) => v.group === g).map((v) => (
                      <button key={v.id} type="button" className="side-item" aria-pressed={v.id === viewId}
                        onClick={() => { setViewId(v.id); if (v.table !== "main") setMetric("rmse"); }}>
                        {v.id === viewId && <motion.span layoutId="side-active" className="side-active" />}
                        <span>{v.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
                <div className="side-group side-legend">
                  <p className="side-title">Sources</p>
                  {derived?.srcs.map((s) => (
                    <p key={s} className="side-src"><i className="dot" style={{ background: SOURCE_META[s].color }} />{SOURCE_META[s].label}<span className="faint xs">{SOURCE_META[s].kind}</span></p>
                  ))}
                </div>
              </aside>

              <div className="console-main">
                {!derived ? <Loading /> : (
                  <>
                    <div className="spread">
                      <div>
                        <p className="mono xs faint kpi-crumb">KPIs</p>
                        <h3 className="h3">{view.label} · {m === "rmse" ? "RMSE" : m === "bias" ? "Bias" : "Correlation"}</h3>
                      </div>
                      <Segmented label="Lead day" value={lead} onChange={setLead}
                        options={LEADS.map((L) => ({ value: L, label: `Day ${L}` }))} />
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div key={`${viewId}-${lead}`} className="kpis"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                        <div className="kpi kpi--hero">
                          <p className="kpi-label">BLEND error · day {lead}</p>
                          <p className="kpi-value num">{derived.blend.toFixed(2)}<small> {view.unit}</small></p>
                          <p className={`kpi-note ${derived.rank === 1 ? "good" : ""}`}>
                            {derived.rank === 1
                              ? <>Best of {derived.srcs.length} sources, {pct(derived.blend, derived.bestOther.v).toFixed(1)}% ahead of {SOURCE_META[derived.bestOther.s].label}</>
                              : <>Rank {derived.rank} of {derived.srcs.length}: {SOURCE_META[derived.bestOther.s].label} is {Math.abs(pct(derived.blend, derived.bestOther.v)).toFixed(1)}% lower</>}
                          </p>
                        </div>
                        <div className="kpi">
                          <p className="kpi-label">vs persistence</p>
                          <p className="kpi-value num">{derived.vsPers >= 0 ? "−" : "+"}{Math.abs(derived.vsPers).toFixed(1)}%</p>
                          <p className="kpi-note">error, "same as today"</p>
                        </div>
                        <div className="kpi">
                          <p className="kpi-label">vs climatology</p>
                          <p className="kpi-value num">{derived.vsClim >= 0 ? "−" : "+"}{Math.abs(derived.vsClim).toFixed(1)}%</p>
                          <p className="kpi-note">error, "usual for the date"</p>
                        </div>
                        <div className="kpi">
                          <p className="kpi-label">Lead days won</p>
                          <p className="kpi-value num">{blendWins}<small> / 5</small></p>
                          <p className="kpi-note">BLEND lowest RMSE</p>
                        </div>
                      </motion.div>
                    </AnimatePresence>

                    <div className="chart-head spread">
                      <p className="small muted">{m === "rmse" ? "Root-mean-square error by lead day (lower is better)" : m === "bias" ? "Mean bias, forecast minus observed (closer to 0 is better)" : "Correlation with observations (higher is better)"}</p>
                      {view.table === "main" && (
                        <Segmented label="Metric" value={metric} onChange={setMetric}
                          options={[{ value: "rmse", label: "RMSE" }, { value: "bias", label: "Bias" }, { value: "corr", label: "Corr" }]} />
                      )}
                    </div>
                    <LineChart
                      key={`${viewId}-${m}`}
                      series={derived.series}
                      xLabels={LEADS.map((L) => `Day ${L}`)}
                      yFormat={fmt}
                      yTitle={m === "corr" ? "correlation" : view.unit}
                      height={300}
                      lowerIsBetter={m !== "corr"}
                      tooltipTitle={(i) => `LEAD DAY ${i + 1}`}
                    />
                    <div className="legend" role="list" aria-label="Legend">
                      {derived.series.map((s) => (
                        <span role="listitem" key={s.id} className="row" style={{ gap: 7 }}>
                          <i className="swatch-line" style={{ background: s.color, height: s.emphasis ? 4 : 3 }} />{s.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="console-foot">
              <p className="side-title">Top opportunities</p>
              <ol className="opps">
                {OPPORTUNITIES.map((o, i) => (
                  <li key={o.t}><span className="opp-n num">{i + 1}</span><div><b>{o.t}</b><p className="small muted">{o.d}</p></div></li>
                ))}
              </ol>
            </div>
          </div>
        </Reveal>
        {derived && <ScoreTable rows={derived.rows} v={view.var} srcs={derived.srcs} unit={view.unit} />}
      </div>
    </section>
  );
}

function ScoreTable({ rows, v, srcs, unit }: { rows: ScoreRow[]; v: string; srcs: string[]; unit: string }) {
  const [open, setOpen] = useState(false);
  const best = bestByLead(rows, v);
  return (
    <div className="score-table">
      <button className="btn btn--ghost" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide" : "Show"} the full RMSE table
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data">
                <caption className="sr-only">RMSE ({unit}) by source and lead day</caption>
                <thead><tr><th>RMSE ({unit})</th>{LEADS.map((L) => <th key={L}>Day {L}</th>)}</tr></thead>
                <tbody>
                  {srcs.map((s) => (
                    <tr key={s}>
                      <td><span className="row" style={{ gap: 8 }}><i className="dot" style={{ background: SOURCE_META[s].color }} />{SOURCE_META[s].label}</span></td>
                      {LEADS.map((L, i) => (
                        <td key={L} className={`num${best[i] === s ? " best" : ""}`}>{scoreOf(rows, v, s, L).toFixed(2)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="xs faint" style={{ marginTop: 8 }}>● lowest RMSE at that lead day.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
