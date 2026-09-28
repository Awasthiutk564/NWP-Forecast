"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend
} from "recharts";
import styles from "./ScoreChart.module.css";

const API = "http://localhost:8000";

const SOURCE_COLORS: Record<string, string> = {
  persistence: "#6b7280",
  climatology: "#60a5fa",
  linreg:      "#fbbf24",
  lgbm:        "#34d399",
  BLEND:       "#f97316",
};

interface Series { source: string; data: { lead: number; rmse: number }[]; }

export default function ScoreChart({ variable }: { variable: "rain" | "tmax" }) {
  const [series, setSeries] = useState<Series[]>([]);
  const [leads, setLeads]   = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  useEffect(() => {
    fetch(`${API}/api/scores?var=${variable}`)
      .then(r => r.json())
      .then(d => { setSeries(d.series ?? []); setLeads(d.leads ?? []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [variable]);

  if (loading) return <div className={`${styles.skeleton} skeleton`} />;
  if (error || series.length === 0) return (
    <div className={styles.empty}>No score data available</div>
  );

  const merged = leads.map(l => {
    const row: Record<string, number | string> = { lead: `Day ${l}` };
    series.forEach(s => {
      const pt = s.data.find(d => d.lead === l);
      if (pt) row[s.source] = pt.rmse;
    });
    return row;
  });

  const sorted = [...series].sort(a => a.source === "BLEND" ? 1 : -1);

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={merged} margin={{ top: 4, right: 18, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="lead"
            tick={{ fontSize: 11, fill: "#4a5d75" }}
            tickLine={false} axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#4a5d75" }}
            tickLine={false} axisLine={false}
            label={{ value: "RMSE", angle: -90, position: "insideLeft", fontSize: 10, fill: "#4a5d75", dy: 20 }}
          />
          <Tooltip
            contentStyle={{
              background: "#111827", border: "1px solid #1e2d45",
              borderRadius: 8, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
            }}
            labelStyle={{ fontWeight: 600, color: "#e8edf5" }}
            formatter={(v: any, name: any) => [`${Number(v ?? 0).toFixed(3)}`, String(name)]}
          />
          <Legend
            iconType="circle" iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8, color: "#8a9bb5" }}
          />
          {sorted.map(s => (
            <Line
              key={s.source}
              dataKey={s.source}
              stroke={SOURCE_COLORS[s.source.toLowerCase()] ?? "#4a5d75"}
              strokeWidth={s.source === "BLEND" ? 3 : 1.5}
              strokeDasharray={s.source === "BLEND" ? undefined : "5 3"}
              dot={{ r: s.source === "BLEND" ? 5 : 3, strokeWidth: 0,
                     fill: SOURCE_COLORS[s.source.toLowerCase()] ?? "#4a5d75" }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className={styles.caption}>
        Lower RMSE = better skill · <strong style={{color:"#f97316"}}>BLEND</strong> (orange) is the combined forecast
      </p>
    </div>
  );
}
