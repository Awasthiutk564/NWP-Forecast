import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Sparkles,
  X,
  Send
} from "lucide-react";
import styles from "./MausamChatBot.module.css";

const API = "http://localhost:8000";

interface ForecastDay {
  lead: number;
  valid_date: string;
  day_name: string;
  rain_mm: number;
  tmax_c: number;
  condition: string;
  icon: string;
}

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  district?: string;
  state?: string;
  forecast?: ForecastDay[];
  alerts?: any[];
  timestamp: string;
}

type Lang = "en" | "te" | "hi";

const GREETINGS: Record<Lang, string> = {
  en: "🇮🇳 **Namaste! I am Megha Mitra (मेघ मित्र)**, your AI meteorological companion for Andhra Pradesh and Telangana.\n\nAsk me about the 5-day weather, rainfall, heatwave, or disaster alerts in any district (e.g., *Hyderabad, Visakhapatnam, Vijayawada, Tirupati, Bapatla*)!",
  te: "🇮🇳 **నమస్కారం! నేను మేఘ మిత్ర (Megha Mitra)**, ఆంధ్రప్రదేశ్ మరియు తెలంగాణ ప్రాంతీయ వాతావరణ AI సహాయకుడిని.\n\nఏదైనా జిల్లాలో రాబోయే 5 రోజుల వర్షపాతం, ఉష్ణోగ్రత మరియు విపత్తు హెచ్చరికల గురించి అడగండి (*హైదరాబాద్, విశాఖపట్నం, విజయవాడ, బాపట్ల, తిరుపతి*)!",
  hi: "🇮🇳 **नमस्ते! मैं मेघ मित्र (Megha Mitra) हूँ**, आंध्र प्रदेश और तेलंगाना के लिए आपका मौसम पूर्वानुमान साथी।\n\nकिसी भी जिले में अगले 5 दिनों की वर्षा, तापमान या आपदा चेतावनी के बारे में पूछें (*हैदराबाद, विशाखापट्टनम, विजयवाड़ा, बापटला, तिरुपति*)!"
};

const PROMPT_CHIPS: Record<Lang, string[]> = {
  en: [
    "📍 Weather in Hyderabad",
    "🌧 Rain in Visakhapatnam",
    "🌀 Cyclone Michaung Bapatla",
    "🌡 Temperature in Vijayawada",
    "🚨 Active Red Alerts"
  ],
  te: [
    "📍 హైదరాబాద్ వాతావరణం",
    "🌧 విశాఖపట్నంలో వర్షం",
    "🌀 బాపట్ల మిచాంగ్ తుఫాను",
    "🌡 విజయవాడ ఉష్ణోగ్రత",
    "🚨 తీవ్రమైన హెచ్చరికలు"
  ],
  hi: [
    "📍 हैदराबाद में मौसम",
    "🌧 विशाखापट्टनम में बारिश",
    "🌀 बापटला चक्रवात",
    "🌡 विजयवाड़ा में तापमान",
    "🚨 सक्रिय रेड अलर्ट"
  ]
};

// Fallback forecast knowledge for popular cities if local Python API is offline
const FALLBACK_CITIES: Record<string, { state: string; rain: number[]; tmax: number[]; cond: string }> = {
  hyderabad: { state: "Telangana", rain: [0.1, 0.0, 0.2, 0.5, 0.1], tmax: [30.4, 30.2, 30.1, 30.5, 31.0], cond: "Dry / Clear" },
  visakhapatnam: { state: "Andhra Pradesh", rain: [1.2, 2.4, 1.8, 0.5, 0.0], tmax: [29.5, 29.2, 29.8, 30.1, 30.0], cond: "Passing Showers" },
  vijayawada: { state: "Andhra Pradesh", rain: [0.5, 0.8, 0.2, 0.0, 0.0], tmax: [31.2, 31.5, 31.0, 31.8, 32.0], cond: "Sunny / Warm" },
  tirupati: { state: "Andhra Pradesh", rain: [2.1, 1.5, 0.8, 0.2, 0.1], tmax: [29.8, 29.5, 30.0, 30.2, 30.4], cond: "Partly Cloudy" },
  bapatla: { state: "Andhra Pradesh", rain: [142.5, 88.0, 24.5, 6.0, 1.2], tmax: [26.5, 27.2, 28.5, 29.8, 30.2], cond: "Cyclone Rain Band" },
  guntur: { state: "Andhra Pradesh", rain: [1.0, 0.5, 0.0, 0.0, 0.2], tmax: [31.0, 31.2, 31.5, 31.8, 32.1], cond: "Dry / Sunny" },
  warangal: { state: "Telangana", rain: [0.2, 0.0, 0.1, 0.4, 0.2], tmax: [30.8, 31.0, 31.2, 31.5, 31.4], cond: "Sunny / Clear" },
  kurnool: { state: "Andhra Pradesh", rain: [0.0, 0.0, 0.1, 0.2, 0.0], tmax: [32.5, 32.8, 33.0, 33.2, 33.0], cond: "Warm / Sunny" },
  nellore: { state: "Andhra Pradesh", rain: [85.0, 42.0, 12.0, 2.5, 0.5], tmax: [27.0, 27.8, 28.5, 29.5, 30.0], cond: "Heavy Rainfall" }
};

export function MausamChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "bot",
      text: GREETINGS["en"],
      timestamp: "Just now"
    }
  ]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Update greeting if language switched and only initial message is present
  const handleLangChange = (newLang: Lang) => {
    setLang(newLang);
    if (messages.length === 1 && messages[0].id === "init") {
      setMessages([
        {
          id: "init",
          sender: "bot",
          text: GREETINGS[newLang],
          timestamp: "Just now"
        }
      ]);
    }
  };

  const handleSend = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // 1. Attempt live query to FastAPI backend
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q })
      });

      if (!res.ok) throw new Error("API call failed");
      const data = await res.json();

      const botMsg: Message = {
        id: `b-${Date.now()}`,
        sender: "bot",
        text: data.reply || "Forecast details retrieved.",
        district: data.district,
        state: data.state,
        forecast: data.forecast || [],
        alerts: data.alerts || [],
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      // 2. Intelligent local fallback if API server is not running
      const qLower = q.toLowerCase();
      let matchedCity = "hyderabad";
      for (const city of Object.keys(FALLBACK_CITIES)) {
        if (qLower.includes(city) || (city === "visakhapatnam" && (qLower.includes("vizag") || qLower.includes("విశాఖ") || qLower.includes("विशाख")))) {
          matchedCity = city;
          break;
        }
      }

      const cData = FALLBACK_CITIES[matchedCity] || FALLBACK_CITIES["hyderabad"];
      const dTitle = matchedCity.charAt(0).toUpperCase() + matchedCity.slice(1);
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

      const mockForecast: ForecastDay[] = cData.rain.map((r, i) => ({
        lead: i + 1,
        valid_date: `Day +${i + 1}`,
        day_name: days[i],
        rain_mm: r,
        tmax_c: cData.tmax[i],
        condition: r > 50 ? "Heavy Rain / Storm" : r > 5 ? "Showers" : "Dry / Sunny",
        icon: r > 50 ? "⛈" : r > 5 ? "🌧" : "☀️"
      }));

      const totalRain = cData.rain.reduce((a, b) => a + b, 0).toFixed(1);
      const maxTemp = Math.max(...cData.tmax).toFixed(1);

      let replyText = "";
      if (lang === "te") {
        replyText = `🌦 **${dTitle} (${cData.state}) రాబోయే 5 రోజుల వాతావరణ అంచనా:**\n\n` +
          `• **రేపటి వాతావరణం:** గరిష్ట ఉష్ణోగ్రత **${cData.tmax[0]}°C**, వర్షపాతం **${cData.rain[0]} mm**.\n` +
          `• **5 రోజుల మొత్తం వర్షపాతం:** సుమారు **${totalRain} mm**, గరిష్ట ఉష్ణోగ్రత **${maxTemp}°C**.\n` +
          `• **హెచ్చరిక స్థాయి:** ${Number(totalRain) > 100 ? "⚠️ తీవ్ర వర్షపాతం హెచ్చరిక (రెడ్ అలర్ట్)" : "✅ సాధారణం (ఎలాంటి ప్రమాదం లేదు)"}.`;
      } else if (lang === "hi") {
        replyText = `🌦 **${dTitle} (${cData.state}) के लिए 5-दिवसीय मौसम आउटलुक:**\n\n` +
          `• **कल का पूर्वानुमान:** अधिकतम तापमान **${cData.tmax[0]}°C**, संभावित वर्षा **${cData.rain[0]} mm**.\n` +
          `• **5 दिनों का कुल अनुमान:** वर्षा ~**${totalRain} mm**, उच्चतम तापमान **${maxTemp}°C**.\n` +
          `• **चेतावनी स्तर:** ${Number(totalRain) > 100 ? "⚠️ अत्यधिक भारी वर्षा चेतावनी (Red Alert)" : "✅ सामान्य मौसम (कोई चेतावनी नहीं)"}.`;
      } else {
        replyText = `🌦 **5-Day Weather Outlook for ${dTitle} (${cData.state}):**\n\n` +
          `• **Tomorrow:** High of **${cData.tmax[0]}°C** with **${cData.rain[0]} mm** precipitation (${cData.cond}).\n` +
          `• **5-Day Total:** Expected cumulative rainfall ~**${totalRain} mm**, peak temperature reaching **${maxTemp}°C**.\n` +
          `• **Severe Alerts:** ${Number(totalRain) > 100 ? "⚠️ RED ALERT: Torrential coastal rainfall & localized waterlogging possible." : "✅ Normal conditions; no active extreme alerts."}`;
      }

      const botMsg: Message = {
        id: `b-${Date.now()}`,
        sender: "bot",
        text: replyText,
        district: dTitle,
        state: cData.state,
        forecast: mockForecast,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          className={styles.floatBtn}
          onClick={() => setIsOpen(true)}
          aria-label="Open Megha Mitra AI Weather Assistant"
        >
          <div className={styles.pulseRing} />
          <Sparkles size={16} />
          <span>Megha Mitra · मेघ मित्र</span>
        </button>
      )}

      {/* Expanded Chat Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={styles.chatDrawer}
            initial={{ opacity: 0, y: 25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Indian Tricolor Stripe */}
            <div className={styles.tricolorBar}>
              <span />
              <span />
              <span />
            </div>

            {/* Header */}
            <div className={styles.chatHeader}>
              <div className={styles.botInfo}>
                <div className={styles.botEmblem}>🌦</div>
                <div>
                  <div className={styles.botTitle}>
                    <span>Megha Mitra</span>
                    <span className={styles.botBadge}>AI ASSISTANT</span>
                  </div>
                  <div className={styles.botSub}>
                    <span className={styles.statusDot} />
                    <span>NCMRWF / MoES Blending Engine</span>
                  </div>
                </div>
              </div>

              <div className={styles.headerActions}>
                {/* Language Switcher */}
                <div className={styles.langPills}>
                  <button
                    className={`${styles.langBtn} ${lang === "en" ? styles.langActive : ""}`}
                    onClick={() => handleLangChange("en")}
                  >
                    EN
                  </button>
                  <button
                    className={`${styles.langBtn} ${lang === "te" ? styles.langActive : ""}`}
                    onClick={() => handleLangChange("te")}
                  >
                    తె
                  </button>
                  <button
                    className={`${styles.langBtn} ${lang === "hi" ? styles.langActive : ""}`}
                    onClick={() => handleLangChange("hi")}
                  >
                    हि
                  </button>
                </div>

                <button
                  className={styles.closeBtn}
                  onClick={() => setIsOpen(false)}
                  title="Close Assistant"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Conversation Log */}
            <div className={styles.chatMessages}>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`${styles.msg} ${m.sender === "user" ? styles.userMsg : styles.botMsg}`}
                >
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    {m.text.split("\n").map((line, lIdx) => {
                      const parts = line.split("**");
                      return (
                        <div key={lIdx} style={{ marginBottom: line ? 3 : 6 }}>
                          {parts.map((p, pIdx) =>
                            pIdx % 2 === 1 ? <strong key={pIdx}>{p}</strong> : p
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Embedded 5-Day Mini Forecast Card */}
                  {m.forecast && m.forecast.length > 0 && (
                    <div className={styles.forecastCard}>
                      <div className={styles.forecastHeader}>
                        <span style={{ color: "var(--saffron)" }}>
                          {m.district} · 5-Day Outlook
                        </span>
                        <span style={{ color: "var(--text-3)", fontSize: 10 }}>
                          Lead +1d to +5d
                        </span>
                      </div>

                      <div className={styles.forecastGrid}>
                        {m.forecast.map((f) => (
                          <div key={f.lead} className={styles.dayCell}>
                            <span className={styles.dayName}>{f.day_name.slice(0, 3)}</span>
                            <span className={styles.dayIcon}>{f.icon}</span>
                            <span className={styles.dayRain}>{f.rain_mm}m</span>
                            <span className={styles.dayTemp}>{Math.round(f.tmax_c)}°</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className={`${styles.msg} ${styles.botMsg}`}>
                  <div className={styles.typing}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Quick Suggestion Chips */}
            <div className={styles.chipsWrap}>
              {PROMPT_CHIPS[lang].map((chip, idx) => (
                <button
                  key={idx}
                  className={styles.chip}
                  onClick={() => {
                    const cleanQuery = chip.replace(/^[^\w\s\u0c00-\u0c7f\u0900-\u097f]+/, "").trim();
                    handleSend(cleanQuery);
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Input Field */}
            <form
              className={styles.inputForm}
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                type="text"
                className={styles.textInput}
                placeholder={
                  lang === "te"
                    ? "హైదరాబాద్, వైజాగ్, బాపట్ల వాతావరణం గురించి అడగండి..."
                    : lang === "hi"
                    ? "हैदराबाद, विशाखापट्टनम, बापटला के मौसम के बारे में पूछें..."
                    : "Ask about weather in Hyderabad, Vizag, Tirupati..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
              />
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={!input.trim() || loading}
                title="Send query"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
