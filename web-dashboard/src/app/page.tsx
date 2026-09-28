"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import OverviewPage from "@/components/pages/OverviewPage";
import LiveMapPage from "@/components/pages/LiveMapPage";
import AlertsPage from "@/components/pages/AlertsPage";
import ScoresPage from "@/components/pages/ScoresPage";
import WeightsPage from "@/components/pages/WeightsPage";
import ChatBot from "@/components/ChatBot";
import styles from "./page.module.css";

export type PageId = "livemap" | "overview" | "alerts" | "scores" | "weights";

export default function Home() {
  const [page, setPage] = useState<PageId>("livemap");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const renderPage = () => {
    switch (page) {
      case "livemap":  return <LiveMapPage />;
      case "overview": return <OverviewPage />;
      case "alerts":   return <AlertsPage />;
      case "scores":   return <ScoresPage />;
      case "weights":  return <WeightsPage />;
      default:         return <LiveMapPage />;
    }
  };

  return (
    <div className={styles.shell}>
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className={styles.main}>
        {renderPage()}
      </main>
      <ChatBot />
    </div>
  );
}
