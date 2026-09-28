import { useMemo } from "react";
import { css, rainRamp, rainT, RAIN_STEPS } from "../lib/colors";
import { useData, type Alert, type CaseDay, type District, type Grid, type GridInfo } from "../lib/data";
import { ColorKey, GridMap } from "./ui/GridMap";
import { Counter, Loading, Reveal } from "./ui/primitives";
import "./case.css";

const peak = (g: Grid) => Math.max(...g.filter((v): v is number => v != null));
const rainColor = (v: number) => css(rainRamp(rainT(v)));

export function CaseStudy() {
  const day = useData<CaseDay>("cases/michaung.json");
  const grid = useData<GridInfo>("grid.json");
  const districts = useData<District[]>("districts.json");
  const alerts = useData<Alert[]>("alerts.json");

  const warned = useMemo(() => new Set((alerts ?? []).filter((a) => a.valid_date === "2023-12-04").map((a) => a.district)), [alerts]);
  const obsPeak = day ? peak(day.obs.rain) : 0;
  const blendPeak = day ? peak(day.fc.rain.blend[0]) : 0;
  const outline = (d: District) => (warned.has(d.name) ? "rgba(250,178,25,0.22)" : undefined);

  return (
    <section className="section case" id="case" aria-labelledby="case-title">
      <div className="container">
        <Reveal>
          <span className="eyebrow">Case study</span>
          <h2 className="h2" id="case-title">Cyclone Michaung: right place,<br />wrong amount</h2>
        </Reveal>
        <div className="case-grid">
          <Reveal className="case-story">
            <div className="case-tags">
              <span className="chip chip--good">Location: correct</span>
              <span className="chip chip--warn">Peak: under-forecast</span>
            </div>
            <p className="case-num-label kpi-label">Peak rain, 4 Dec 2023</p>
            <div className="case-nums">
              <div><p className="case-num num"><Counter value={obsPeak} suffix=" mm" /></p><p className="small muted">IMD observed</p></div>
              <div><p className="case-num num blend"><Counter value={blendPeak} decimals={1} suffix=" mm" /></p><p className="small muted">BLEND, issued 3 Dec</p></div>
            </div>
            <blockquote className="case-quote">
              The forecast issued on 3 December flagged heavy rain for the next day in
              {" "}{[...warned].join(", ") || "Tirupati, Chittoor, Spsr Nellore and Annamayya"}. The location was right, but blending smooths
              extremes, which is exactly why alerts use a trigger calibrated on 2022 instead of IMD's raw 64.5 mm line.
            </blockquote>
            <p className="xs faint">Highlighted districts received a heavy-rain alert. Grid values: IMD 0.25° rainfall and the BLEND day-1 forecast.</p>
          </Reveal>
          <Reveal className="case-maps panel" delay={0.1}>
            {!day || !grid ? <Loading /> : (
              <>
                <div className="case-map-pair">
                  <figure>
                    <figcaption className="small"><b>IMD observed</b></figcaption>
                    <GridMap grid={grid} districts={districts} values={day.obs.rain} color={rainColor} districtFill={outline}
                      label="Observed rainfall on 4 December 2023" format={(v) => `${v.toFixed(1)} mm`} />
                  </figure>
                  <figure>
                    <figcaption className="small"><b>BLEND, 1 day ahead</b></figcaption>
                    <GridMap grid={grid} districts={districts} values={day.fc.rain.blend[0]} color={rainColor} districtFill={outline}
                      label="BLEND 1-day-ahead rainfall forecast for 4 December 2023" format={(v) => `${v.toFixed(1)} mm`} />
                  </figure>
                </div>
                <ColorKey title="Rainfall (mm/day), IMD categories: 64.5 heavy · 115.6 very heavy · 204.5 extremely heavy"
                  stops={[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => css(rainRamp(t)))} labels={RAIN_STEPS.map(String)} />
              </>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
