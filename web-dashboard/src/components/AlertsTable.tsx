"use client";

import { useEffect, useState } from "react";
import styles from "./AlertsTable.module.css";

const API = "http://localhost:8000";

interface Alert {
  district:   string;
  state:      string;
  hazard:     string;
  level:      string;
  value:      number;
  lead:       number;
  init_date:  string;
  valid_date: string;
  message_en: string;
}

interface ApiResponse {
  total: number;
  data: Alert[];
}

const LEVEL_CLASS: Record<string, string> = {
  red:    styles.red,
  orange: styles.orange,
  yellow: styles.yellow,
};

const LEVEL_RANK: Record<string, number> = { red: 3, orange: 2, yellow: 1 };

function Badge({ level }: { level: string }) {
  return (
    <span className={`${styles.badge} ${LEVEL_CLASS[level] ?? styles.neutral}`}>
      {level}
    </span>
  );
}

interface Props {
  compact?: boolean;
  levelFilter?: string;
}

export default function AlertsTable({ compact = false, levelFilter }: Props) {
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [activeLevel, setActiveLevel] = useState<string>(levelFilter ?? "all");

  const fetchAlerts = (level: string) => {
    setLoading(true);
    const q = level !== "all" ? `&level=${level}` : "";
    const limit = compact ? 50 : 200;
    fetch(`${API}/api/alerts?limit=${limit}${q}`)
      .then(r => r.json())
      .then((d: ApiResponse) => {
        const sorted = (d.data ?? []).sort(
          (a, b) => (LEVEL_RANK[b.level] ?? 0) - (LEVEL_RANK[a.level] ?? 0)
        );
        setAlerts(sorted);
        setTotal(d.total ?? sorted.length);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(() => { fetchAlerts(activeLevel); }, [activeLevel]);

  if (loading) return (
    <div className={styles.skeletonWrap}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`${styles.skeletonRow} skeleton`} style={{ opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );

  if (error) return <div className={styles.empty}>Failed to load alerts</div>;

  return (
    <>
      {!compact && (
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>Filter:</span>
          {["all", "red", "orange", "yellow"].map(l => (
            <button
              key={l}
              className={`${styles.filterBtn} ${activeLevel === l ? styles.active : ""}`}
              onClick={() => setActiveLevel(l)}
            >
              {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
          <span className={styles.count}>{total} total alerts</span>
        </div>
      )}

      {alerts.length === 0
        ? <div className={styles.empty}>No alerts for this filter</div>
        : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>District</th>
                  <th>State</th>
                  <th>Hazard</th>
                  <th>Level</th>
                  <th>Value</th>
                  <th>Lead</th>
                  <th>Valid Date</th>
                  {!compact && <th>Message</th>}
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, compact ? 20 : undefined).map((a, i) => (
                  <tr key={i} className={styles.row}>
                    <td className={styles.bold}>{a.district}</td>
                    <td>{a.state}</td>
                    <td className={styles.hazard}>{String(a.hazard).replace(/_/g, " ")}</td>
                    <td><Badge level={a.level} /></td>
                    <td className="mono">{typeof a.value === "number" ? a.value.toFixed(1) : a.value}</td>
                    <td className="mono">Day {a.lead}</td>
                    <td className={styles.date}>{a.valid_date}</td>
                    {!compact && <td className={styles.message}>{a.message_en}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </>
  );
}
