import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { LEVEL_COLOR } from "../lib/colors";
import { useData, type Alert, type District, type GridInfo, type Scores } from "../lib/data";
import { AlertCard, fmtDay } from "./method/WarnVisual";
import { GridMap } from "./ui/GridMap";
import { Counter, Loading, Reveal, Segmented } from "./ui/primitives";
import "./alerts.css";

type Hz = "all" | "heavy_rain" | "heatwave";
const LANGS = [{ word: "English", lang: "en" }, { word: "తెలుగు", lang: "te" }];

function LangRotator() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % LANGS.length), 2200); return () => clearInterval(t); }, []);
  return (
    <span className="rotator al-rot">
      <AnimatePresence mode="wait">
        <motion.span key={i} lang={LANGS[i].lang} initial={{ y: "60%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-60%", opacity: 0 }} transition={{ duration: 0.45 }}>
          {LANGS[i].word}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** 2023 strip: one bar per day, height = number of district alerts that day. Click a day to open it. */
function YearStrip({ alerts, date, onPick, hz }: { alerts: Alert[]; date: string; onPick: (d: string) => void; hz: Hz }) {
  const days = useMemo(() => {
    const out: { d: string; rain: number; heat: number }[] = [];
    const t = new Date("2023-01-01T00:00:00Z"); // UTC, so toISOString() gives the same calendar day everywhere
    const by = new Map<string, { rain: number; heat: number }>();
    alerts.forEach((a) => {
      const e = by.get(a.valid_date) ?? { rain: 0, heat: 0 };
      if (a.hazard === "heatwave") e.heat++; else e.rain++;
      by.set(a.valid_date, e);
    });
    while (t.getUTCFullYear() === 2023) {
      const d = t.toISOString().slice(0, 10);
      out.push({ d, ...(by.get(d) ?? { rain: 0, heat: 0 }) });
      t.setUTCDate(t.getUTCDate() + 1);
    }
    return out;
  }, [alerts]);
  const max = Math.max(...days.map((x) => x.rain + x.heat), 1);
  const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  return (
    <div className="ystrip">
      <div className="ystrip-bars" role="list" aria-label="District alerts per day in 2023">
        {days.map((x) => {
          const rain = hz === "heatwave" ? 0 : x.rain, heat = hz === "heavy_rain" ? 0 : x.heat;
          const has = rain + heat > 0;
          return (
            <button key={x.d} type="button" role="listitem" className={`ystrip-day${x.d === date ? " on" : ""}`} disabled={!has}
              onClick={() => onPick(x.d)} aria-label={has ? `${fmtDay(x.d)}: ${rain} heavy-rain and ${heat} heatwave alerts` : undefined} tabIndex={has ? 0 : -1}>
              <i className="heat" style={{ height: `${(heat / max) * 100}%` }} />
              <i className="rain" style={{ height: `${(rain / max) * 100}%` }} />
            </button>
          );
        })}
      </div>
      <div className="ystrip-months mono xs faint">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
    </div>
  );
}

export function Alerts() {
  const alerts = useData<Alert[]>("alerts.json");
  const districts = useData<District[]>("districts.json");
  const grid = useData<GridInfo>("grid.json");
  const scores = useData<Scores>("scores.json");
  const [hz, setHz] = useState<Hz>("all");
  const [lang, setLang] = useState<"en" | "te">("en");
  const [date, setDate] = useState("2023-12-04");

  const filtered = useMemo(() => (alerts ?? []).filter((a) => hz === "all" || a.hazard === hz), [alerts, hz]);
  const dates = useMemo(() => [...new Set(filtered.map((a) => a.valid_date))].sort(), [filtered]);
  useEffect(() => { if (dates.length && !dates.includes(date)) setDate(dates[dates.length - 1]); }, [dates, date]);
  const today = filtered.filter((a) => a.valid_date === date);
  const byDistrict = new Map(today.map((a) => [a.district, a]));
  const di = dates.indexOf(date);
  const heat = scores?.alerts.find((a) => a.hazard === "heatwave" && a.rule.startsWith("calibrated"));
  const rain = scores?.alerts.find((a) => a.hazard === "heavy_rain" && a.rule.startsWith("calibrated"));

  return (
    <section className="section" id="alerts" aria-labelledby="alerts-title">
      <div className="container">
        <Reveal className="section-head section-head--center">
          <span className="eyebrow">District alerts</span>
          <h2 className="h2" id="alerts-title">Speaks natively in <LangRotator /></h2>
          <p className="lead">
            {alerts ? <><Counter value={alerts.length} /> next-day alerts</> : "Next-day alerts"} were issued for 2023 across Andhra Pradesh
            and Telangana, each one in English and Telugu. Pick a day to see which districts were warned and what the message said.
          </p>
        </Reveal>

        {!alerts || !districts || !grid ? <Loading /> : (
          <Reveal delay={0.1}>
            <div className="alerts panel">
              <div className="al-toolbar">
                <Segmented label="Hazard" value={hz} onChange={setHz}
                  options={[{ value: "all", label: "All hazards" }, { value: "heavy_rain", label: "Heavy rain" }, { value: "heatwave", label: "Heatwave" }]} />
                <div className="row al-nav">
                  <button type="button" className="btn btn--ghost ex-small" disabled={di <= 0} onClick={() => setDate(dates[di - 1])} aria-label="Previous alert day">←</button>
                  <span className="mono small al-date">{fmtDay(date)}</span>
                  <button type="button" className="btn btn--ghost ex-small" disabled={di >= dates.length - 1} onClick={() => setDate(dates[di + 1])} aria-label="Next alert day">→</button>
                </div>
                <Segmented label="Message language" value={lang} onChange={setLang}
                  options={[{ value: "en", label: "English" }, { value: "te", label: <span lang="te">తెలుగు</span> }]} />
              </div>
              <YearStrip alerts={filtered} date={date} onPick={setDate} hz={hz} />
              <div className="al-body">
                <div className="al-map">
                  <GridMap grid={grid} districts={districts} label={`Districts with alerts valid on ${fmtDay(date)}`}
                    districtFill={(d) => { const a = byDistrict.get(d.name); return a ? LEVEL_COLOR[a.level] : undefined; }}
                    onHoverDistrict={() => {}} />
                  <div className="legend al-legend">
                    {(["yellow", "orange", "red"] as const).map((l) => (
                      <span key={l} className="row" style={{ gap: 6 }}><i className="dot" style={{ background: LEVEL_COLOR[l], borderRadius: 2 }} />{l[0].toUpperCase() + l.slice(1)} alert</span>
                    ))}
                  </div>
                </div>
                <div className="al-list" aria-live="polite">
                  <p className="side-title">{today.length} district{today.length === 1 ? "" : "s"} warned · valid {fmtDay(date)}</p>
                  <div className="al-scroll">
                    <AnimatePresence initial={false}>
                      {today.map((a) => (
                        <motion.div key={a.district + a.hazard + a.valid_date} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                          <AlertCard a={a} lang={lang} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        )}

        {heat && rain && (
          <div className="grid-4 al-tiles">
            {[
              { k: "Heatwaves warned", v: heat.POD * 100, s: "%", note: `POD · ${heat.hits} of ${heat.hits + heat.misses} heatwave district-days` },
              { k: "Heatwave false alarms", v: heat.FAR * 100, s: "%", note: `FAR · CSI ${heat.CSI.toFixed(2)}` },
              { k: "Heavy rain warned", v: rain.POD * 100, s: "%", note: `POD · up from ${(scores!.alerts.find((a) => a.hazard === "heavy_rain")!.POD * 100).toFixed(0)}% with the raw rule` },
              { k: "Heavy-rain false alarms", v: rain.FAR * 100, s: "%", note: `FAR · CSI ${rain.CSI.toFixed(2)}: the known weak spot` },
            ].map((t, i) => (
              <Reveal key={t.k} delay={i * 0.06} className="card al-tile">
                <p className="kpi-label">{t.k}</p>
                <p className="kpi-value"><Counter value={t.v} suffix={t.s} /></p>
                <p className="xs faint" style={{ margin: 0 }}>{t.note}</p>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
