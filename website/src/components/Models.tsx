import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useData, type ModelCard, type Var } from "../lib/data";
import { Loading, Reveal, SectionHead, Segmented } from "./ui/primitives";
import "./models.css";

const FIGURES = [
  { file: "rmse_vs_lead_tmax.png", title: "Max-temperature error vs lead day", note: "BLEND is lowest at every lead." },
  { file: "rmse_vs_lead_rain.png", title: "Rainfall error vs lead day", note: "BLEND best at day 3; LightGBM ahead at day 1." },
  { file: "improvement_vs_baselines.png", title: "Gain over the baselines", note: "% lower RMSE than persistence and climatology." },
  { file: "blend_weights_tmax.png", title: "Average weights by lead", note: "Who the blend trusts, day 1 to day 5." },
  { file: "alert_scores.png", title: "District alert verification", note: "POD, FAR and CSI, raw vs calibrated." },
  { file: "michaung_case.png", title: "Cyclone Michaung maps", note: "BLEND vs IMD on 4 Dec 2023." },
];

const base = import.meta.env.BASE_URL;

function ModelTile({ m }: { m: ModelCard }) {
  const imp = Object.entries(m.importance).sort((a, b) => b[1] - a[1]);
  const total = imp.reduce((s, [, v]) => s + v, 0);
  const top = imp.slice(0, 6);
  return (
    <motion.article layout className="model card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
      <div className="spread">
        <span className="chip">Day {m.lead}</span>
        <span className="mono xs faint">{m.sizeKB} KB</span>
      </div>
      <h3 className="model-title">LightGBM · {m.var === "rain" ? "rainfall" : "max temp"} · day {m.lead}</h3>
      <dl className="model-params mono xs">
        <div><dt>trees</dt><dd>{m.trees}</dd></div>
        <div><dt>leaves</dt><dd>{m.params.num_leaves ?? "–"}</dd></div>
        <div><dt>learning rate</dt><dd>{m.params.learning_rate ?? "–"}</dd></div>
        <div><dt>min leaf data</dt><dd>{m.params.min_data_in_leaf ?? "–"}</dd></div>
      </dl>
      <p className="side-title" style={{ padding: 0, margin: "14px 0 8px" }}>What it splits on most</p>
      <ul className="imp">
        {top.map(([k, v]) => (
          <li key={k}>
            <span className="imp-name">{k}</span>
            <span className="imp-track"><motion.i initial={{ width: 0 }} animate={{ width: `${(v / top[0][1]) * 100}%` }} transition={{ duration: 0.8 }} /></span>
            <span className="num xs faint">{((v / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
      <a className="btn btn--ghost model-dl" href={`${base}models/${m.file}`} download>Download {m.file}</a>
    </motion.article>
  );
}

export function Models() {
  const models = useData<ModelCard[]>("models.json");
  const [system, setSystem] = useState<"main" | "hybrid">("main");
  const [v, setV] = useState<Var>("rain");
  const [open, setOpen] = useState<string | null>(null);
  const shown = (models ?? []).filter((m) => m.system === system && m.var === v).sort((a, b) => a.lead - b.lead);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const fig = FIGURES.find((f) => f.file === open);

  return (
    <section className="section" id="models" aria-labelledby="models-title">
      <div className="container">
        <SectionHead eyebrow="Models" title={<span id="models-title">Every model, open for inspection</span>}
          lead={<>The project saves {models?.length ?? 20} LightGBM models: one per variable and lead day, for the main system (trained on 2010–21) and the hybrid system (trained on 2016–23). Each one uses the last five days of rain and Tmax, the season and the location.</>} />

        <div className="spread models-bar">
          <Segmented label="System" value={system} onChange={setSystem}
            options={[{ value: "main", label: "Main · trained 2010–21" }, { value: "hybrid", label: "Hybrid · trained 2016–23" }]} />
          <Segmented label="Variable" value={v} onChange={setV} options={[{ value: "rain", label: "Rainfall" }, { value: "tmax", label: "Max temp" }]} />
        </div>

        {!models ? <Loading /> : (
          <div className="models-grid">
            <AnimatePresence mode="popLayout">
              {shown.map((m) => <ModelTile key={m.file} m={m} />)}
            </AnimatePresence>
            <motion.article layout className="model card model-note">
              <span className="chip chip--blue">Also in the pipeline</span>
              <h3 className="model-title">Ridge regression</h3>
              <p className="small muted">Same 14 features, α = 1.0. Retrained by <code>sources/train_models.py</code>; its forecasts are saved, the fitted model is not.</p>
              <h3 className="model-title">Adaptive blender</h3>
              <p className="small muted">Weight ∝ 1 / MSE² per grid cell and lead day. Weights live in <code>data/blend_weights.nc</code> and are shown in the Method section.</p>
            </motion.article>
          </div>
        )}

        <Reveal className="figs-head">
          <p className="side-title" style={{ padding: 0 }}>Presentation figures · slides/figures</p>
        </Reveal>
        <div className="figs">
          {FIGURES.map((f, i) => (
            <Reveal key={f.file} delay={(i % 3) * 0.06}>
              <button type="button" className="fig" onClick={() => setOpen(f.file)} aria-label={`Open figure: ${f.title}`}>
                <motion.img layoutId={`fig-${f.file}`} src={`${base}figures/${f.file}`} alt={f.title} loading="lazy" />
                <span className="fig-cap"><b>{f.title}</b><span className="xs faint">{f.note}</span></span>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {fig && (
          <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label={fig.title}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.img layoutId={`fig-${fig.file}`} src={`${base}figures/${fig.file}`} alt={fig.title} />
            <p className="small">{fig.title} <span className="faint">· click or press Esc to close</span></p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
