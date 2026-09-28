import { useRef, type PointerEvent, type ReactNode } from "react";
import { bestByLead, scoreOf, useData, type District, type Scores } from "../lib/data";
import { Reveal, SectionHead } from "./ui/primitives";
import "./hazards.css";

interface Card { tag: string; title: string; stat: ReactNode; statLabel: string; body: string; href: string; tone: string }

function buildCards(s: Scores, districtCount: number): Card[] {
  const heatRaw = s.alerts.find((a) => a.hazard === "heatwave" && a.rule.startsWith("raw"))!;
  const heatCal = s.alerts.find((a) => a.hazard === "heatwave" && a.rule.startsWith("calibrated"))!;
  const rainRaw = s.alerts.find((a) => a.hazard === "heavy_rain" && a.rule.startsWith("raw"))!;
  const rainCal = s.alerts.find((a) => a.hazard === "heavy_rain" && a.rule.startsWith("calibrated"))!;
  const tmaxWins = bestByLead(s.main, "tmax").filter((x) => x === "blend").length;
  const windWins = bestByLead(s.wind, "wspd").filter((x) => x === "blend").length;
  const windRmse = scoreOf(s.wind, "wspd", "blend", 1);
  const windS2S = scoreOf(s.wind, "wspd", "s2s_nwp", 1);
  const wetGain = s.regime.filter((r) => r.var === "rain" && r.regime === "wet" && r.lead >= 2);
  const maxWet = Math.max(...wetGain.map((r) => r.pct_better));
  const pers = scoreOf(s.main, "rain", "persistence", 1), blendRain = scoreOf(s.main, "rain", "blend", 1);

  return [
    { tag: "Heatwave", title: "Heatwave desk", tone: "heat", href: "#alerts",
      stat: <>{heatRaw.POD.toFixed(2)} → {heatCal.POD.toFixed(2)}</>, statLabel: "share of heatwaves warned (POD)",
      body: "IMD plains criteria applied to the blend after a +1.0 °C correction learned on 2022. Next-day district alerts." },
    { tag: "Temperature", title: "Daily max temperature", tone: "heat", href: "#results",
      stat: <>{tmaxWins} / 5</>, statLabel: "lead days where BLEND is best",
      body: "Blending beats every single source for Tmax at every lead day, with error from 1.00 °C (day 1) to 1.78 °C (day 5)." },
    { tag: "Heavy rain", title: "Flood-watch desk", tone: "rain", href: "#alerts",
      stat: <>{rainRaw.CSI.toFixed(2)} → {rainCal.CSI.toFixed(2)}</>, statLabel: "critical success index",
      body: "The raw 64.5 mm rule almost never fires on a smooth blend. A 25 mm calibrated trigger lifts detection from 1% to 29%." },
    { tag: "Rainfall", title: "Everyday rainfall", tone: "rain", href: "#results",
      stat: <>−{(((pers - blendRain) / pers) * 100).toFixed(0)}%</>, statLabel: "day-1 error vs persistence",
      body: "BLEND is best at day 3 and within 0.5% of the best at days 2, 4 and 5. LightGBM stays ahead at day 1." },
    { tag: "Wind", title: "High-wind desk", tone: "wind", href: "#experiments",
      stat: <>{windRmse.toFixed(2)} m/s</>, statLabel: `day-1 wind error (S2S alone: ${windS2S.toFixed(2)})`,
      body: `Blending S2S with persistence and climatology gives the lowest 10 m wind error at ${windWins} of 5 lead days (2013–15 test).` },
    { tag: "Cyclone", title: "Cyclone Michaung", tone: "rain", href: "#case",
      stat: <>244 mm</>, statLabel: "observed peak on 4 Dec 2023",
      body: "The blend put the rain over the right districts (Nellore–Tirupati coast) but smoothed the peak. That honesty shapes the alert design." },
    { tag: "Weather regime", title: "Wet days vs dry days", tone: "blend", href: "#experiments",
      stat: <>+{maxWet.toFixed(1)}%</>, statLabel: "best rain gain on wet days (days 2–5)",
      body: "Separate weights for active-rain and quiet days, decided only from what is known at issue time." },
    { tag: "Administration", title: "District officers", tone: "blend", href: "#alerts",
      stat: <>{districtCount}</>, statLabel: "LGD districts, AP + Telangana",
      body: "Every alert names an LGD district and ships in English and Telugu, ready to forward to a block or mandal office." },
  ];
}

function SpotCard({ c }: { c: Card }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const move = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty("--mx", `${e.clientX - r.left}px`);
    ref.current!.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <a ref={ref} href={c.href} className={`hz-card hz-${c.tone}`} onPointerMove={move}>
      <span className="chip">{c.tag}</span>
      <h3 className="hz-title">{c.title}</h3>
      <p className="hz-stat num">{c.stat}</p>
      <p className="hz-stat-label">{c.statLabel}</p>
      <p className="hz-body">{c.body}</p>
      <span className="hz-more">Details →</span>
    </a>
  );
}

export function Hazards() {
  const scores = useData<Scores>("scores.json");
  const districts = useData<District[]>("districts.json");
  return (
    <section className="section" id="hazards" aria-labelledby="hazards-title">
      <div className="container">
        <SectionHead center eyebrow="Hazards"
          title={<span id="hazards-title">One blend for every<br />weather desk</span>}
          lead="The same adaptive engine serves heat, rain, wind and cyclone desks. Each card is scored on data the system never saw." />
        <div className="hz-grid">
          {scores && buildCards(scores, districts?.length ?? 59).map((c, i) => (
            <Reveal key={c.title} delay={(i % 4) * 0.06}><SpotCard c={c} /></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
