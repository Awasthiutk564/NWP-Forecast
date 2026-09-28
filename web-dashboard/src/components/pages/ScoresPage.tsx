"use client";

import { useState, useEffect } from "react";
import { TrendingDown, Info } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell
} from "recharts";
import styles from "./ScoresPage.module.css";

const API = "http://localhost:8000";

interface ScoreRow {
  var: string;
  lead: number;
  source: string;
  rmse: number;
  bias?: number;
  corr?: number;
}

const SOURCE_COLORS: Record<string, string> = {
  persistence: "#6b7280",
  climatology: "#60a5fa",
  linreg:      "#fbbf24",
  lgbm:        "#34d399",
  BLEND:       "#f97316",
};

const RMSE_TABLE: Record<string, Record<number, Record<string, number>>> = {
  rain: {
    1: { Persistence: 11.05, Climatology: 9.16, LightGBM: 8.22, Ridge: 8.69, BLEND: 8.43 },
    2: { Persistence: 11.98, Climatology: 9.16, LightGBM: 8.90, Ridge: 9.07, BLEND: 8.93 },
    3: { Persistence: 12.53, Climatology: 9.16, LightGBM: 9.15, Ridge: 9.23, BLEND: 9.13 },
    4: { Persistence: 12.76, Climatology: 9.16, LightGBM: 9.20, Ridge: 9.27, BLEND: 9.19 },
    5: { Persistence: 12.69, Climatology: 9.16, LightGBM: 9.20, Ridge: 9.28, BLEND: 9.19 },
  },
  tmax: {
    1: { Persistence: 1.06, Climatology: 2.07, LightGBM: 1.01, Ridge: 1.03, BLEND: 1.00 },
    2: { Persistence: 1.54, Climatology: 2.07, LightGBM: 1.42, Ridge: 1.46, BLEND: 1.40 },
    3: { Persistence: 1.85, Climatology: 2.07, LightGBM: 1.64, Ridge: 1.72, BLEND: 1.62 },
    4: { Persistence: 2.04, Climatology: 2.07, LightGBM: 1.75, Ridge: 1.86, BLEND: 1.72 },
    5: { Persistence: 2.16, Climatology: 2.06, LightGBM: 1.82, Ridge: 1.95, BLEND: 1.78 },
  }
};

export default function ScoresPage() {
  const [varSel, setVarSel] = useState<"rain" | "tmax">("rain");
  const [series, setSeries] = useState<{source: string; data: {lead: number; rmse: number}[]}[]>([]);
  const [leads, setLeads]   = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/scores?var=${varSel}`)
      .then(r => r.json())
      .then(d => { setSeries(d.series ?? []); setLeads(d.leads ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [varSel]);

  const merged = leads.map(l => {
    const row: Record<string, string | number> = { lead: `Day ${l}` };
    series.forEach(s => {
      const pt = s.data.find(d => d.lead === l);
      if (pt) row[s.source] = pt.rmse;
    });
    return row;
  });

  const sorted = [...series].sort(a => a.source === "BLEND" ? 1 : -1);

  // Build improvement bar data (% vs persistence at each lead)
  const table = RMSE_TABLE[varSel];
  const improvData = [1,2,3,4,5].map(l => {
    const pers = table[l]["Persistence"];
    return {
      lead: `Day ${l}`,
      "vs Persistence": parseFloat(((pers - (table[l]["BLEND"] ?? pers)) / pers * 100).toFixed(1)),
      "vs Climatology": parseFloat(((table[l]["Climatology"] - (table[l]["BLEND"] ?? 0)) / table[l]["Climatology"] * 100).toFixed(1)),
    };
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Verification · Test Year 2023</p>
          <h1 className={styles.title}>Skill Scorecard</h1>
          <p className={styles.subtitle}>RMSE, improvement over baselines · forecasts issued in 2023</p>
        </div>
        <div className={styles.varToggle}>
          {(["rain","tmax"] as const).map(v => (
            <button
              key={v}
              className={`${styles.varBtn} ${varSel === v ? styles.active : ""}`}
              onClick={() => { setVarSel(v); setLoading(true); }}
            >
              {v === "rain" ? "🌧 Rainfall" : "🌡 Temperature"}
            </button>
          ))}
        </div>
      </header>

      {/* RMSE table from verified numbers */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <TrendingDown size={14} />
          <h2 className={styles.tableTitle}>RMSE by Source and Lead — {varSel === "rain" ? "Rainfall (mm/day)" : "Max Temp (°C)"}</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.rmseTable}>
            <thead>
              <tr>
                <th>Source</th>
                {[1,2,3,4,5].map(l => <th key={l}>Day {l}</th>)}
              </tr>
            </thead>
            <tbody>
              {Object.entries(table[1]).map(([src]) => {
                const isBlend = src === "BLEND";
                return (
                  <tr key={src} className={isBlend ? styles.blendRow : ""}>
                    <td className={styles.srcName}>
                      <span className={styles.srcDot} style={{background: SOURCE_COLORS[src.toLowerCase()] ?? "#6b7280"}} />
                      {src}
                    </td>
                    {[1,2,3,4,5].map(l => {
                      const val = table[l][src];
                      const rowVals = Object.values(table[l]);
                      const isBest = val === Math.min(...rowVals);
                      return (
                        <td key={l} className={isBest ? styles.best : ""}>
                          {val?.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.tableNote}>
          <Info size={11} style={{display:"inline", marginRight:4}} />
          Bold = lowest RMSE · Test year 2023 · honest time split: ML trained 2010–2021, weights on 2022
        </p>
      </div>

      {/* RMSE line chart from API */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>RMSE vs Lead Time (Live from API)</h2>
        </div>
        {loading
          ? <div className={`${styles.chartSkeleton} skeleton`} />
          : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={merged} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="lead" tick={{ fontSize: 11, fill: "#4a5d75" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#4a5d75" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#e8edf5", fontWeight: 600 }}
                  formatter={(v: any, n: any) => [`${Number(v ?? 0).toFixed(3)}`, String(n)]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#8a9bb5" }} />
                {sorted.map(s => (
                  <Line key={s.source} dataKey={s.source}
                    stroke={SOURCE_COLORS[s.source.toLowerCase()] ?? "#4a5d75"}
                    strokeWidth={s.source === "BLEND" ? 3 : 1.5}
                    strokeDasharray={s.source === "BLEND" ? undefined : "5 3"}
                    dot={{ r: s.source === "BLEND" ? 5 : 3, strokeWidth: 0, fill: SOURCE_COLORS[s.source.toLowerCase()] ?? "#4a5d75" }}
                    activeDot={{ r: 6, strokeWidth: 0 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* Improvement bar chart */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>BLEND Improvement over Baselines (%)</h2>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={improvData} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="lead" tick={{ fontSize: 11, fill: "#4a5d75" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#4a5d75" }} tickLine={false} axisLine={false}
              label={{ value: "% RMSE reduction", angle: -90, position: "insideLeft", fontSize: 10, fill: "#4a5d75", dy: 60 }} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e8edf5", fontWeight: 600 }}
              formatter={(v: any, n: any) => [`${Number(v ?? 0) > 0 ? "+" : ""}${Number(v ?? 0).toFixed(1)}%`, String(n)]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#8a9bb5" }} />
            <Bar dataKey="vs Persistence" fill="#60a5fa" radius={[3,3,0,0]} />
            <Bar dataKey="vs Climatology" fill="#34d399" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className={styles.tableNote}>
          Positive = BLEND outperforms the baseline. Negative = baseline beats BLEND.
        </p>
      </div>
    </div>
  );
}
