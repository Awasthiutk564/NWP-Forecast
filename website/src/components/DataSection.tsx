import { useState } from "react";
import { PROJECT, TEAM } from "../config";
import { useData, type Scores } from "../lib/data";
import { Arrow, Reveal, SectionHead } from "./ui/primitives";
import "./data.css";

const SOURCES = [
  { name: "IMD gridded rainfall, 0.25°", who: "India Meteorological Department, Pune (via imdlib)", use: "Training data and ground truth", tag: "2010–2023" },
  { name: "IMD maximum temperature", who: "India Meteorological Department, Pune (via imdlib)", use: "Training data and ground truth", tag: "2010–2023" },
  { name: "IMDAA daily reanalysis", who: "NCMRWF, MoES · CC-BY · DOI 10.64349/nmrf.rds.imdaa.50514", use: "Ingested reference; 10 m wind truth", tag: "CC-BY" },
  { name: "MERA rainfall analysis", who: "NCMRWF, MoES · CC-BY · DOI 10.64349/nmrf.rds.mera.50519", use: "Second-truth cross-check", tag: "CC-BY" },
  { name: "S2S forecasts", who: "NCMRWF, MoES", use: "Physical-model source in the hybrid blend", tag: "2010–2015" },
  { name: "District boundaries", who: "Local Government Directory (LGD), Government of India", use: "Alerts and maps (59 districts)", tag: "LGD" },
];

const LIMITS = [
  { t: "No operational NWP in the 2023 blend yet", d: "The 2023 sources are two baselines and two ML models trained on IMD data. Adding NCMRWF NCUM and NEPS forecasts is the main next step; the hybrid S2S run shows the path." },
  { t: "Weights come from one year", d: "The main blend learns its weights from 2022 only. More years would make them steadier." },
  { t: "Extremes are smoothed", d: "Blending under-forecasts peak rain (Cyclone Michaung: about 43 mm vs 244 mm), so heavy-rain alerts rely on a calibrated trigger and carry many false alarms." },
  { t: "Alerts are next-day only", d: "Longer-lead alerts did not verify well on 2023, so they are switched off." },
  { t: "Heat alerts use IMD plains criteria only", d: "Coastal and hill-station heatwave criteria are not yet included." },
  { t: "Partial reanalysis downloads", d: "IMDAA covers Jun–Aug 2020 and MERA Jun–Sep 2023 (one hour per day) in this download, so both stay out of the reported scores." },
];

const REFS = [
  "Krishnamurti et al. (1999), Science: multi-model superensemble",
  "Raftery et al. (2005), Monthly Weather Review: Bayesian model averaging",
  "Pai et al. (2014), MAUSAM: IMD 0.25° gridded rainfall",
  "Ke et al. (2017), NeurIPS: LightGBM",
];

const COMMANDS = `python -m sources.baselines       # persistence + climatology
python -m sources.train_models    # LightGBM + Ridge
python -m sources.blend           # adaptive blend + weights
python -m sources.verify_alerts   # alert scores + 2022 calibration
python -m sources.alerts          # district alerts (EN + TE)
python -m verify.scores           # full scorecard
python website/scripts/export_data.py   # refresh this website's data`;

export function DataSection() {
  const scores = useData<Scores>("scores.json");
  const mera = scores?.mera.filter((r) => r.lead === 1) ?? [];
  const imd = mera.find((r) => r.truth === "IMD"), me = mera.find((r) => r.truth === "MERA");
  return (
    <section className="section" id="data" aria-labelledby="data-title">
      <div className="container">
        <SectionHead eyebrow="Data & honesty" title={<span id="data-title">Built on Indian data,<br />scored without shortcuts</span>}
          lead="Every dataset is public and credited. Every score comes from a period the models and weights never saw, and the weak spots are listed as plainly as the wins." />

        <div className="prov-grid">
          {SOURCES.map((s, i) => (
            <Reveal key={s.name} delay={(i % 3) * 0.06} className="prov card">
              <div className="spread"><span className="prov-seal" aria-hidden>◎</span><span className="chip">{s.tag}</span></div>
              <h3 className="prov-name">{s.name}</h3>
              <p className="xs faint prov-who">{s.who}</p>
              <p className="small muted">{s.use}</p>
            </Reveal>
          ))}
        </div>

        <div className="honesty">
          <Reveal className="card honesty-card">
            <span className="chip chip--good">Honest split</span>
            <h3 className="h3" style={{ marginTop: 14 }}>Three periods, never mixed</h3>
            <ul className="split-list">
              <li><b>2010–2021</b><span>ML models trained</span></li>
              <li><b>2022</b><span>Blend weights and alert calibration learned</span></li>
              <li><b>2023</b><span>Everything scored</span></li>
            </ul>
            <p className="xs faint">The hybrid AI–NWP run uses its own split: weights 2010–12, test 2013–15, ML trained on 2016–23.</p>
          </Reveal>
          <Reveal className="card honesty-card" delay={0.08}>
            <span className="chip chip--blue">Second truth</span>
            <h3 className="h3" style={{ marginTop: 14 }}>Checked against MERA too</h3>
            {imd && me && (
              <div className="mera">
                <div><p className="kpi-label">Day-1 rain correlation vs IMD</p><p className="kpi-value num">{imd.corr.toFixed(2)}</p></div>
                <div><p className="kpi-label">vs NCMRWF MERA</p><p className="kpi-value num">{me.corr.toFixed(2)}</p></div>
              </div>
            )}
            <p className="xs faint">Monsoon 2023 (Jun–Sep). The drop is expected: IMD and MERA agree with each other at only about 0.52 day to day, and BLEND was trained on IMD.</p>
          </Reveal>
        </div>

        <Reveal className="limits">
          <p className="side-title" style={{ padding: 0 }}>Limitations and next steps</p>
          <ol className="limit-list">
            {LIMITS.map((l, i) => (
              <li key={l.t}><span className="num opp-n">{i + 1}</span><div><b>{l.t}</b><p className="small muted">{l.d}</p></div></li>
            ))}
          </ol>
          <p className="xs faint refs">Method background: {REFS.join(" · ")}.</p>
        </Reveal>
      </div>
    </section>
  );
}

export function RunIt() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(COMMANDS); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  return (
    <section className="section run" aria-labelledby="run-title">
      <div className="run-glow" aria-hidden />
      <div className="container run-grid">
        <Reveal>
          <span className="eyebrow eyebrow--accent">Reproduce it</span>
          <h2 className="h2" id="run-title">Run the whole pipeline yourself</h2>
          <p className="lead">Python 3.10+, the IMD data (or the team's .nc files) and seven commands, run from the repository root.</p>
          <div className="row" style={{ marginTop: 28 }}>
            <a className="btn btn--primary" href={PROJECT.github} target="_blank" rel="noreferrer">View on GitHub <Arrow /></a>
            <a className="btn btn--ghost" href={PROJECT.drive} target="_blank" rel="noreferrer">Team data drive</a>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="terminal panel">
          <div className="spread terminal-top">
            <span className="win-dots" aria-hidden><i /><i /><i /></span>
            <button type="button" className="btn btn--ghost ex-small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <pre><code>{COMMANDS}</code></pre>
        </Reveal>
      </div>
      <div className="container team">
        <p className="side-title" style={{ padding: 0 }}>{PROJECT.team}</p>
        <div className="team-grid">
          {TEAM.map((m) => (
            <div key={m.role} className="team-card"><span className="mono team-role">{m.role}</span><p className="small muted">{m.work}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}
