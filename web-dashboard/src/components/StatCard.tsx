import type { ReactNode } from "react";
import styles from "./StatCard.module.css";

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: "rain" | "tmax" | "alert" | "neutral";
  loading?: boolean;
}

export default function StatCard({ icon, label, value, sub, color = "neutral", loading = false }: Props) {
  return (
    <div className={`${styles.card} ${styles[color]}`}>
      <div className={styles.iconWrap}>{icon}</div>
      <div className={styles.body}>
        <p className={styles.label}>{label}</p>
        {loading ? (
          <>
            <div className={`${styles.skelValue} skeleton`} />
            <div className={`${styles.skelSub} skeleton`} />
          </>
        ) : (
          <>
            <p className={styles.value}>{value}</p>
            {sub && <p className={styles.sub}>{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}
