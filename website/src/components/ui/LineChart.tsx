import { motion, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  emphasis?: boolean;
  dashed?: boolean;
}

interface Props {
  series: LineSeries[];
  xLabels: string[];
  height?: number;
  yFormat?: (v: number) => string;
  yTitle?: string;
  xTitle?: string;
  directLabels?: boolean;
  markers?: boolean;
  xTickEvery?: number;
  tooltipTitle?: (i: number) => string;
  lowerIsBetter?: boolean;
  yDomain?: [number, number];
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Multi-series line chart: thin 2px lines, emphasised series thicker, crosshair tooltip, direct end labels. */
export function LineChart({
  series, xLabels, height = 320, yFormat = (v) => v.toFixed(2), yTitle, xTitle, directLabels = true,
  markers = true, xTickEvery = 1, tooltipTitle, lowerIsBetter, yDomain,
}: Props) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();
  const labelSpace = directLabels ? Math.min(96, width * 0.16) : 12;
  const m = { t: 16, r: labelSpace, b: xTitle ? 46 : 30, l: 52 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const n = xLabels.length;

  const [ymin, ymax, ticks] = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v != null && isFinite(v));
    let lo = yDomain ? yDomain[0] : Math.min(...all);
    let hi = yDomain ? yDomain[1] : Math.max(...all);
    if (!yDomain) { const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad; }
    const t = niceTicks(lo, hi, 5);
    return [yDomain ? lo : t[0], yDomain ? hi : t[t.length - 1], t.filter((v) => v >= (yDomain ? lo : t[0]) - 1e-9)];
  }, [series, yDomain]);

  const x = (i: number) => (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => ih - ((v - ymin) / (ymax - ymin || 1)) * ih;

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v == null || !isFinite(v)) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });

  // Direct labels at the right edge, nudged apart so they never collide.
  const ends = useMemo(() => {
    const items = series.map((s) => {
      let i = s.values.length - 1;
      while (i >= 0 && (s.values[i] == null || !isFinite(s.values[i] as number))) i--;
      return { s, yy: i >= 0 ? y(s.values[i] as number) : -999 };
    }).filter((e) => e.yy > -999).sort((a, b) => a.yy - b.yy);
    for (let k = 1; k < items.length; k++) if (items[k].yy - items[k - 1].yy < 14) items[k].yy = items[k - 1].yy + 14;
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, ymin, ymax, ih]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n === 1 ? 0 : Math.round((px / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hoverRows = hover == null ? [] : series
    .map((s) => ({ s, v: s.values[hover] }))
    .filter((r) => r.v != null && isFinite(r.v as number))
    .sort((a, b) => (lowerIsBetter ? (a.v as number) - (b.v as number) : (b.v as number) - (a.v as number)));

  return (
    <div ref={wrap} style={{ position: "relative", width: "100%" }}>
      <svg className="chart" width={width} height={height} role="img"
        aria-label={`Line chart: ${series.map((s) => s.label).join(", ")}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x1={0} x2={iw} />
                <text x={-10} dy="0.32em" textAnchor="end">{yFormat(t)}</text>
              </g>
            ))}
          </g>
          {xLabels.map((l, i) => (i % xTickEvery === 0 || i === n - 1) && (
            <text key={i} x={x(i)} y={ih + 20} textAnchor="middle">{l}</text>
          ))}
          {yTitle && <text className="axis-label" transform={`translate(${-44},${ih / 2}) rotate(-90)`} textAnchor="middle">{yTitle}</text>}
          {xTitle && <text className="axis-label" x={iw / 2} y={ih + 40} textAnchor="middle">{xTitle}</text>}

          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={ih} stroke="var(--line-2)" />}

          {series.map((s, k) => (
            <motion.path
              key={s.id}
              d={paths[k]}
              fill="none"
              stroke={s.color}
              strokeWidth={s.emphasis ? 3.5 : 2}
              strokeDasharray={s.dashed ? "5 5" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={s.emphasis ? { filter: `drop-shadow(0 0 10px ${s.color}88)` } : undefined}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: s.emphasis ? 1.8 : 1.2, delay: s.emphasis ? 0.4 : k * 0.08, ease: [0.65, 0, 0.35, 1] }}
            />
          ))}
          {markers && series.map((s) => s.values.map((v, i) => v != null && isFinite(v) && (
            <circle key={`${s.id}${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : s.emphasis ? 4.5 : 3.5}
              fill={s.color} stroke="var(--surface)" strokeWidth={2} />
          )))}
          {directLabels && ends.map(({ s, yy }) => (
            <text key={s.id} x={iw + 10} y={yy} dy="0.32em" style={{ fill: "var(--text-2)", fontWeight: s.emphasis ? 700 : 400 }}>
              {s.label}
            </text>
          ))}
          <rect width={iw} height={ih} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </g>
      </svg>
      {hover != null && hoverRows.length > 0 && (
        <div className="tooltip" style={{
          left: Math.min(width - 190, Math.max(0, m.l + x(hover) + 14)),
          top: m.t + 6,
        }}>
          <div className="t-head">{tooltipTitle ? tooltipTitle(hover) : xLabels[hover]}</div>
          {hoverRows.map(({ s, v }) => (
            <div className="t-row" key={s.id}>
              <span><i className="dot" style={{ background: s.color }} />{s.label}</span>
              <b className="num" style={{ fontWeight: s.emphasis ? 700 : 500 }}>{yFormat(v as number)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
