import { useEffect, useState } from "react";

// ---- Types for the JSON written by scripts/export_data.py -------------------------------

export type Var = "rain" | "tmax";
export type SourceId = "persistence" | "climatology" | "lgbm" | "linreg" | "blend" | "s2s_nwp";

export interface ScoreRow { var: string; lead: number; source: string; rmse: number; bias?: number; corr?: number; n?: number }
export interface SeasonRow { var: string; season: string; lead: number; rmse_season_aware: number; rmse_all_year: number; pct_better: number }
export interface RegimeRow { var: string; regime: string; lead: number; rmse_regime_aware: number; rmse_standard: number; pct_better: number }
export interface AlertScore { hazard: string; rule: string; lead: number; hits: number; misses: number; false_alarms: number; POD: number; FAR: number; CSI: number }
export interface WindAlertScore { level: string; threshold_ms: number; hits: number; misses: number; false_alarms: number; POD: number | null; FAR: number | null; CSI: number | null }
export interface MeraRow { lead: number; truth: string; rmse: number; bias: number; corr: number; obs_mean: number; n: number }
export interface Scores {
  main: ScoreRow[]; hybrid: ScoreRow[]; wind: ScoreRow[];
  season: SeasonRow[]; regime: RegimeRow[];
  alerts: AlertScore[]; alertTriggers: { lead: number; rain_trigger_mm: number; rain_alerts_on: boolean; heat_offset_c: number }[];
  windAlerts: WindAlertScore[]; mera: MeraRow[];
}

export type Grid = (number | null)[];
export interface GridInfo { lat: number[]; lon: number[]; land: boolean[] }
type MeanW = Record<string, Record<string, number[]>>;
export interface Weights {
  maps: Record<Var, Record<string, Grid[]>>;
  mean: MeanW; hybrid: MeanW; wind: MeanW;
  season: Record<string, Record<string, Record<string, number[]>>>;
  regime: Record<string, Record<string, Record<string, number[]>>>;
}
export interface Series { dates: string[]; [k: string]: (number | null)[] | string[] }
export interface CaseIndex { id: string; date: string; title: string; blurb: string; rainMean: number; rainMax: number; tmaxMean: number }
export interface CaseDay {
  id: string; date: string; title: string; blurb: string;
  obs: Record<Var, Grid>;
  fc: Record<Var, Record<string, Grid[]>>;
  rmse: Record<Var, Record<string, (number | null)[]>>;
}
export interface Alert {
  init_date: string; valid_date: string; lead: number; district: string; state: string;
  hazard: "heavy_rain" | "heatwave"; level: "yellow" | "orange" | "red"; value: number;
  message_en: string; message_te: string;
}
export interface District { name: string; state: string; rings: [number, number][][]; c: [number, number] }
export interface ModelCard {
  file: string; system: "main" | "hybrid"; var: Var; lead: number; trees: number; sizeKB: number;
  params: Record<string, string>; importance: Record<string, number>;
}

// ---- Fetch with a shared cache, so every component can ask for the same file freely ---------

const cache = new Map<string, Promise<unknown>>();

export function fetchJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const url = `${import.meta.env.BASE_URL}data/${path}`;
    cache.set(path, fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    }));
  }
  return cache.get(path) as Promise<T>;
}

export function useData<T>(path: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    fetchJSON<T>(path).then((d) => live && setData(d)).catch((e) => console.error(e));
    return () => { live = false; };
  }, [path]);
  return data;
}

// ---- Small helpers used across sections ------------------------------------------------------

export function scoreOf(rows: ScoreRow[], v: string, src: string, lead: number, key: "rmse" | "bias" | "corr" = "rmse") {
  const r = rows.find((x) => x.var === v && x.source.toLowerCase() === src.toLowerCase() && x.lead === lead);
  return r ? (r[key] as number) : NaN;
}

/** Sources present in a score table for one variable, in table order. */
export function sourcesIn(rows: ScoreRow[], v: string) {
  return [...new Set(rows.filter((r) => r.var === v).map((r) => r.source.toLowerCase()))];
}

/** Lowest-RMSE source at each lead. */
export function bestByLead(rows: ScoreRow[], v: string) {
  return [1, 2, 3, 4, 5].map((L) => {
    const at = rows.filter((r) => r.var === v && r.lead === L);
    return at.reduce((a, b) => (b.rmse < a.rmse ? b : a)).source.toLowerCase();
  });
}
