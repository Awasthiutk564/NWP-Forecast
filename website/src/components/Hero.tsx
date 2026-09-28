import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PROJECT } from "../config";
import { scoreOf, useData, type CaseDay, type District, type GridInfo, type Scores, type Series } from "../lib/data";
import { Arrow, Counter } from "./ui/primitives";
import "./hero.css";

const ForecastScene = lazy(() => import("../three/ForecastTerrain").then((m) => ({ default: m.ForecastScene })));

const ROTATING = ["max-temperature skill", "heatwave warnings", "wind forecasts", "day-3 rain skill"];
const SLIDES = [
  { id: "michaung", variable: "rain" as const, label: "Rainfall · Cyclone Michaung" },
  { id: "monsoon-peak", variable: "rain" as const, label: "Rainfall · wettest monsoon day" },
  { id: "heat-peak", variable: "tmax" as const, label: "Max temperature · hottest day" },
];

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % ROTATING.length), 2600); return () => clearInterval(t); }, []);
  return (
    <span className="rotator" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATING[i]}
          initial={{ y: "70%", opacity: 0, filter: "blur(6px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {ROTATING[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Giga-style glowing trace: 2023 daily area-average Tmax, observed vs BLEND day-1. Real data. */
function HeroTrace() {
  const series = useData<Series>("series.json");
  const reduce = useReducedMotion();
  const W = 1440, H = 150;
  const paths = useMemo(() => {
    if (!series) return null;
    const obs = series.tmax_obs as (number | null)[];
    const bl = series.tmax_blend as (number | null)[];
    const vals = [...obs, ...bl].filter((v): v is number => v != null);
    const lo = Math.min(...vals) - 1, hi = Math.max(...vals) + 1;
    const mk = (arr: (number | null)[]) => arr.map((v, i) => v == null ? "" :
      `${i === 0 || arr[i - 1] == null ? "M" : "L"}${((i / (arr.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo)) * H).toFixed(1)}`).join("");
    const months = series.dates.map((d, i) => ({ d, i })).filter(({ d }) => d.endsWith("-01") || d === series.dates[0])
      .map(({ d, i }) => ({ x: (i / (series.dates.length - 1)) * W, m: new Date(d + "T00:00:00").toLocaleString("en", { month: "short" }) }));
    return { obs: mk(obs), blend: mk(bl), months };
  }, [series]);

  if (!paths) return <div className="hero-trace" />;
  return (
    <figure className="hero-trace" aria-label="2023 daily maximum temperature, area average over Andhra Pradesh and Telangana: IMD observed versus BLEND 1-day-ahead forecast">
      <svg viewBox={`0 0 ${W} ${H + 24}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="trace-fade" x1="0" x2="1">
            <stop offset="0" stopColor="#2fbf71" stopOpacity="0.2" />
            <stop offset="0.15" stopColor="#2fbf71" stopOpacity="1" />
            <stop offset="0.85" stopColor="#2fbf71" stopOpacity="1" />
            <stop offset="1" stopColor="#2fbf71" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <motion.path d={paths.obs} fill="none" stroke="rgba(243,245,248,0.35)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.4, ease: "easeInOut", delay: 0.3 }} />
        <motion.path d={paths.blend} fill="none" stroke="url(#trace-fade)" strokeWidth="2.2" vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 8px rgba(47,191,113,0.8))" }}
          initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2.8, ease: "easeInOut", delay: 0.6 }} />
        {paths.months.map((m) => (
          <text key={m.x} x={m.x + 4} y={H + 20} className="trace-month">{m.m}</text>
        ))}
      </svg>
      <figcaption className="trace-caption">
        <span><i className="swatch-line" style={{ background: "#2fbf71" }} /> BLEND, 1 day ahead</span>
        <span><i className="swatch-line" style={{ background: "rgba(243,245,248,0.5)" }} /> IMD observed</span>
        <span className="faint">2023 daily max temperature, AP + Telangana average</span>
      </figcaption>
    </figure>
  );
}

function HeroScene() {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, { margin: "0px" });
  const grid = useData<GridInfo>("grid.json");
  const districts = useData<District[]>("districts.json");
  const [slide, setSlide] = useState(0);
  const s = SLIDES[slide];
  const day = useData<CaseDay>(`cases/${s.id}.json`);
  // warm the other slides
  useData<CaseDay>(`cases/${SLIDES[(slide + 1) % SLIDES.length].id}.json`);

  useEffect(() => {
    const t = setInterval(() => setSlide((x) => (x + 1) % SLIDES.length), 6500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="hero-scene" ref={wrap} aria-hidden>
      {grid && (
        <Suspense fallback={null}>
          <ForecastScene
            grid={grid}
            districts={districts}
            values={day?.obs[s.variable] ?? null}
            variable={s.variable}
            autoRotate
            interactive={false}
            active={inView}
            camera={[3.2, 9.4, 13.2]}
            districtOpacity={0.22}
          />
        </Suspense>
      )}
      <div className="hero-scene-tag">
        <AnimatePresence mode="wait">
          <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}>
            <span className="chip chip--blue">IMD observed</span>
            <b>{s.label}</b>
            <span className="faint num">{day ? fmtDate(day.date) : ""}</span>
          </motion.div>
        </AnimatePresence>
        <div className="hero-dots">
          {SLIDES.map((x, i) => <i key={x.id} className={i === slide ? "on" : ""} />)}
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <section className="hero" ref={ref} aria-labelledby="hero-title">
      <div className="hero-glow" aria-hidden />
      <HeroScene />
      <motion.div className="container hero-inner" style={{ opacity: fade, y: lift }}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <a href="#experiments" className="announce">
            <span className="chip chip--good">New</span>
            Hybrid AI–NWP blend with NCMRWF S2S · wind added <Arrow />
          </a>
        </motion.div>
        <motion.h1 id="hero-title" className="display hero-title"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
          Weather is too important<br />to trust a single model
        </motion.h1>
        <motion.p className="hero-sub" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.25 }}>
          Adaptive AI blending that learns which forecast to trust, and improves <RotatingWord />
        </motion.p>
        <motion.p className="lead hero-lead" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.35 }}>
          For every 0.25° grid cell, every lead day (1–5) and every variable, {PROJECT.name} weighs each source by
          its past error, then turns the blend into next-day district alerts for {PROJECT.region} in English and <span lang="te">తెలుగు</span>.
        </motion.p>
        <motion.div className="row hero-ctas" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.45 }}>
          <a className="btn btn--primary" href="#explorer">Explore the 3-D forecast <Arrow /></a>
          <a className="btn btn--ghost" href="#results">See the results</a>
        </motion.div>
        <HeroStats />
      </motion.div>
      <HeroTrace />
    </section>
  );
}

function HeroStats() {
  const scores = useData<Scores>("scores.json");
  const districts = useData<District[]>("districts.json");
  const heat = scores?.alerts.find((a) => a.hazard === "heatwave" && a.rule.startsWith("calibrated"));
  const tmax1 = scores ? scoreOf(scores.main, "tmax", "blend", 1) : 0;
  return (
    <motion.dl className="hero-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.7 }}>
      <div><dt>Heatwaves warned (POD)</dt><dd><Counter value={heat ? heat.POD * 100 : 0} suffix="%" /></dd></div>
      <div><dt>Tmax error, day 1</dt><dd><Counter value={tmax1} decimals={2} suffix=" °C" /></dd></div>
      <div><dt>Districts covered</dt><dd><Counter value={districts?.length ?? 0} /></dd></div>
      <div><dt>Scored on unseen year</dt><dd className="num">2023</dd></div>
    </motion.dl>
  );
}

export function SourceStrip() {
  const items = ["IMD gridded rainfall 0.25°", "IMD max temperature", "NCMRWF IMDAA reanalysis", "NCMRWF MERA", "NCMRWF S2S forecasts", "LGD district boundaries"];
  return (
    <section className="strip" aria-label="Data sources">
      <p className="strip-label">Built entirely on Indian data</p>
      <div className="strip-track">
        <div className="strip-marquee">
          {[...items, ...items].map((t, i) => <span key={i} aria-hidden={i >= items.length}>{t}</span>)}
        </div>
      </div>
    </section>
  );
}
