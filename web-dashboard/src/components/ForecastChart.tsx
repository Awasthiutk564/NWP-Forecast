"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine
} from "recharts";
import styles from "./ForecastChart.module.css";

const API = "http://localhost:8000";

interface DataPoint { date: string; value: number; }

const COLORS  = { rain: "#38bdf8", tmax: "#f97316" };
const LABELS  = { rain: "Rainfall (mm/day)", tmax: "Max Temp (°C)" };

interface Props { variable: "rain" | "tmax"; lead: number; }

export default function ForecastChart({ variable, lead }: Props) {
  const [data, setData]     = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/forecast/timeseries?var=${variable}&lead=${lead}`)
      .then(r => r.json())
      .then(d => { setData(d.data ?? []); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [variable, lead]);

  if (loading) return <div className={`${styles.skeleton} skeleton`} />;
  if (error || data.length === 0) return (
    <div className={styles.empty}>No data available</div>
  );

  const color = COLORS[variable];
  const avg   = data.reduce((s, d) => s + d.value, 0) / data.length;

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${variable}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#4a5d75" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={d => d.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#4a5d75" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#111827", border: "1px solid #1e2d45",
              borderRadius: 8, fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
            }}
            labelStyle={{ fontWeight: 600, color: "#e8edf5" }}
            itemStyle={{ color: color }}
            formatter={(v: any) => [`${Number(v ?? 0).toFixed(2)}`, LABELS[variable]]}
          />
          <ReferenceLine
            y={avg} stroke={color} strokeDasharray="4 4"
            strokeWidth={1.5} strokeOpacity={0.5}
          />
          <Area
            type="monotone" dataKey="value" stroke={color} strokeWidth={2}
            fill={`url(#grad-${variable})`} dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className={styles.meta}>
        <span>Avg: <strong style={{color}}>{avg.toFixed(2)}</strong></span>
        <span className={styles.dash}>·</span>
        <span>{data.length} init dates</span>
      </div>
    </div>
  );
}
