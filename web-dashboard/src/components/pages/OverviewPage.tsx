"use client";

import { useEffect, useState } from "react";
import {
  CloudRain, Thermometer, Bell, AlertTriangle, TrendingDown,
  RefreshCw, Activity, BarChart2, CheckCircle2, Database,
  Cpu, GitMerge, Calendar
} from "lucide-react";
import StatCard from "@/components/StatCard";
import ForecastChart from "@/components/ForecastChart";
import ScoreChart from "@/components/ScoreChart";
import AlertsTable from "@/components/AlertsTable";
import styles from "./OverviewPage.module.css";

const API = "http://localhost:8000";

interface Summary {
  rain_rmse: number;
  tmax_rmse: number;
  total_alerts: number;
  red_alerts: number;
  orange_alerts: number;
  yellow_alerts: number;
  forecast_dates: string[];
  latest_date: string | null;
  leads: number[];
}

const PIPELINE_STEPS = [
  { label: "IMD Obs",   done: true  },
  { label: "Baselines", done: true  },
  { label: "LightGBM",  done: true  },
  { label: "Ridge",     done: true  },
  { label: "Blender",   done: true  },
  { label: "Alerts",    done: true  },
];

export default function OverviewPage() {
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/summary`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: Summary = await res.json();
      setSummary(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setError("Cannot reach the Python API server. Run: python api_server.py");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.eyebrow}>SIH 2026 · NCMRWF/MoES · Problem SIH26081</p>
          <h1 className={styles.title}>Forecast Overview</h1>
          <p className={styles.subtitle}>
            AI-blended NWP forecast · Andhra Pradesh &amp; Telangana · 2023 test set
          </p>
        </div>
        <div className={styles.headerRight}>
          {lastUpdated && (
            <span className={styles.lastUpdated}>
              <Activity size={11} /> Updated {lastUpdated}
            </span>
          )}
          <button className={styles.refreshBtn} onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner}>
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Model info strip */}
      <div className={styles.infoStrip}>
        <div className={styles.infoItem}>
          <p className={styles.infoLabel}>Training Data</p>
          <p className={styles.infoValue}>IMD 2010–2021</p>
        </div>
        <div className={styles.infoItem}>
          <p className={styles.infoLabel}>Blend Weights Learned</p>
          <p className={styles.infoValue}>2022 (unseen)</p>
        </div>
        <div className={styles.infoItem}>
          <p className={styles.infoLabel}>Test Year</p>
          <p className={styles.infoValue}>2023 (honest split)</p>
        </div>
        <div className={styles.infoItem}>
          <p className={styles.infoLabel}>Grid Resolution</p>
          <p className={styles.infoValue}>0.25° · 33 × 37 pts</p>
        </div>
        <div className={styles.infoItem}>
          <p className={styles.infoLabel}>Lead Time</p>
          <p className={styles.infoValue}>Day 1–5</p>
        </div>
        <div className={styles.infoItem}>
          <p className={styles.infoLabel}>Variables</p>
          <p className={styles.infoValue}>Rain + Max Temp</p>
        </div>
      </div>

      {/* KPI Cards */}
      <section className={styles.kpiGrid}>
        <StatCard
          icon={<CloudRain size={18} />}
          label="Rainfall RMSE"
          value={summary ? `${summary.rain_rmse} mm/day` : "—"}
          sub="BLEND vs IMD obs · avg leads 1–5"
          color="rain"
          loading={loading}
        />
        <StatCard
          icon={<Thermometer size={18} />}
          label="Temperature RMSE"
          value={summary ? `${summary.tmax_rmse} °C` : "—"}
          sub="BLEND best at all 5 leads"
          color="tmax"
          loading={loading}
        />
        <StatCard
          icon={<Bell size={18} />}
          label="District Alerts"
          value={summary ? `${summary.total_alerts}` : "—"}
          sub={summary ? `🔴 ${summary.red_alerts}  🟠 ${summary.orange_alerts}  🟡 ${summary.yellow_alerts}` : "Loading…"}
          color="alert"
          loading={loading}
        />
        <StatCard
          icon={<Calendar size={18} />}
          label="Latest Init Date"
          value={summary?.latest_date ?? "—"}
          sub={`${summary?.leads.length ?? "—"} lead days available`}
          color="neutral"
          loading={loading}
        />
      </section>

      {/* Pipeline */}
      <div className={styles.pipelineSection}>
        <p className={styles.pipelineTitle}>
          <Database size={12} style={{display:"inline",marginRight:5}} />
          Pipeline Status
        </p>
        <div className={styles.pipelineFlow}>
          {PIPELINE_STEPS.map((s, i) => (
            <>
              <div key={s.label} className={`${styles.pipelineStep} ${s.done ? styles.done : ""}`}>
                {s.done
                  ? <CheckCircle2 size={11} />
                  : <Cpu size={11} />}
                {s.label}
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <span key={`arr-${i}`} className={styles.pipelineArrow}>›</span>
              )}
            </>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <section className={styles.chartsRow}>
        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <BarChart2 size={15} className={styles.cardIcon} />
            <h2 className={styles.cardTitle}>Area-Mean Rainfall Forecast</h2>
            <span className={styles.cardBadge}>Lead day 1</span>
          </div>
          <ForecastChart variable="rain" lead={1} />
        </div>

        <div className={styles.chartCard}>
          <div className={styles.cardHeader}>
            <BarChart2 size={15} className={styles.cardIcon} />
            <h2 className={styles.cardTitle}>Max Temperature Forecast</h2>
            <span className={styles.cardBadge}>Lead day 1</span>
          </div>
          <ForecastChart variable="tmax" lead={1} />
        </div>
      </section>

      {/* Skill scorecard */}
      <section className={styles.section}>
        <div className={styles.cardWide}>
          <div className={styles.cardHeader}>
            <TrendingDown size={15} className={styles.cardIcon} />
            <h2 className={styles.cardTitle}>Skill Scorecard — RMSE by Lead Time</h2>
            <span className={styles.cardBadge}>Rainfall</span>
          </div>
          <ScoreChart variable="rain" />
        </div>
      </section>

      {/* Alerts table */}
      <section className={styles.section}>
        <div className={styles.cardWide}>
          <div className={styles.cardHeader}>
            <AlertTriangle size={15} className={styles.cardIcon} />
            <h2 className={styles.cardTitle}>Recent District Alerts</h2>
            {summary && (
              <span className={`${styles.cardBadge} ${styles.badgeAlert}`}>
                {summary.total_alerts} total
              </span>
            )}
          </div>
          <AlertsTable compact />
        </div>
      </section>

    </div>
  );
}
