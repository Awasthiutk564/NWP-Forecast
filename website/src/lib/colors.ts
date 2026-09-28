// Series colours: the validated categorical palette (dark steps), checked against the
// site's #0e131b surface for colour-blind separation. Fixed order, one colour per source.
export const SOURCE_META: Record<string, { label: string; short: string; color: string; kind: string }> = {
  blend:       { label: "BLEND",        short: "BLEND", color: "#3987e5", kind: "Adaptive blend" },
  lgbm:        { label: "LightGBM",     short: "LGBM",  color: "#d95926", kind: "Machine learning" },
  linreg:      { label: "Ridge",        short: "Ridge", color: "#199e70", kind: "Machine learning" },
  climatology: { label: "Climatology",  short: "Clim",  color: "#c98500", kind: "Baseline" },
  persistence: { label: "Persistence",  short: "Pers",  color: "#d55181", kind: "Baseline" },
  s2s_nwp:     { label: "S2S NWP",      short: "S2S",   color: "#9085e9", kind: "Physical model (NCMRWF)" },
};
export const SOURCE_ORDER = ["blend", "lgbm", "linreg", "climatology", "persistence", "s2s_nwp"];

// Alert levels use the reserved status colours, always shown with a text label.
export const LEVEL_COLOR: Record<string, string> = { yellow: "#fab219", orange: "#ec835a", red: "#d03b3b" };

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lerp = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;

function ramp(stops: string[]) {
  const rgb = stops.map(hex);
  return (t: number): RGB => {
    const x = Math.max(0, Math.min(1, t)) * (rgb.length - 1);
    const i = Math.min(rgb.length - 2, Math.floor(x));
    return lerp(rgb[i], rgb[i + 1], x - i);
  };
}

// Sequential, one hue each. On the dark surface "near zero" recedes toward the background.
export const rainRamp = ramp(["#10243f", "#184f95", "#2a78d6", "#5598e7", "#9ec5f4", "#e6f0fc"]);
export const heatRamp = ramp(["#2a1608", "#7a3310", "#c24f14", "#eb6834", "#f6a476", "#fde3d2"]);
export const weightRamp = ramp(["#0f2a22", "#136b4e", "#199e70", "#4cc79a", "#b5ecd6"]);

export const css = ([r, g, b]: RGB) => `rgb(${r},${g},${b})`;

/** IMD rainfall categories (mm/day) mapped onto the ramp so colour steps match the official scale. */
export const RAIN_STEPS = [0, 2.5, 15.6, 64.5, 115.6, 204.5];
export function rainT(v: number) {
  if (v <= 0) return 0;
  for (let i = 1; i < RAIN_STEPS.length; i++) {
    if (v < RAIN_STEPS[i]) return (i - 1 + (v - RAIN_STEPS[i - 1]) / (RAIN_STEPS[i] - RAIN_STEPS[i - 1])) / (RAIN_STEPS.length - 1);
  }
  return 1;
}
export const TMAX_RANGE: [number, number] = [22, 46];
export const tmaxT = (v: number) => (v - TMAX_RANGE[0]) / (TMAX_RANGE[1] - TMAX_RANGE[0]);

export function valueColor(v: number, variable: "rain" | "tmax") {
  return variable === "rain" ? rainRamp(rainT(v)) : heatRamp(tmaxT(v));
}
