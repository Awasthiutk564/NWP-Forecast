import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EdgeCast | AI-NWP Hybrid Forecast · AP & Telangana",
  description: "Professional AI-enhanced numerical weather prediction dashboard for Andhra Pradesh and Telangana. Real-time blended forecasts, skill scores, district alerts, and model weight maps. SIH 2026 — Team ZeroPing.",
  keywords: "weather forecast, NWP, AI, machine learning, Andhra Pradesh, Telangana, rainfall, temperature, NCMRWF, IMD, IMDAA, LightGBM, blend",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
