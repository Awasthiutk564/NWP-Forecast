import { useMemo, useState } from "react";
import type { District, Grid, GridInfo } from "../../lib/data";

const LON0 = 76, LON1 = 85, LAT0 = 12, LAT1 = 20;
const KX = Math.cos((16 * Math.PI) / 180); // equirectangular, corrected at the region's mid-latitude
export const MAP_W = (LON1 - LON0) * KX * 100;
export const MAP_H = (LAT1 - LAT0) * 100;
export const px = (lon: number) => (lon - LON0) * KX * 100;
export const py = (lat: number) => (LAT1 - lat) * 100;

export function districtPath(d: District) {
  return d.rings.map((r) => "M" + r.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join("L") + "Z").join("");
}

interface Props {
  grid: GridInfo;
  values?: Grid | null;
  color?: (v: number) => string;
  districts?: District[] | null;
  districtFill?: (d: District) => string | undefined;
  onHoverCell?: (c: { lat: number; lon: number; value: number | null } | null) => void;
  onHoverDistrict?: (d: District | null) => void;
  label: string;
  format?: (v: number) => string;
  showTooltip?: boolean;
}

/** Flat map of the 33 × 37 grid with LGD district outlines drawn on top. */
export function GridMap({ grid, values, color, districts, districtFill, onHoverCell, onHoverDistrict, label, format, showTooltip = true }: Props) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string; sub?: string } | null>(null);
  const cellW = 0.25 * KX * 100, cellH = 25;

  const cells = useMemo(() => {
    if (!values || !color) return [];
    const out: { k: number; x: number; y: number; fill: string; lat: number; lon: number; v: number }[] = [];
    grid.lat.forEach((la, i) => grid.lon.forEach((lo, j) => {
      const k = i * grid.lon.length + j;
      const v = values[k];
      if (v == null || !grid.land[k]) return;
      out.push({ k, x: px(lo) - cellW / 2, y: py(la) - cellH / 2, fill: color(v), lat: la, lon: lo, v });
    }));
    return out;
  }, [grid, values, color, cellW]);

  const paths = useMemo(() => (districts ?? []).map((d) => ({ d, path: districtPath(d) })), [districts]);

  return (
    <div className="gridmap" style={{ position: "relative" }}>
      <svg viewBox={`-6 -6 ${MAP_W + 12} ${MAP_H + 12}`} role="img" aria-label={label} style={{ width: "100%", height: "auto" }}
        onPointerLeave={() => { setTip(null); onHoverCell?.(null); onHoverDistrict?.(null); }}>
        <g>
          {cells.map((c) => (
            <rect key={c.k} x={c.x} y={c.y} width={cellW + 0.4} height={cellH + 0.4} fill={c.fill}
              onPointerMove={(e) => {
                onHoverCell?.({ lat: c.lat, lon: c.lon, value: c.v });
                if (showTooltip && format) {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: format(c.v), sub: `${c.lat.toFixed(2)}°N ${c.lon.toFixed(2)}°E` });
                }
              }} />
          ))}
        </g>
        <g>
          {paths.map(({ d, path }) => {
            const fill = districtFill?.(d);
            return (
              <path key={d.name} d={path} fill={fill ?? "transparent"} fillOpacity={fill ? 0.9 : 0}
                stroke="rgba(223,232,246,0.45)" strokeWidth={1} vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: onHoverDistrict ? "all" : "none", transition: "fill 0.4s" }}
                onPointerMove={onHoverDistrict ? (e) => {
                  onHoverDistrict(d);
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  if (showTooltip) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: d.name, sub: d.state });
                } : undefined} />
            );
          })}
        </g>
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: Math.max(0, tip.x + 14), top: Math.max(0, tip.y - 10), minWidth: 0 }}>
          <b className="num">{tip.text}</b>
          {tip.sub && <div className="xs faint">{tip.sub}</div>}
        </div>
      )}
    </div>
  );
}

/** Horizontal colour key for a sequential scale. */
export function ColorKey({ stops, labels, title }: { stops: string[]; labels: string[]; title: string }) {
  return (
    <div className="colorkey">
      <p className="xs faint" style={{ margin: "0 0 6px" }}>{title}</p>
      <div style={{ height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${stops.join(",")})` }} />
      <div className="spread xs faint num" style={{ marginTop: 4 }}>{labels.map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  );
}
