"use client";

import { useState, useEffect } from "react";
import { Bell, AlertTriangle, Filter, RefreshCw } from "lucide-react";
import AlertsTable from "@/components/AlertsTable";
import styles from "./AlertsPage.module.css";

const API = "http://localhost:8000";

interface Summary {
  total_alerts: number;
  red_alerts: number;
  orange_alerts: number;
  yellow_alerts: number;
}

export default function AlertsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/summary`)
      .then(r => r.json())
      .then(d => { setSummary(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Operational Alerts · 2023 Test Year</p>
          <h1 className={styles.title}>District Alert Map</h1>
          <p className={styles.subtitle}>
            IMD-calibrated heavy rain &amp; heatwave alerts for Andhra Pradesh &amp; Telangana
          </p>
        </div>
      </header>

      {/* Alert level summary */}
      <div className={styles.levelCards}>
        <div className={`${styles.levelCard} ${styles.red}`}>
          <span className={styles.levelIcon}>🔴</span>
          <span className={styles.levelCount}>{loading ? "—" : (summary?.red_alerts ?? 0)}</span>
          <span className={styles.levelLabel}>Red Alerts</span>
          <span className={styles.levelDesc}>Extremely heavy rain / Extreme heat</span>
        </div>
        <div className={`${styles.levelCard} ${styles.orange}`}>
          <span className={styles.levelIcon}>🟠</span>
          <span className={styles.levelCount}>{loading ? "—" : (summary?.orange_alerts ?? 0)}</span>
          <span className={styles.levelLabel}>Orange Alerts</span>
          <span className={styles.levelDesc}>Very heavy rain / Severe heatwave</span>
        </div>
        <div className={`${styles.levelCard} ${styles.yellow}`}>
          <span className={styles.levelIcon}>🟡</span>
          <span className={styles.levelCount}>{loading ? "—" : (summary?.yellow_alerts ?? 0)}</span>
          <span className={styles.levelLabel}>Yellow Alerts</span>
          <span className={styles.levelDesc}>Heavy rain / Heatwave</span>
        </div>
      </div>

      {/* Thresholds info */}
      <div className={styles.thresholds}>
        <div className={styles.thresholdGroup}>
          <p className={styles.thresholdTitle}>🌧 Heavy Rain Thresholds (IMD)</p>
          <div className={styles.thresholdRow}><span className={styles.threshBadge} style={{background:"rgba(234,179,8,0.15)",color:"#fde047",borderColor:"rgba(234,179,8,0.3)"}}>Yellow</span><span>≥ 64.5 mm</span></div>
          <div className={styles.thresholdRow}><span className={styles.threshBadge} style={{background:"rgba(249,115,22,0.15)",color:"#fdba74",borderColor:"rgba(249,115,22,0.3)"}}>Orange</span><span>≥ 115.6 mm</span></div>
          <div className={styles.thresholdRow}><span className={styles.threshBadge} style={{background:"rgba(239,68,68,0.15)",color:"#fca5a5",borderColor:"rgba(239,68,68,0.3)"}}>Red</span><span>≥ 204.5 mm</span></div>
        </div>
        <div className={styles.thresholdGroup}>
          <p className={styles.thresholdTitle}>🌡 Heatwave Thresholds (IMD Plains)</p>
          <div className={styles.thresholdRow}><span className={styles.threshBadge} style={{background:"rgba(234,179,8,0.15)",color:"#fde047",borderColor:"rgba(234,179,8,0.3)"}}>Yellow</span><span>≥ 40°C &amp; ≥ 4.5°C above normal, or ≥ 45°C</span></div>
          <div className={styles.thresholdRow}><span className={styles.threshBadge} style={{background:"rgba(249,115,22,0.15)",color:"#fdba74",borderColor:"rgba(249,115,22,0.3)"}}>Orange</span><span>≥ 40°C &amp; ≥ 6.5°C above normal, or ≥ 47°C</span></div>
          <div className={styles.thresholdRow}><span className={styles.threshBadge} style={{background:"rgba(239,68,68,0.15)",color:"#fca5a5",borderColor:"rgba(239,68,68,0.3)"}}>Red</span><span>≥ 47°C</span></div>
        </div>
        <div className={styles.thresholdGroup}>
          <p className={styles.thresholdTitle}>📊 Verification (2023)</p>
          <div className={styles.thresholdRow}><span>Heatwave CSI:</span><span style={{color:"#34d399",fontWeight:600}}>0.51 (calibrated)</span></div>
          <div className={styles.thresholdRow}><span>Heavy Rain CSI:</span><span style={{color:"#fbbf24",fontWeight:600}}>0.17 (calibrated)</span></div>
          <div className={styles.thresholdRow}><span>Next-day only</span><span style={{color:"#8a9bb5"}}>Longer leads unverified</span></div>
        </div>
      </div>

      {/* Alerts table */}
      <div className={styles.tableCard}>
        <div className={styles.tableCardHeader}>
          <Filter size={14} className={styles.headerIcon} />
          <h2 className={styles.tableTitle}>All District Alerts</h2>
        </div>
        <AlertsTable />
      </div>
    </div>
  );
}
