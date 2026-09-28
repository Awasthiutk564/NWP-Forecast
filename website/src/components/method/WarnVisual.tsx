import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useData, type Alert, type Scores } from "../../lib/data";
import { Loading, Segmented } from "../ui/primitives";

export function fmtDay(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** One district alert, shown in English or Telugu. Level colour always comes with its text label. */
export function AlertCard({ a, lang }: { a: Alert; lang: "en" | "te" }) {
  return (
    <article className={`alert-card lvl-${a.level}`}>
      <div className="spread">
        <span className="alert-level"><i className="dot" />{a.level.toUpperCase()} · {a.hazard === "heatwave" ? "Heatwave" : "Heavy rain"}</span>
        <span className="mono xs faint">Issued {fmtDay(a.init_date)}</span>
      </div>
      <p className="alert-district">{a.district}<span className="faint"> · {a.state}</span></p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={lang} lang={lang} className="alert-msg" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
          {lang === "en" ? a.message_en : a.message_te}
        </motion.p>
      </AnimatePresence>
      <p className="mono xs faint" style={{ margin: 0 }}>
        Valid {fmtDay(a.valid_date)} · calibrated forecast {a.value} {a.hazard === "heatwave" ? "°C" : "mm"}
      </p>
    </article>
  );
}

function Calibration({ scores }: { scores: Scores }) {
  const groups = [
    { hz: "heatwave", title: "Heatwave", note: "+1.0 °C offset" },
    { hz: "heavy_rain", title: "Heavy rain", note: "25 mm trigger" },
  ];
  return (
    <div className="calib">
      {groups.map((g) => {
        const rows = scores.alerts.filter((a) => a.hazard === g.hz);
        return (
          <div key={g.hz} className="calib-group">
            <p className="small" style={{ margin: "0 0 8px" }}><b>{g.title}</b> <span className="faint">· {g.note}</span></p>
            {(["POD", "FAR", "CSI"] as const).map((k) => (
              <div key={k} className="calib-row">
                <span className="mono xs faint">{k}</span>
                <div className="calib-bars">
                  {rows.map((r, i) => (
                    <div key={r.rule} className="calib-bar" title={`${r.rule}: ${r[k].toFixed(2)}`}>
                      <motion.i initial={{ width: 0 }} whileInView={{ width: `${Math.max(0.6, r[k] * 100)}%` }} viewport={{ once: true }}
                        transition={{ duration: 0.9, delay: i * 0.15 }} className={i === 0 ? "raw" : "cal"} />
                      <span className="num xs">{r[k].toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      <div className="legend">
        <span className="row" style={{ gap: 6 }}><i className="swatch-line" style={{ background: "var(--text-3)" }} />Raw IMD rule</span>
        <span className="row" style={{ gap: 6 }}><i className="swatch-line" style={{ background: "var(--saffron)" }} />Calibrated on 2022</span>
      </div>
      <p className="xs faint">
        POD: share of real events warned (higher is better). FAR: share of warnings that did not happen (lower is better).
        CSI: hits ÷ (hits + misses + false alarms). Next-day alerts, district-days in 2023.
      </p>
    </div>
  );
}

export function WarnVisual({ focus }: { focus: number }) {
  const scores = useData<Scores>("scores.json");
  const alerts = useData<Alert[]>("alerts.json");
  const [lang, setLang] = useState<"en" | "te">("te");
  if (!scores || !alerts) return <Loading />;
  if (focus === 0) return <Calibration scores={scores} />;
  const samples = [
    alerts.find((a) => a.district === "Tirupati" && a.valid_date === "2023-12-04") ?? alerts[0],
    alerts.find((a) => a.hazard === "heatwave" && a.level === "orange") ?? alerts.find((a) => a.hazard === "heatwave")!,
  ];
  const shown = focus === 2 ? lang : "en";
  return (
    <div className="stack">
      {focus === 2 && (
        <Segmented label="Message language" value={lang} onChange={setLang}
          options={[{ value: "en", label: "English" }, { value: "te", label: <span lang="te">తెలుగు</span> }]} />
      )}
      {samples.map((a) => <AlertCard key={a.district + a.valid_date + a.hazard} a={a} lang={shown} />)}
    </div>
  );
}
