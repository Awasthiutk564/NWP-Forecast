"use client";

import { Cloud, LayoutDashboard, MapPin, Bell, TrendingDown, Map, Zap } from "lucide-react";
import type { PageId } from "@/app/page";
import styles from "./Sidebar.module.css";

const NAV = [
  { id: "livemap"  as PageId,  label: "Live Map",      icon: MapPin,         badge: "REALTIME" },
  { id: "overview" as PageId,  label: "Overview",      icon: LayoutDashboard },
  { id: "alerts"   as PageId,  label: "Alert Warnings", icon: Bell,           badge: "LIVE" },
  { id: "scores"   as PageId,  label: "Skill Scores",  icon: TrendingDown },
  { id: "weights"  as PageId,  label: "Weight Maps",   icon: Map },
];

interface Props {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export default function Sidebar({ activePage, onNavigate }: Props) {
  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <Cloud size={18} strokeWidth={2.2} />
        </div>
        <div className={styles.logoText}>
          <span className={styles.logoTitle}>EdgeCast</span>
          <span className={styles.logoSub}>NWP Hybrid Forecast</span>
        </div>
      </div>

      {/* Info badge */}
      <div className={styles.badge}>
        <span className={styles.badgeLabel}>Region</span>
        <span className={styles.badgeValue}>AP & Telangana</span>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <span className={styles.navSection}>Dashboard</span>
        {NAV.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            className={`${styles.navItem} ${activePage === id ? styles.active : ""}`}
            onClick={() => onNavigate(id)}
            aria-current={activePage === id ? "page" : undefined}
          >
            <span className={styles.navIcon}>
              <Icon size={15} strokeWidth={2} />
            </span>
            <span>{label}</span>
            {badge && <span className={styles.navItemBadge}>{badge}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerRow}>
          <span className={styles.statusDot} />
          <span>API connected</span>
        </div>
        <div className={styles.footerRow}>
          <Zap size={10} />
          <span>SIH 2026 · Team ZeroPing</span>
        </div>
      </div>
    </aside>
  );
}
