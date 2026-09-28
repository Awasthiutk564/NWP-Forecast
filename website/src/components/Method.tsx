import { AnimatePresence, motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { BlendVisual } from "./method/BlendVisual";
import { Timeline } from "./method/Timeline";
import { WarnVisual } from "./method/WarnVisual";
import { Reveal, SectionHead } from "./ui/primitives";
import "./method.css";

interface Step { title: string; body: string }
interface RowDef { n: string; tag: string; title: string; lead: string; steps: Step[]; visual: (focus: number) => ReactNode }

const ROWS: RowDef[] = [
  {
    n: "01", tag: "Observe", title: "Every source on one Indian grid",
    lead: "IMD observations and NCMRWF products are put on the same 0.25° grid over Andhra Pradesh and Telangana: 33 × 37 cells, 12–20°N, 76–85°E.",
    steps: [
      { title: "IMD ground truth, 2010–2023", body: "Gridded rainfall and maximum temperature from IMD Pune, fetched with imdlib. They train the ML models and score every forecast." },
      { title: "NCMRWF reanalyses and S2S", body: "IMDAA, MERA and S2S forecasts are converted into the same data contract. S2S joins the hybrid blend as a physical-model source." },
      { title: "An honest time split", body: "Models train on one period, weights are learned on another, and scores come from a third period that nothing has seen." },
    ],
    visual: (f) => <Timeline focus={f} />,
  },
  {
    n: "02", tag: "Blend", title: "Learn whom to trust, cell by cell",
    lead: "Each source's weight is proportional to 1 / (its mean squared error)², learned separately for every grid cell, lead day and variable.",
    steps: [
      { title: "A weight for every source", body: "Persistence, climatology, LightGBM and Ridge (plus S2S in the hybrid run) compete. A source that did well at a place gets more say there." },
      { title: "Maps, not one global number", body: "A coastal cell can trust a different source than the Deccan plateau. Explore the learned weight maps." },
      { title: "Trust shifts with lead time", body: "Tomorrow leans on recent weather; five days out the blend leans on climatology and the ML models." },
    ],
    visual: (f) => <BlendVisual focus={f} />,
  },
  {
    n: "03", tag: "Warn", title: "From a blended grid to a district alert",
    lead: "Because blending smooths extremes, the forecast is calibrated on 2022 before IMD thresholds are applied. Alerts are issued for day 1, where verification shows skill.",
    steps: [
      { title: "Calibrate, then apply IMD thresholds", body: "Rain is scaled so a 25 mm blend value maps to IMD's 64.5 mm heavy-rain line; Tmax gets +1.0 °C before the heatwave test." },
      { title: "Named LGD districts", body: "Each alert carries a district, a level (yellow, orange, red), the valid date and the calibrated value." },
      { title: "English and Telugu", body: "Every message is generated in both languages, ready for district and mandal offices." },
    ],
    visual: (f) => <WarnVisual focus={f} />,
  },
];

function MethodRow({ row, flip }: { row: RowDef; flip: boolean }) {
  const [focus, setFocus] = useState(0);
  return (
    <div className={`m-row${flip ? " flip" : ""}`}>
      <Reveal className="m-text">
        <span className="eyebrow eyebrow--accent">{row.n} · {row.tag}</span>
        <h3 className="m-title">{row.title}</h3>
        <p className="muted">{row.lead}</p>
        <ul className="m-steps">
          {row.steps.map((s, i) => (
            <li key={s.title}>
              <button type="button" aria-expanded={focus === i} onClick={() => setFocus(i)} className={focus === i ? "on" : ""}>
                <span className="m-step-bar" aria-hidden>{focus === i && <motion.i layoutId={`bar-${row.n}`} />}</span>
                <span className="m-step-title">{s.title}</span>
              </button>
              <AnimatePresence initial={false}>
                {focus === i && (
                  <motion.div className="m-step-body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                    <p className="small muted">{s.body}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal className="m-visual panel" delay={0.1}>
        <AnimatePresence mode="wait">
          <motion.div key={focus} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            {row.visual(focus)}
          </motion.div>
        </AnimatePresence>
      </Reveal>
    </div>
  );
}

export function Method() {
  return (
    <section className="section" id="method" aria-labelledby="method-title">
      <div className="container">
        <SectionHead eyebrow="Method" title={<span id="method-title">Observe. Blend. Warn.</span>}
          lead="Three steps run the whole loop, from raw IMD grids to a message a district officer can forward." />
        <div className="m-rows">
          {ROWS.map((r, i) => <MethodRow key={r.n} row={r} flip={i % 2 === 1} />)}
        </div>
      </div>
    </section>
  );
}
