import { AnimatePresence, motion, useInView } from "framer-motion";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { css, heatRamp, rainRamp, RAIN_STEPS, SOURCE_META, TMAX_RANGE } from "../lib/colors";
import { useData, type CaseDay, type CaseIndex, type District, type Grid, type GridInfo, type Var } from "../lib/data";
import type { HoverInfo, SceneHandle } from "../three/ForecastTerrain";
import { fmtDay } from "./method/WarnVisual";
import { ColorKey } from "./ui/GridMap";
import { Loading, Reveal, SectionHead, Segmented } from "./ui/primitives";
import "./explorer.css";

const ForecastScene = lazy(() => import("../three/ForecastTerrain").then((m) => ({ default: m.ForecastScene })));
const SOURCES = ["blend", "lgbm", "linreg", "climatology", "persistence"];

function stats(g: Grid | null, land: boolean[]) {
  if (!g) return { max: NaN, mean: NaN };
  let max = -Infinity, sum = 0, n = 0;
  g.forEach((v, i) => { if (v != null && land[i]) { max = Math.max(max, v); sum += v; n++; } });
  return { max, mean: n ? sum / n : NaN };
}

function addDays(d: string, n: number) {
  const t = new Date(d + "T00:00:00Z"); // UTC throughout, so the date never shifts with the viewer's time zone
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function Explorer() {
  const cases = useData<CaseIndex[]>("cases.json");
  const grid = useData<GridInfo>("grid.json");
  const districts = useData<District[]>("districts.json");
  const [caseId, setCaseId] = useState("michaung");
  const day = useData<CaseDay>(`cases/${caseId}.json`);
  const [v, setV] = useState<Var>("rain");
  const [mode, setMode] = useState<"obs" | "fc">("fc");
  const [src, setSrc] = useState("blend");
  const [lead, setLead] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const scene = useRef<SceneHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { margin: "100px" });
  const seen = useInView(wrap, { once: true, margin: "400px" }); // mount the 3-D scene once, pause it when off screen

  // Picking a heat day switches to temperature, a rain day to rainfall.
  const pickCase = (c: CaseIndex) => {
    setCaseId(c.id);
    setV(c.id.startsWith("heat") || c.id === "winter-calm" ? "tmax" : "rain");
  };

  // "Play" walks the lead time from 5 days out to 1 day out, so you watch the forecast sharpen.
  useEffect(() => {
    if (!playing) return;
    setMode("fc");
    setLead(5);
    let L = 5;
    const t = setInterval(() => {
      L -= 1;
      if (L < 1) { setPlaying(false); clearInterval(t); return; }
      setLead(L);
    }, 1400);
    return () => clearInterval(t);
  }, [playing]);

  const values = day ? (mode === "obs" ? day.obs[v] : day.fc[v][src][lead - 1]) : null;
  const obsStats = useMemo(() => (day && grid ? stats(day.obs[v], grid.land) : null), [day, grid, v]);
  const curStats = useMemo(() => (values && grid ? stats(values, grid.land) : null), [values, grid]);
  const unit = v === "rain" ? "mm" : "°C";
  const rmseRow = day ? SOURCES.map((s) => ({ s, r: day.rmse[v][s][lead - 1] ?? NaN })) : [];
  const rmseMax = Math.max(...rmseRow.map((r) => r.r).filter(isFinite), 0.01);
  const obsAtHover = hover && day ? day.obs[v][hover.index] : null;

  return (
    <section className="section explorer-section" id="explorer" aria-labelledby="explorer-title">
      <div className="container">
        <SectionHead eyebrow="3-D Forecast Explorer" accent
          title={<span id="explorer-title">Fly over the forecast</span>}
          lead="Every column is one 0.25° IMD grid cell over Andhra Pradesh and Telangana. Pick a real 2023 day, a source and a lead time, and compare it with what IMD observed. Drag to rotate; hover a column to read it." />
      </div>

      <Reveal className="container">
        <div className="explorer panel" ref={wrap}>
          <aside className="ex-rail" aria-label="Explorer controls">
            <p className="side-title">Case day</p>
            <div className="ex-cases">
              {!cases ? <Loading /> : cases.map((c) => (
                <button key={c.id} type="button" className="ex-case" aria-pressed={c.id === caseId} onClick={() => pickCase(c)}>
                  {c.id === caseId && <motion.span layoutId="case-active" className="ex-case-active" />}
                  <span className="ex-case-date mono xs">{fmtDay(c.date)}</span>
                  <span className="ex-case-title">{c.title}</span>
                  <span className="ex-case-stat mono xs faint">
                    peak rain {c.rainMax.toFixed(0)} mm · mean Tmax {c.tmaxMean.toFixed(1)} °C
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="ex-stage">
            <div className="ex-toolbar">
              <Segmented label="Variable" value={v} onChange={setV} options={[{ value: "rain", label: "Rainfall" }, { value: "tmax", label: "Max temp" }]} />
              <Segmented label="Field" value={mode} onChange={(m) => { setMode(m); setPlaying(false); }}
                options={[{ value: "obs", label: "IMD observed" }, { value: "fc", label: "Forecast" }]} />
              <button type="button" className="btn btn--ghost ex-small" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
                {playing ? "■ Stop" : "▶ Play 5 → 1 days"}
              </button>
              <button type="button" className="btn btn--ghost ex-small" onClick={() => scene.current?.reset()}>Reset view</button>
            </div>

            <AnimatePresence initial={false}>
              {mode === "fc" && (
                <motion.div className="ex-toolbar ex-toolbar--sub" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                  <div style={{ overflowX: "auto", maxWidth: "100%" }}>
                    <Segmented label="Source" value={src} onChange={setSrc}
                      options={SOURCES.map((s) => ({ value: s, label: <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: SOURCE_META[s].color }} />{SOURCE_META[s].label}</span> }))} />
                  </div>
                  <label className="ex-lead">
                    <span className="mono xs faint">Lead</span>
                    <input type="range" min={1} max={5} step={1} value={lead} onChange={(e) => { setLead(+e.target.value); setPlaying(false); }} aria-label="Lead time in days" />
                    <span className="num small">{lead} day{lead > 1 ? "s" : ""}</span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="ex-canvas" onPointerLeave={() => setHover(null)}>
              {grid && seen ? (
                <Suspense fallback={<Loading label="Loading 3-D scene" />}>
                  <ForecastScene ref={scene} grid={grid} districts={districts} values={values} variable={v} onHover={setHover} active={inView} />
                </Suspense>
              ) : <Loading label="Loading 3-D scene" />}

              <div className="ex-caption">
                <AnimatePresence mode="wait">
                  <motion.div key={`${caseId}${v}${mode}${src}${lead}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <p className="ex-cap-title">
                      {mode === "obs" ? "IMD observed" : `${SOURCE_META[src].label} forecast`}
                      <span className="faint"> · {v === "rain" ? "rainfall" : "max temperature"}</span>
                    </p>
                    {day && <p className="mono xs faint">
                      Valid {fmtDay(day.date)}{mode === "fc" && <> · issued {fmtDay(addDays(day.date, -lead))} ({lead} day{lead > 1 ? "s" : ""} ahead)</>}
                    </p>}
                  </motion.div>
                </AnimatePresence>
              </div>

              {hover && (
                <div className="ex-hover" role="status">
                  <p className="mono xs faint">{hover.lat.toFixed(2)}°N · {hover.lon.toFixed(2)}°E</p>
                  <p className="small"><b>{hover.district ?? "Outside district lines"}</b></p>
                  <p className="num">{hover.value != null ? `${hover.value.toFixed(1)} ${unit}` : "no data"}
                    {mode === "fc" && obsAtHover != null && <span className="faint small"> · observed {obsAtHover.toFixed(1)}</span>}
                  </p>
                </div>
              )}

              <div className="ex-key">
                {v === "rain"
                  ? <ColorKey title="Rainfall (mm/day), IMD categories · height ∝ √rain" stops={[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => css(rainRamp(t)))} labels={RAIN_STEPS.map(String)} />
                  : <ColorKey title="Max temperature (°C) · height ∝ temperature" stops={[0, 0.25, 0.5, 0.75, 1].map((t) => css(heatRamp(t)))} labels={[TMAX_RANGE[0], 28, 34, 40, TMAX_RANGE[1]].map(String)} />}
              </div>
              <p className="ex-hint mono xs faint" aria-hidden>Drag to rotate</p>
            </div>
          </div>

          <aside className="ex-stats" aria-label="Numbers for this view">
            <p className="side-title">This field</p>
            <div className="ex-stat-grid">
              <div><p className="kpi-label">Peak</p><p className="num ex-big">{curStats ? curStats.max.toFixed(1) : "–"}<small> {unit}</small></p></div>
              <div><p className="kpi-label">Area mean</p><p className="num ex-big">{curStats ? curStats.mean.toFixed(1) : "–"}<small> {unit}</small></p></div>
            </div>
            {mode === "fc" && obsStats && curStats && (
              <p className="small muted">Observed peak {obsStats.max.toFixed(1)} {unit}, mean {obsStats.mean.toFixed(1)} {unit}.</p>
            )}
            <p className="side-title" style={{ marginTop: 22 }}>Error on this day · lead {lead}</p>
            <div className="ex-rmse">
              {rmseRow.map(({ s, r }) => (
                <button key={s} type="button" className="ex-rmse-row" aria-pressed={mode === "fc" && s === src} onClick={() => { setMode("fc"); setSrc(s); }}>
                  <span className="row" style={{ gap: 7 }}><i className="dot" style={{ background: SOURCE_META[s].color }} />{SOURCE_META[s].label}</span>
                  <span className="ex-rmse-track"><motion.i animate={{ width: `${(r / rmseMax) * 100}%` }} style={{ background: SOURCE_META[s].color }} /></span>
                  <span className="num xs">{isFinite(r) ? r.toFixed(2) : "–"}</span>
                </button>
              ))}
            </div>
            <p className="xs faint">RMSE against IMD for this single day ({unit}), over all land cells. One day can differ from the year-long scorecard.</p>
            {day && <p className="small muted ex-blurb">{day.blurb}</p>}
          </aside>
        </div>
      </Reveal>
    </section>
  );
}
