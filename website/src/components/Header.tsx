import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useEffect, useState } from "react";
import { NAV, PROJECT } from "../config";
import "./header.css";

const SIZES = ["sm", "md", "lg", "xl"] as const;

/** Public-service utility strip: identifies the programme, skip link, text-size controls. */
function UtilityStrip() {
  const [size, setSize] = useState<(typeof SIZES)[number]>(() => {
    try { return (localStorage.getItem("ec-text") as (typeof SIZES)[number]) || "md"; } catch { return "md"; }
  });
  useEffect(() => {
    document.documentElement.dataset.text = size;
    try { localStorage.setItem("ec-text", size); } catch { /* storage unavailable */ }
  }, [size]);
  const step = (d: number) => setSize(SIZES[Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(size) + d))]);

  return (
    <div className="utility">
      <div className="tricolor" aria-hidden><span /><span /><span /></div>
      <div className="container utility-row">
        <p className="utility-id">
          <span>{PROJECT.hackathon}</span>
          <span className="sep" aria-hidden>·</span>
          <span>Problem statement {PROJECT.problemId}</span>
          <span className="sep hide-sm" aria-hidden>·</span>
          <span className="hide-sm">{PROJECT.ministry}</span>
        </p>
        <div className="utility-tools">
          <a href="#main" className="utility-link hide-sm">Skip to main content</a>
          <div className="text-size" role="group" aria-label="Text size">
            <button type="button" onClick={() => step(-1)} aria-label="Decrease text size">A−</button>
            <button type="button" onClick={() => setSize("md")} aria-label="Reset text size" aria-pressed={size === "md"}>A</button>
            <button type="button" onClick={() => step(1)} aria-label="Increase text size">A+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Logo() {
  return (
    <a href="#top" className="logo" aria-label={`${PROJECT.name} home`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect x="5" y="16" width="5" height="11" rx="1.5" fill="var(--saffron)" />
        <rect x="13.5" y="7" width="5" height="20" rx="1.5" fill="var(--text)" />
        <rect x="22" y="11" width="5" height="16" rx="1.5" fill="var(--green)" />
      </svg>
      <span>{PROJECT.name}</span>
    </a>
  );
}

export function Header() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  // Highlight the nav item of the section in view.
  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.isIntersecting && setActive(e.target.id));
    }, { rootMargin: "-45% 0px -50% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`} id="top">
      <UtilityStrip />
      <nav className="nav" aria-label="Main">
        <div className="container nav-row">
          <Logo />
          <ul className="nav-links">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} aria-current={active === n.id ? "true" : undefined}>
                  {active === n.id && <motion.span layoutId="nav-active" className="nav-active" transition={{ type: "spring", stiffness: 400, damping: 36 }} />}
                  <span>{n.label}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="nav-cta">
            <a className="btn btn--ghost nav-gh" href={PROJECT.github} target="_blank" rel="noreferrer">GitHub</a>
            <a className="btn btn--primary" href="#explorer">Open explorer</a>
            <button className="nav-burger" type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
              <span className="sr-only">Menu</span>
              <i /><i />
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.ul
              id="mobile-menu"
              className="mobile-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {NAV.map((n) => (
                <li key={n.id}><a href={`#${n.id}`} onClick={() => setOpen(false)}>{n.label}</a></li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
