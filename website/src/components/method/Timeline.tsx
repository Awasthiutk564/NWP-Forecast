import { motion } from "framer-motion";

// Which datasets exist for which years, and how each system splits time (train / weights / test).
const YEARS = Array.from({ length: 14 }, (_, i) => 2010 + i);
const TL_ROWS = [
  { id: "imd", label: "IMD rain + Tmax (0.25°)", spans: [[2010, 2024]], color: "#3987e5", group: [0, 2] },
  { id: "s2s", label: "NCMRWF S2S forecasts", spans: [[2010, 2016]], color: "#9085e9", group: [1, 2] },
  { id: "imdaa", label: "IMDAA reanalysis", spans: [[2020.42, 2020.67]], color: "#199e70", group: [1] },
  { id: "imdaaw", label: "IMDAA 10 m wind", spans: [[2010, 2016]], color: "#199e70", group: [1] },
  { id: "mera", label: "MERA rainfall (check only)", spans: [[2023.42, 2023.75]], color: "#c98500", group: [1] },
];
const SPLITS = [
  { name: "AI blend", parts: [
    { from: 2010, to: 2022, label: "ML training 2010–21", tone: "train" },
    { from: 2022, to: 2023, label: "Weights 2022", tone: "weights" },
    { from: 2023, to: 2024, label: "Test 2023", tone: "test" },
  ] },
  { name: "Hybrid AI–NWP", parts: [
    { from: 2010, to: 2013, label: "Weights 2010–12", tone: "weights" },
    { from: 2013, to: 2016, label: "Test 2013–15", tone: "test" },
    { from: 2016, to: 2024, label: "ML training 2016–23", tone: "train" },
  ] },
];
const xPct = (y: number) => ((y - 2010) / 14) * 100;

export function Timeline({ focus }: { focus: number }) {
  return (
    <div className="timeline">
      <div className="tl-row">
        <span className="tl-label" />
        <div className="tl-years">{YEARS.map((y) => <span key={y} style={{ left: `${xPct(y + 0.5)}%` }}>{`'${String(y).slice(2)}`}</span>)}</div>
      </div>
      {TL_ROWS.map((r) => (
        <div key={r.id} className={`tl-row${r.group.includes(focus) ? "" : " dim"}`}>
          <span className="tl-label">{r.label}</span>
          <div className="tl-track">
            {r.spans.map(([a, b]) => (
              <motion.i key={a} style={{ left: `${xPct(a)}%`, width: `${Math.max(1.4, xPct(b) - xPct(a))}%`, background: r.color, originX: 0 }}
                initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            ))}
          </div>
        </div>
      ))}
      {SPLITS.map((s) => (
        <div key={s.name} className={`tl-row tl-split${focus === 2 ? "" : " dim"}`}>
          <span className="tl-label">{s.name} split</span>
          <div className="tl-track">
            {s.parts.map((p) => (
              <i key={p.label} className={`tl-${p.tone}`} title={p.label} style={{ left: `${xPct(p.from)}%`, width: `${xPct(p.to) - xPct(p.from)}%` }}>
                {p.to - p.from >= 3 && <span>{p.label}</span>}
              </i>
            ))}
          </div>
        </div>
      ))}
      <div className={`legend tl-legend${focus === 2 ? "" : " dim"}`}>
        <span className="row" style={{ gap: 6 }}><i className="tl-swatch tl-train" />ML training</span>
        <span className="row" style={{ gap: 6 }}><i className="tl-swatch tl-weights" />Blend weights learned</span>
        <span className="row" style={{ gap: 6 }}><i className="tl-swatch tl-test" />Scored (test)</span>
      </div>
      <p className="xs faint" style={{ marginTop: 8 }}>
        IMDAA covers only Jun–Aug 2020 in this download and MERA only Jun–Sep 2023, so both are ingested but kept out of the reported scores.
      </p>
    </div>
  );
}
