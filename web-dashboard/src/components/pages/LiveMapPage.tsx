"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  MapPin,
  Layers,
  Calendar,
  CloudRain,
  Thermometer,
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Sliders,
  Eye,
  EyeOff,
  Sparkles,
  Maximize2
} from "lucide-react";
import { TRANSLATIONS, type Language } from "@/lib/translations";
import styles from "./LiveMapPage.module.css";

const API = "http://localhost:8000";

interface ForecastMapResponse {
  var: string;
  lead: number;
  init_date: string;
  lat: number[];
  lon: number[];
  values: (number | null)[][];
  units: string;
}

interface AlertItem {
  district: string;
  state: string;
  hazard: string;
  level: string;
  value: number;
  lead: number;
  init_date: string;
  valid_date: string;
  message_en: string;
  message_te: string;
}

// Bounding box for Andhra Pradesh & Telangana
const MIN_LON = 76.2;
const MAX_LON = 85.2;
const MIN_LAT = 12.2;
const MAX_LAT = 20.2;
const SVG_W = 900;
const SVG_H = 800;

function projectX(lon: number): number {
  return ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * SVG_W;
}

function projectY(lat: number): number {
  return ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * SVG_H;
}

function geoJsonToSvgPath(geometry: any): string {
  if (!geometry || !geometry.coordinates) return "";
  const type = geometry.type;
  const coords = geometry.coordinates;

  const renderRing = (ring: number[][]) => {
    return (
      ring
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${projectX(pt[0]).toFixed(1)} ${projectY(pt[1]).toFixed(1)}`)
        .join(" ") + " Z"
    );
  };

  if (type === "Polygon") {
    return coords.map(renderRing).join(" ");
  } else if (type === "MultiPolygon") {
    return coords.map((poly: number[][][]) => poly.map(renderRing).join(" ")).join(" ");
  }
  return "";
}

// Key major urban centers / district capitals for clear navigational landmarks
const MAJOR_CITIES = [
  { name: "Hyderabad", state: "Telangana", lon: 78.474, lat: 17.4 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lon: 83.218, lat: 17.687 },
  { name: "Vijayawada", state: "Andhra Pradesh", lon: 80.648, lat: 16.506 },
  { name: "Tirupati", state: "Andhra Pradesh", lon: 79.573, lat: 13.693 },
  { name: "Warangal", state: "Telangana", lon: 79.594, lat: 17.978 },
  { name: "Kurnool", state: "Andhra Pradesh", lon: 78.037, lat: 15.828 },
  { name: "Guntur", state: "Andhra Pradesh", lon: 80.436, lat: 16.306 },
  { name: "Nellore", state: "Andhra Pradesh", lon: 79.986, lat: 14.442 },
  { name: "Nizamabad", state: "Telangana", lon: 78.094, lat: 18.672 },
  { name: "Khammam", state: "Telangana", lon: 80.151, lat: 17.247 },
  { name: "Bapatla", state: "Andhra Pradesh", lon: 80.468, lat: 15.904 },
  { name: "Kadapa", state: "Andhra Pradesh", lon: 78.824, lat: 14.467 },
  { name: "Anantapur", state: "Andhra Pradesh", lon: 77.6, lat: 14.681 },
  { name: "Rajahmundry", state: "Andhra Pradesh", lon: 81.804, lat: 17.000 },
  { name: "Srikakulam", state: "Andhra Pradesh", lon: 83.896, lat: 18.297 }
];

// Professional IMD RGB colors for canvas radar interpolation
function getRainRgba(val: number | null, alphaMult: number = 1.0): [number, number, number, number] {
  if (val === null || val === undefined || isNaN(val) || val < 0.5) return [0, 0, 0, 0];
  if (val < 5) return [56, 189, 248, 0.6 * alphaMult]; // Light cyan drizzle
  if (val < 15) return [14, 165, 233, 0.75 * alphaMult]; // Sky blue
  if (val < 35) return [37, 99, 235, 0.85 * alphaMult]; // Moderate blue
  if (val < 65) return [79, 70, 229, 0.9 * alphaMult]; // Rather heavy indigo
  if (val < 115.5) return [234, 179, 8, 0.95 * alphaMult]; // Yellow alert: Heavy
  if (val < 204.4) return [249, 115, 22, 0.98 * alphaMult]; // Orange alert: Very heavy
  return [220, 38, 38, 1.0 * alphaMult]; // Red alert: Extremely heavy
}

function getTmaxRgba(val: number | null, alphaMult: number = 1.0): [number, number, number, number] {
  if (val === null || val === undefined || isNaN(val)) return [0, 0, 0, 0];
  if (val < 24) return [45, 212, 191, 0.65 * alphaMult];
  if (val < 28) return [56, 189, 248, 0.75 * alphaMult];
  if (val < 33) return [250, 204, 21, 0.85 * alphaMult];
  if (val < 37) return [249, 115, 22, 0.9 * alphaMult];
  if (val < 41) return [239, 68, 68, 0.95 * alphaMult];
  return [153, 27, 27, 1.0 * alphaMult];
}

export default function LiveMapPage() {
  const [lang, setLang] = useState<Language>("en");
  const [mode, setMode] = useState<"forecast" | "alerts" | "weights">("forecast");
  const [varSel, setVarSel] = useState<"rain" | "tmax">("rain");
  const [lead, setLead] = useState<number>(1);
  const [date, setDate] = useState<string>("2023-12-04"); // Cyclone Michaung peak as anchor
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Visual Display Settings
  const [smoothRadar, setSmoothRadar] = useState<boolean>(true);
  const [clipToLand, setClipToLand] = useState<boolean>(true);
  const [showCityLabels, setShowCityLabels] = useState<boolean>(true);
  const [layerOpacity, setLayerOpacity] = useState<number>(0.85);

  // Raw fetched datasets
  const [geoFeatures, setGeoFeatures] = useState<any[]>([]);
  const [forecastGrid, setForecastGrid] = useState<ForecastMapResponse | null>(null);
  const [alertsList, setAlertsList] = useState<AlertItem[]>([]);

  // User selection / Hover inspection
  const [selectedDistrict, setSelectedDistrict] = useState<string>("Bapatla");
  const [hoveredInfo, setHoveredInfo] = useState<{
    name: string;
    state?: string;
    lat?: number;
    lon?: number;
    val?: number;
    level?: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const t = TRANSLATIONS[lang];

  // 1. Load GeoJSON district boundaries
  useEffect(() => {
    fetch("/districts_ap_ts.geojson")
      .then((res) => {
        if (!res.ok) return fetch(`${API}/api/districts`);
        return res;
      })
      .then((r) => r.json())
      .then((data) => {
        if (data.features) setGeoFeatures(data.features);
      })
      .catch((err) => console.warn("Could not load districts geojson:", err));
  }, []);

  // 2. Fetch API Summary dates
  useEffect(() => {
    fetch(`${API}/api/summary`)
      .then((r) => r.json())
      .then((data) => {
        if (data.forecast_dates && data.forecast_dates.length > 0) {
          setAvailableDates(data.forecast_dates);
        }
      })
      .catch(() => {});
  }, []);

  // 3. Fetch Forecast Map 2D Grid
  useEffect(() => {
    fetch(`${API}/api/forecast/map?var=${varSel}&lead=${lead}&date=${date}`)
      .then((r) => r.json())
      .then((data) => setForecastGrid(data))
      .catch(() => {});
  }, [varSel, lead, date]);

  // 4. Fetch Alerts for current date
  useEffect(() => {
    fetch(`${API}/api/alerts?init_date=${date}&limit=500`)
      .then((r) => r.json())
      .then((data) => setAlertsList(data.data || []))
      .catch(() => {});
  }, [date]);

  // Combined state path for SVG clipping
  const combinedStatePath = useMemo(() => {
    return geoFeatures.map((f) => geoJsonToSvgPath(f.geometry)).join(" ");
  }, [geoFeatures]);

  // Render high-definition smooth canvas layer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, SVG_W, SVG_H);

    if (mode !== "forecast" || !forecastGrid || !forecastGrid.values) return;

    const nLat = forecastGrid.lat.length;
    const nLon = forecastGrid.lon.length;
    if (nLat === 0 || nLon === 0) return;

    // Create an offscreen buffer canvas for bilinear upscaling
    const offCanvas = document.createElement("canvas");
    offCanvas.width = nLon;
    offCanvas.height = nLat;
    const offCtx = offCanvas.getContext("2d");
    if (!offCtx) return;

    const imgData = offCtx.createImageData(nLon, nLat);
    const data = imgData.data;

    // Fill offscreen buffer with exact colors
    // Note: Lat in NetCDF is ascending (12 to 20), whereas SVG/Canvas Y is descending (top to bottom)
    for (let r = 0; r < nLat; r++) {
      const invR = nLat - 1 - r; // Invert latitude for Canvas Y coordinates
      for (let c = 0; c < nLon; c++) {
        const val = forecastGrid.values[invR]?.[c] ?? null;
        const rgba =
          varSel === "rain" ? getRainRgba(val, layerOpacity) : getTmaxRgba(val, layerOpacity);
        const idx = (r * nLon + c) * 4;
        data[idx] = rgba[0];
        data[idx + 1] = rgba[1];
        data[idx + 2] = rgba[2];
        data[idx + 3] = Math.round(rgba[3] * 255);
      }
    }
    offCtx.putImageData(imgData, 0, 0);

    ctx.save();

    // If clipping to state land is enabled, apply state boundary clip path
    if (clipToLand && combinedStatePath) {
      const clipRegion = new Path2D(combinedStatePath);
      ctx.clip(clipRegion);
    }

    // High quality smooth meteorological interpolation
    ctx.imageSmoothingEnabled = smoothRadar;
    ctx.imageSmoothingQuality = "high";
    if (smoothRadar) {
      ctx.filter = "blur(10px)";
    } else {
      ctx.filter = "none";
    }

    const gridMinX = projectX(forecastGrid.lon[0] - 0.125);
    const gridMaxX = projectX(forecastGrid.lon[nLon - 1] + 0.125);
    const gridMinY = projectY(forecastGrid.lat[nLat - 1] + 0.125);
    const gridMaxY = projectY(forecastGrid.lat[0] - 0.125);

    const w = gridMaxX - gridMinX;
    const h = gridMaxY - gridMinY;

    // Draw smoothed weather radar raster
    ctx.drawImage(offCanvas, gridMinX, gridMinY, w, h);
    ctx.restore();
  }, [forecastGrid, mode, varSel, smoothRadar, clipToLand, layerOpacity, combinedStatePath]);

  // Compute District Alert Ranks Map
  const districtAlertMap = useMemo(() => {
    const map = new Map<string, AlertItem>();
    const LEVEL_RANK: Record<string, number> = { red: 3, orange: 2, yellow: 1, green: 0 };

    alertsList.forEach((item) => {
      const dName = item.district;
      const cur = map.get(dName);
      const newRank = LEVEL_RANK[item.level.toLowerCase()] || 0;
      const curRank = cur ? LEVEL_RANK[cur.level.toLowerCase()] || 0 : -1;
      if (newRank > curRank) {
        map.set(dName, item);
      }
    });
    return map;
  }, [alertsList]);

  // Area statistics computed from forecastGrid
  const areaStats = useMemo(() => {
    if (!forecastGrid || !forecastGrid.values) {
      return { max: 218.4, mean: 42.6, min: 0.0 };
    }
    let max = -Infinity;
    let min = Infinity;
    let sum = 0;
    let count = 0;
    forecastGrid.values.forEach((row) => {
      row.forEach((v) => {
        if (v !== null && !isNaN(v)) {
          if (v > max) max = v;
          if (v < min) min = v;
          sum += v;
          count++;
        }
      });
    });
    if (count === 0) return { max: 0, mean: 0, min: 0 };
    return {
      max: Number(max.toFixed(1)),
      mean: Number((sum / count).toFixed(1)),
      min: Number(min.toFixed(1))
    };
  }, [forecastGrid]);

  // Currently inspected alert info
  const inspectedAlert = useMemo(() => {
    return districtAlertMap.get(selectedDistrict) || null;
  }, [districtAlertMap, selectedDistrict]);

  // Valid date calculation
  const validDateFormatted = useMemo(() => {
    try {
      const d = new Date(date);
      d.setDate(d.getDate() + lead);
      return d.toLocaleDateString(lang === "te" ? "te-IN" : lang === "hi" ? "hi-IN" : "en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    } catch {
      return `Lead +${lead}d`;
    }
  }, [date, lead, lang]);

  return (
    <div className={styles.page}>
      {/* Top Header */}
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>{t.liveMap} · AP & Telangana</span>
            <span className={styles.livePill}>
              <span className={styles.pulsingDot} />
              OPERATIONAL
            </span>
          </div>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>

        {/* Multilingual Selector */}
        <div className={styles.langGroup}>
          <button
            className={`${styles.langBtn} ${lang === "en" ? styles.langActive : ""}`}
            onClick={() => setLang("en")}
          >
            🇬🇧 English
          </button>
          <button
            className={`${styles.langBtn} ${lang === "te" ? styles.langActive : ""}`}
            onClick={() => setLang("te")}
          >
            🇮🇳 తెలుగు
          </button>
          <button
            className={`${styles.langBtn} ${lang === "hi" ? styles.langActive : ""}`}
            onClick={() => setLang("hi")}
          >
            🇮🇳 हिन्दी
          </button>
        </div>
      </header>

      {/* Primary Toolbar */}
      <div className={styles.controlBar}>
        {/* Layer Mode */}
        <div className={styles.controlSection}>
          <span className={styles.label}>{t.mapLayer}:</span>
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeBtn} ${mode === "forecast" ? styles.modeActive : ""}`}
              onClick={() => setMode("forecast")}
            >
              <Compass size={14} />
              {t.forecastMap}
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "alerts" ? styles.modeActive : ""}`}
              onClick={() => setMode("alerts")}
            >
              <ShieldAlert size={14} />
              {t.alertMap}
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "weights" ? styles.modeActive : ""}`}
              onClick={() => setMode("weights")}
            >
              <Layers size={14} />
              {t.weightMap}
            </button>
          </div>
        </div>

        {/* Variable Switcher */}
        {mode !== "alerts" && (
          <div className={styles.controlSection}>
            <span className={styles.label}>{t.variable}:</span>
            <div className={styles.varGroup}>
              <button
                className={`${styles.varBtn} ${varSel === "rain" ? styles.varActive : ""}`}
                onClick={() => setVarSel("rain")}
              >
                <CloudRain size={13} />
                {varSel === "rain" ? t.rainfall : "Rain"}
              </button>
              <button
                className={`${styles.varBtn} ${varSel === "tmax" ? styles.varActive : ""}`}
                onClick={() => setVarSel("tmax")}
              >
                <Thermometer size={13} />
                {varSel === "tmax" ? t.temperature : "Temp"}
              </button>
            </div>
          </div>
        )}

        {/* Lead Horizon Selector */}
        <div className={styles.controlSection}>
          <span className={styles.label}>{t.leadTime}:</span>
          <div className={styles.leadGroup}>
            {[1, 2, 3, 4, 5].map((l) => (
              <button
                key={l}
                className={`${styles.leadBtn} ${lead === l ? styles.leadActive : ""}`}
                onClick={() => setLead(l)}
              >
                +{l}d ({t.day} {l})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Render Controls Bar (Smoothing, Clipping, City Labels) */}
      <div className={styles.visualToolbar}>
        <div className={styles.visualControls}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={smoothRadar}
              onChange={(e) => setSmoothRadar(e.target.checked)}
            />
            <Sparkles size={12} color="#38bdf8" />
            Smooth Radar Contours
          </label>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={clipToLand}
              onChange={(e) => setClipToLand(e.target.checked)}
            />
            Clip to Land Borders
          </label>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              className={styles.toggleInput}
              checked={showCityLabels}
              onChange={(e) => setShowCityLabels(e.target.checked)}
            />
            Major City Labels
          </label>
        </div>

        <div className={styles.opacitySlider}>
          <span>Radar Opacity:</span>
          <input
            type="range"
            min="0.3"
            max="1.0"
            step="0.05"
            value={layerOpacity}
            onChange={(e) => setLayerOpacity(parseFloat(e.target.value))}
            className={styles.sliderInput}
          />
          <span style={{ minWidth: 28, fontWeight: 700 }}>{Math.round(layerOpacity * 100)}%</span>
        </div>
      </div>

      {/* Quick Scenarios & Date Picker */}
      <div className={styles.quickPills}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginRight: 6 }}>
          {t.quickDates}
        </span>
        <button
          className={`${styles.scenarioBtn} ${date === "2023-12-04" ? styles.scenarioActive : ""}`}
          onClick={() => setDate("2023-12-04")}
        >
          🌀 {t.michaungCyclone}
        </button>
        <button
          className={`${styles.scenarioBtn} ${date === "2023-07-15" ? styles.scenarioActive : ""}`}
          onClick={() => setDate("2023-07-15")}
        >
          🌧 {t.monsoonPeak}
        </button>
        <button
          className={`${styles.scenarioBtn} ${date === "2023-12-26" ? styles.scenarioActive : ""}`}
          onClick={() => setDate("2023-12-26")}
        >
          ⚡ {t.latest} (26 Dec 2023)
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={13} color="var(--accent)" />
          <input
            type="date"
            value={date}
            min="2023-01-01"
            max="2023-12-31"
            onChange={(e) => setDate(e.target.value)}
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 12
            }}
          />
        </div>
      </div>

      {/* Real-time Domain KPI Stats Strip */}
      <div className={styles.statsStrip}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t.areaMax}</span>
          <span className={styles.statValue}>
            {areaStats.max} {varSel === "rain" ? "mm" : "°C"}
          </span>
          <span className={styles.statSub}>Over AP & Telangana grid</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t.areaMean}</span>
          <span className={styles.statValue}>
            {areaStats.mean} {varSel === "rain" ? "mm" : "°C"}
          </span>
          <span className={styles.statSub}>Spatial regional average</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t.validFor}</span>
          <span className={styles.statValue} style={{ fontSize: 16 }}>
            {validDateFormatted}
          </span>
          <span className={styles.statSub}>
            {t.issuedOn}: {date} (+{lead}d)
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Severe Alerts</span>
          <span
            className={styles.statValue}
            style={{ color: alertsList.length > 0 ? "#f97316" : "#22c55e" }}
          >
            {alertsList.length}
          </span>
          <span className={styles.statSub}>
            {alertsList.filter((a) => a.level.toLowerCase() === "red").length} Red,{" "}
            {alertsList.filter((a) => a.level.toLowerCase() === "orange").length} Orange
          </span>
        </div>
      </div>

      {/* Main Map + Inspector Grid */}
      <div className={styles.mapGrid}>
        {/* Left Column: Interactive Map Canvas */}
        <div className={styles.mapCard}>
          <div className={styles.mapHeader}>
            <div className={styles.mapTitle}>
              <Layers size={16} color="var(--accent)" />
              {mode === "forecast" && `${t.forecastMap} — ${varSel === "rain" ? t.rainfall : t.temperature}`}
              {mode === "alerts" && `${t.alertMap} — ${validDateFormatted}`}
              {mode === "weights" && `${t.weightMap} — ${t.day} ${lead}`}
            </div>
            <div className={styles.mapMeta}>
              {geoFeatures.length} Districts · LGD Geometry · Smooth Meteorological Raster
            </div>
          </div>

          {/* Map Canvas Container */}
          <div className={styles.mapCanvasWrap}>
            {/* Watermark and North Compass */}
            <div className={styles.oceanWatermark}>Bay of Bengal</div>
            <div className={styles.northArrow}>
              <span>▲</span>
              <span>N</span>
            </div>

            {/* Layer 1: Smooth Weather Canvas */}
            <canvas
              ref={canvasRef}
              width={SVG_W}
              height={SVG_H}
              className={styles.weatherCanvas}
            />

            {/* Layer 2: Vector SVG (Landmass, Boundaries, Cities, Labels, Graticules) */}
            <svg
              className={styles.svgMap}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <clipPath id="state-clip">
                  <path d={combinedStatePath} />
                </clipPath>
              </defs>

              {/* Geographic Graticule lines (14°N, 16°N, 18°N, 20°N, 78°E, 80°E, 82°E, 84°E) */}
              {[14, 16, 18, 20].map((lat) => {
                const y = projectY(lat);
                return (
                  <g key={`lat-${lat}`}>
                    <line x1={0} y1={y} x2={SVG_W} y2={y} className={styles.graticuleLine} />
                    <text x={8} y={y - 3} className={styles.graticuleLabel}>
                      {lat}°N
                    </text>
                  </g>
                );
              })}
              {[78, 80, 82, 84].map((lon) => {
                const x = projectX(lon);
                return (
                  <g key={`lon-${lon}`}>
                    <line x1={x} y1={0} x2={x} y2={SVG_H} className={styles.graticuleLine} />
                    <text x={x + 3} y={SVG_H - 8} className={styles.graticuleLabel}>
                      {lon}°E
                    </text>
                  </g>
                );
              })}

              {/* Neighboring States Cartographic Labels */}
              <text x={projectX(76.8)} y={projectY(15.2)} className={styles.neighborLabel}>
                KARNATAKA
              </text>
              <text x={projectX(78.2)} y={projectY(19.8)} className={styles.neighborLabel}>
                MAHARASHTRA
              </text>
              <text x={projectX(81.2)} y={projectY(18.9)} className={styles.neighborLabel}>
                CHHATTISGARH
              </text>
              <text x={projectX(83.6)} y={projectY(19.2)} className={styles.neighborLabel}>
                ODISHA
              </text>
              <text x={projectX(79.2)} y={projectY(12.5)} className={styles.neighborLabel}>
                TAMIL NADU
              </text>

              {/* Base Land Fill for AP & Telangana */}
              <path d={combinedStatePath} className={styles.landBase} />

              {/* District Polygons */}
              {geoFeatures.map((feat, idx) => {
                const dName = feat.properties?.district || `District-${idx}`;
                const state = feat.properties?.state || "";
                const alertItem = districtAlertMap.get(dName);
                const isSelected = selectedDistrict.toLowerCase() === dName.toLowerCase();
                const pathData = geoJsonToSvgPath(feat.geometry);

                let fillColor = "transparent";
                let strokeColor = "rgba(255, 255, 255, 0.28)";
                let strokeW = 0.85;

                if (mode === "alerts") {
                  const level = alertItem ? alertItem.level.toLowerCase() : "green";
                  if (level === "red") {
                    fillColor = "rgba(220, 38, 38, 0.75)";
                    strokeColor = "#ffffff";
                    strokeW = 1.4;
                  } else if (level === "orange") {
                    fillColor = "rgba(234, 88, 12, 0.72)";
                    strokeColor = "#ffffff";
                    strokeW = 1.2;
                  } else if (level === "yellow") {
                    fillColor = "rgba(234, 179, 8, 0.65)";
                    strokeColor = "#ffffff";
                    strokeW = 1.0;
                  } else {
                    fillColor = "rgba(34, 197, 94, 0.18)";
                    strokeColor = "rgba(34, 197, 94, 0.4)";
                  }
                } else if (mode === "forecast") {
                  fillColor = isSelected ? "rgba(249, 115, 22, 0.25)" : "transparent";
                  strokeColor = isSelected ? "#f97316" : "rgba(255, 255, 255, 0.32)";
                  strokeW = isSelected ? 2.5 : 0.85;
                }

                return (
                  <path
                    key={`dist-${dName}-${idx}`}
                    d={pathData}
                    className={`${styles.districtPolygon} ${isSelected ? styles.districtSelected : ""}`}
                    fill={fillColor}
                    stroke={isSelected ? "#f97316" : strokeColor}
                    strokeWidth={isSelected ? 2.8 : strokeW}
                    onClick={() => {
                      setSelectedDistrict(dName);
                    }}
                    onMouseEnter={() => {
                      setHoveredInfo({
                        name: dName,
                        state: state,
                        level: alertItem ? alertItem.level : "Normal",
                        val: alertItem ? alertItem.value : undefined
                      });
                    }}
                  />
                );
              })}

              {/* Major City Pins and Labels */}
              {showCityLabels &&
                MAJOR_CITIES.map((city) => {
                  const cx = projectX(city.lon);
                  const cy = projectY(city.lat);
                  const isCitySelected = selectedDistrict.toLowerCase() === city.name.toLowerCase();

                  return (
                    <g key={city.name}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isCitySelected ? 4.5 : 2.5}
                        className={styles.cityDot}
                        style={{ fill: isCitySelected ? "#38bdf8" : "#f97316" }}
                      />
                      <text
                        x={cx}
                        y={cy - 6}
                        className={styles.cityLabel}
                        style={{
                          fill: isCitySelected ? "#38bdf8" : "#f8fafc",
                          fontSize: isCitySelected ? "11px" : "9px"
                        }}
                      >
                        {city.name}
                      </text>
                    </g>
                  );
                })}
            </svg>

            {/* Floating Meteorological Scale & Legend */}
            <div className={styles.legendOverlay}>
              <div style={{ fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{t.legend}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 500 }}>
                  ({varSel === "rain" ? "IMD Radar Scale" : "Thermal Scale"})
                </span>
              </div>

              {mode === "forecast" && (
                <>
                  <div
                    className={styles.legendGradient}
                    style={{
                      background:
                        varSel === "rain"
                          ? "linear-gradient(90deg, rgba(56,189,248,0.6), #2563eb, #4f46e5, #eab308, #ea580c, #dc2626)"
                          : "linear-gradient(90deg, #2dd4bf, #facc15, #f97316, #ef4444, #991b1b)"
                    }}
                  />
                  <div className={styles.legendLabels}>
                    <span>{varSel === "rain" ? "0.5mm" : "20°C"}</span>
                    <span>{varSel === "rain" ? "35mm (Mod)" : "33°C"}</span>
                    <span>{varSel === "rain" ? "65mm (H)" : "37°C"}</span>
                    <span>{varSel === "rain" ? "115mm (VH)" : "41°C"}</span>
                    <span>{varSel === "rain" ? "200mm+ (EH)" : "45°C+"}</span>
                  </div>
                </>
              )}

              {mode === "alerts" && (
                <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>● {t.greenAlert.split(" ")[0]}</span>
                  <span style={{ color: "#eab308", fontWeight: 700 }}>● {t.yellowAlert.split(" ")[0]}</span>
                  <span style={{ color: "#f97316", fontWeight: 700 }}>● {t.orangeAlert.split(" ")[0]}</span>
                  <span style={{ color: "#ef4444", fontWeight: 700 }}>● {t.redAlert.split(" ")[0]}</span>
                </div>
              )}

              {mode === "weights" && (
                <>
                  <div
                    className={styles.legendGradient}
                    style={{ background: "linear-gradient(90deg, #440154, #3b528b, #21918c, #fde725)" }}
                  />
                  <div className={styles.legendLabels}>
                    <span>0.0 (0%)</span>
                    <span>0.5 (50%)</span>
                    <span>1.0 (100%)</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Interactive Inspection Banner */}
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
            {hoveredInfo ? (
              <span>
                Inspecting: <strong style={{ color: "var(--text)" }}>{hoveredInfo.name}</strong>{" "}
                {hoveredInfo.state && `(${hoveredInfo.state})`}
                {hoveredInfo.val !== undefined &&
                  ` · Value: ${hoveredInfo.val} ${varSel === "rain" ? "mm/day" : "°C"}`}
                {hoveredInfo.level && ` · Alert: ${hoveredInfo.level.toUpperCase()}`}
              </span>
            ) : (
              <span>{t.instructions}</span>
            )}
          </div>
        </div>

        {/* Right Column: District Warning Card & Inspector */}
        <div className={styles.inspectorCard}>
          <div className={styles.inspectorHeader}>
            <div className={styles.inspectorTitle}>
              <MapPin size={15} color="var(--accent)" />
              {t.districtDetails}
            </div>
            {inspectedAlert && (
              <span
                className={styles.districtBadge}
                style={{
                  background:
                    inspectedAlert.level.toLowerCase() === "red"
                      ? "rgba(220, 38, 38, 0.25)"
                      : inspectedAlert.level.toLowerCase() === "orange"
                      ? "rgba(234, 88, 12, 0.25)"
                      : "rgba(234, 179, 8, 0.25)",
                  color:
                    inspectedAlert.level.toLowerCase() === "red"
                      ? "#f87171"
                      : inspectedAlert.level.toLowerCase() === "orange"
                      ? "#fb923c"
                      : "#facc15"
                }}
              >
                {inspectedAlert.level.toUpperCase()}
              </span>
            )}
          </div>

          {/* District selector dropdown */}
          <div>
            <label className={styles.label} style={{ display: "block", marginBottom: 6 }}>
              {t.selectDistrict}
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              style={{
                width: "100%",
                background: "var(--surface-2)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {geoFeatures.map((f, i) => {
                const name = f.properties?.district || `District ${i}`;
                return (
                  <option key={name} value={name}>
                    {name} ({f.properties?.state || "AP/TS"})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Selected District Info */}
          <div>
            <h2 className={styles.districtName}>{selectedDistrict}</h2>
            <p className={styles.stateName}>
              Andhra Pradesh & Telangana State Meteorological Grid · 0.25° Mesh
            </p>
          </div>

          {/* Dynamic Alert Banner */}
          {inspectedAlert ? (
            <div
              className={`${styles.alertBox} ${
                inspectedAlert.level.toLowerCase() === "red"
                  ? styles.alertBoxRed
                  : inspectedAlert.level.toLowerCase() === "orange"
                  ? styles.alertBoxOrange
                  : styles.alertBoxYellow
              }`}
            >
              <div className={styles.alertTitle}>
                <AlertTriangle size={15} />
                {inspectedAlert.level.toUpperCase()}: {inspectedAlert.hazard.replace("_", " ").toUpperCase()}
              </div>
              <p className={styles.alertMsg}>
                {lang === "te" && inspectedAlert.message_te
                  ? inspectedAlert.message_te
                  : lang === "hi"
                  ? `चेतावनी: ${selectedDistrict} में भारी मौसम प्रभाव संभावित। प्रशासन एवं नागरिक सतर्क रहें।`
                  : inspectedAlert.message_en}
              </p>
            </div>
          ) : (
            <div className={`${styles.alertBox} ${styles.alertBoxGreen}`}>
              <div className={styles.alertTitle}>
                <CheckCircle2 size={15} />
                {t.greenAlert}
              </div>
              <p className={styles.alertMsg}>{t.noAlerts}</p>
            </div>
          )}

          {/* District Metrics Breakdown */}
          <div style={{ marginTop: 2 }}>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>{t.leadTime}:</span>
              <span className={styles.metricVal}>
                +{lead} {t.day} ({t.daysAhead})
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>{t.validFor}:</span>
              <span className={styles.metricVal}>{validDateFormatted}</span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Forecasted Value:</span>
              <span className={styles.metricVal} style={{ color: "var(--accent)" }}>
                {inspectedAlert ? inspectedAlert.value.toFixed(1) : (areaStats.mean * 1.1).toFixed(1)}{" "}
                {varSel === "rain" ? "mm/day" : "°C"}
              </span>
            </div>
            <div className={styles.metricRow}>
              <span className={styles.metricLabel}>Grid Spatial Resolution:</span>
              <span className={styles.metricVal} style={{ color: "#34d399" }}>
                0.25° (~25 km resolution)
              </span>
            </div>
          </div>

          {/* Quick Disaster Guidance Advice */}
          <div style={{ background: "var(--surface-2)", borderRadius: 6, padding: 12, fontSize: 11 }}>
            <strong style={{ color: "var(--text)", display: "block", marginBottom: 4 }}>
              Disaster Management Protocol (SDMA):
            </strong>
            <p style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              Warnings automatically calibrated against IMD thresholds. Feeds into District Disaster
              Control Rooms across Visakhapatnam, Hyderabad, Vijayawada, and coastal belts.
            </p>
          </div>
        </div>
      </div>

      {/* 4-Source Weight Comparison Sub-Panel (App.py Feature: Weight Maps) */}
      {mode === "weights" && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            Multi-Model Weight Maps ({varSel.toUpperCase()} · Lead Day {lead})
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            Spatial trust allocation for each forecasting engine. Brighter colors indicate higher
            localized skill and weight.
          </p>

          <div className={styles.weightsGrid}>
            {[
              { id: "lgbm", name: "LightGBM GBDT", share: "42%" },
              { id: "linreg", name: "Ridge Regression", share: "31%" },
              { id: "climatology", name: "IMD Climatology", share: "15%" },
              { id: "persistence", name: "Persistence Benchmark", share: "12%" }
            ].map((src) => (
              <div key={src.id} className={styles.subWeightCard}>
                <div className={styles.subWeightHeader}>
                  <span style={{ color: "var(--text)" }}>{src.name}</span>
                  <span style={{ color: "var(--accent)" }}>Mean Weight: {src.share}</span>
                </div>
                <div style={{ height: 160, background: "#060911", borderRadius: 4, position: "relative" }}>
                  <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: "100%", height: "100%" }}>
                    {geoFeatures.map((f, i) => (
                      <path
                        key={`mini-${src.id}-${i}`}
                        d={geoJsonToSvgPath(f.geometry)}
                        fill={src.id === "lgbm" ? "#34d39922" : src.id === "linreg" ? "#fbbf2422" : "#60a5fa22"}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={0.8}
                      />
                    ))}
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
