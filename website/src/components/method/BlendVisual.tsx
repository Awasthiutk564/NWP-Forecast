import { motion } from "framer-motion";
import { useState } from "react";
import { css, SOURCE_META, weightRamp } from "../../lib/colors";
import { useData, type District, type GridInfo, type Var, type Weights } from "../../lib/data";
import { ColorKey, GridMap } from "../ui/GridMap";
import { Loading, Segmented } from "../ui/primitives";

// Grid index = lat_index * 37 + lon_index, on the 0.25° grid starting at 12°N, 76°E.
const CITIES = [
  { name: "Hyderabad", idx: 22 * 37 + 10 },
  { name: "Vijayawada", idx: 18 * 37 + 19 },
  { name: "Visakhapatnam", idx: 23 * 37 + 29 },
  { name: "Tirupati", idx: 7 * 37 + 14 },
];

function PointWeights({ w, v, lead }: { w: Weights; v: Var; lead: number }) {
  const [city, setCity] = useState(CITIES[0].name);
  const idx = CITIES.find((c) => c.name === city)!.idx;
  const srcs = Object.keys(w.maps[v]);
  const vals = srcs.map((s) => ({ s, w: w.maps[v][s][lead - 1][idx] ?? 0 }));
  return (
    <div className="pw">
      <div className="formula" aria-label="weight of a source is proportional to one over its 2022 mean squared error, squared">
        <span className="mono">weight<sub>source</sub></span>
        <span className="mono faint">∝</span>
        <span className="frac mono"><span>1</span><span>MSE²<sub>2022</sub></span></span>
        <span className="faint small">per grid cell × lead day × variable</span>
      </div>
      <div style={{ marginTop: 18, overflowX: "auto" }}>
        <Segmented label="City" value={city} onChange={setCity} options={CITIES.map((c) => ({ value: c.name, label: c.name }))} />
      </div>
      <div className="pw-bars">
        {vals.map(({ s, w: x }) => (
          <div key={s} className="pw-row">
            <span className="pw-name"><i className="dot" style={{ background: SOURCE_META[s].color }} />{SOURCE_META[s].label}</span>
            <div className="pw-track">
              <motion.i animate={{ width: `${x * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} style={{ background: SOURCE_META[s].color }} />
            </div>
            <span className="num pw-val">{(x * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      <p className="xs faint">Weights at the grid cell nearest {city}, {v === "tmax" ? "max temperature" : "rainfall"}, day {lead}. They add up to 100%.</p>
    </div>
  );
}

function WeightMap({ w, grid, districts, v, lead }: { w: Weights; grid: GridInfo; districts: District[] | null; v: Var; lead: number }) {
  const [src, setSrc] = useState("lgbm");
  const srcs = Object.keys(w.maps[v]);
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <Segmented label="Source" value={src} onChange={setSrc} options={srcs.map((s) => ({ value: s, label: SOURCE_META[s].label }))} />
      </div>
      <div style={{ marginTop: 14 }}>
        <GridMap grid={grid} districts={districts} values={w.maps[v][src][lead - 1]} color={(x) => css(weightRamp(x / 0.6))}
          label={`Blend weight of ${SOURCE_META[src].label} for ${v}, day ${lead}`} format={(x) => `${(x * 100).toFixed(0)}% weight`} />
      </div>
      <ColorKey title={`Weight given to ${SOURCE_META[src].label}, day ${lead}`}
        stops={[0, 0.25, 0.5, 0.75, 1].map((t) => css(weightRamp(t)))} labels={["0%", "15%", "30%", "45%", "60%+"]} />
    </div>
  );
}

function LeadShift({ w, v }: { w: Weights; v: Var }) {
  const mean = w.mean[v];
  const srcs = Object.keys(mean);
  return (
    <div className="shift">
      {[1, 2, 3, 4, 5].map((L) => {
        const tot = srcs.reduce((a, s) => a + mean[s][L - 1], 0);
        return (
          <div key={L} className="shift-row">
            <span className="mono xs faint">Day {L}</span>
            <div className="shift-bar">
              {srcs.map((s) => {
                const share = mean[s][L - 1] / tot;
                return (
                  <motion.i key={s} title={`${SOURCE_META[s].label}: ${(share * 100).toFixed(0)}%`}
                    initial={{ flexGrow: 0.0001 }} whileInView={{ flexGrow: share }} viewport={{ once: true }}
                    transition={{ duration: 1, delay: L * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    style={{ background: SOURCE_META[s].color }}>
                    {share > 0.09 && <span>{(share * 100).toFixed(0)}%</span>}
                  </motion.i>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="legend" style={{ marginTop: 12 }}>
        {srcs.map((s) => <span key={s} className="row" style={{ gap: 6 }}><i className="dot" style={{ background: SOURCE_META[s].color }} />{SOURCE_META[s].label}</span>)}
      </div>
      <p className="xs faint">Area-average weight of each source. As lead time grows, "same as today" loses trust and climatology gains it.</p>
    </div>
  );
}

export function BlendVisual({ focus }: { focus: number }) {
  const w = useData<Weights>("weights.json");
  const grid = useData<GridInfo>("grid.json");
  const districts = useData<District[]>("districts.json");
  const [v, setV] = useState<Var>("tmax");
  const [lead, setLead] = useState(1);
  if (!w || !grid) return <Loading />;
  return (
    <div>
      <div className="spread" style={{ marginBottom: 16 }}>
        <Segmented label="Variable" value={v} onChange={setV} options={[{ value: "tmax", label: "Max temp" }, { value: "rain", label: "Rainfall" }]} />
        {focus !== 2 && <Segmented label="Lead day" value={lead} onChange={setLead} options={[1, 2, 3, 4, 5].map((L) => ({ value: L, label: `D${L}` }))} />}
      </div>
      {focus === 0 && <PointWeights w={w} v={v} lead={lead} />}
      {focus === 1 && <WeightMap w={w} grid={grid} districts={districts} v={v} lead={lead} />}
      {focus === 2 && <LeadShift w={w} v={v} />}
    </div>
  );
}
