import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, y = 24, className, as = "div" }: {
  children: ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "li" | "section" | "article";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}

export function SectionHead({ eyebrow, title, lead, center, accent }: {
  eyebrow: string; title: ReactNode; lead?: ReactNode; center?: boolean; accent?: boolean;
}) {
  return (
    <Reveal className={`section-head${center ? " section-head--center" : ""}`}>
      <span className={`eyebrow${accent ? " eyebrow--accent" : ""}`}>{eyebrow}</span>
      <h2 className="h2">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </Reveal>
  );
}

/** Segmented control with a sliding pill (Framer Motion shared layout). */
export function Segmented<T extends string | number>({ options, value, onChange, label }: {
  options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const id = useId();
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && (
            <motion.span layoutId={`pill-${id}`} className="seg-pill" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
          )}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Counts up to a value when it scrolls into view. */
export function Counter({ value, decimals = 0, suffix = "", prefix = "", duration = 1.6 }: {
  value: number; decimals?: number; suffix?: string; prefix?: string; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, value, duration, mv, reduce]);
  return <motion.span ref={ref} className="num">{text}</motion.span>;
}

export function Loading({ label = "Loading data" }: { label?: string }) {
  return <div className="loading" role="status">{label}…</div>;
}

export function Arrow() {
  return <span className="arrow" aria-hidden>→</span>;
}
