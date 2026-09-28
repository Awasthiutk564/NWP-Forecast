"use client";

import { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  CloudRain,
  Thermometer,
  ShieldAlert,
  ChevronDown
} from "lucide-react";
import styles from "./ChatBot.module.css";

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

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m-0",
    sender: "bot",
    text: "👋 **Namaste! I am Megha Mitra (మేఘ మిత్ర / मेघ मित्र)**, your AI meteorological companion for Andhra Pradesh and Telangana.\n\nAsk me about upcoming weather, rain, temperature, or disaster alerts in any of our 59 districts!",
    timestamp: "Just now"
  }
];

const PROMPT_CHIPS = [
  "📍 Weather in Hyderabad",
  "🌧 Rain in Visakhapatnam",
  "🌀 Cyclone Michaung Bapatla",
  "🌡 Temperature in Vijayawada",
  "🚨 Active severe alerts",
  "హైదరాబాద్ వాతావరణం",
  "मौसम कैसा रहेगा?"
];

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsgId = `u-${Date.now()}`;
    const userMsg: Message = {
      id: userMsgId,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query })
      });

      if (!res.ok) throw new Error("API response error");
      const data = await res.json();

      const botMsg: Message = {
        id: `b-${Date.now()}`,
        sender: "bot",
        text: data.reply || "Forecast information retrieved.",
        district: data.district,
        state: data.state,
        forecast: data.forecast || [],
        alerts: data.alerts || [],
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      // Fallback offline mock response if server connection is interrupted
      const botMsg: Message = {
        id: `b-${Date.now()}`,
        sender: "bot",
        text: `🌦 **Weather Outlook:** Unable to reach the local API server on http://localhost:8000. Please verify that 'python api_server.py' is running.`,
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
        <button className={styles.chatFloatBtn} onClick={() => setIsOpen(true)}>
          <div className={styles.pulseRing} />
          <Sparkles size={16} />
          <span>Megha Mitra AI</span>
        </button>
      )}

      {/* Expanded Chat Drawer */}
      {isOpen && (
        <div className={styles.chatWindow}>
          {/* Header */}
          <div className={styles.chatHeader}>
            <div className={styles.chatTitleGroup}>
              <div className={styles.botAvatar}>
                <Bot size={18} />
              </div>
              <div>
                <div className={styles.chatTitle}>Megha Mitra AI</div>
                <div className={styles.chatStatus}>
                  <span className={styles.onlineDot} />
                  <span>Hybrid Ensemble Active</span>
                </div>
              </div>
            </div>

            <div className={styles.headerBtns}>
              <button
                className={styles.iconBtn}
                onClick={() => setIsOpen(false)}
                title="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Conversation History */}
          <div className={styles.messagesWrap}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`${styles.message} ${m.sender === "user" ? styles.userMsg : styles.botMsg}`}
              >
                {/* Formatted markdown-like content */}
                <div style={{ whiteSpace: "pre-wrap" }}>
                  {m.text.split("\n").map((line, i) => {
                    // Simple bold handling
                    const parts = line.split("**");
                    return (
                      <div key={i} style={{ marginBottom: line ? 3 : 6 }}>
                        {parts.map((p, pIdx) =>
                          pIdx % 2 === 1 ? <strong key={pIdx}>{p}</strong> : p
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Embedded 5-Day Visual Forecast Card */}
                {m.forecast && m.forecast.length > 0 && (
                  <div className={styles.chatForecastCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                        {m.district} · 5-Day Model Blend
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        Lead +1d to +5d
                      </span>
                    </div>

                    <div className={styles.forecastGridRow}>
                      {m.forecast.map((f) => (
                        <div key={f.lead} className={styles.miniDayCol}>
                          <span className={styles.miniDayName}>{f.day_name.slice(0, 3)}</span>
                          <span className={styles.miniDayIcon}>{f.icon}</span>
                          <span className={styles.miniDayRain}>{f.rain_mm}m</span>
                          <span className={styles.miniDayTemp}>{Math.round(f.tmax_c)}°</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className={`${styles.message} ${styles.botMsg}`}>
                <div className={styles.typingIndicator}>
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                  <span className={styles.typingDot} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestion Chips */}
          <div className={styles.chipsContainer}>
            {PROMPT_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                className={styles.chipBtn}
                onClick={() => {
                  const queryText = chip.replace(/^[^\w\s\u0c00-\u0c7f\u0900-\u097f]+/, "").trim();
                  handleSend(queryText);
                }}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            className={styles.inputForm}
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              className={styles.chatInput}
              placeholder="Ask about weather in Hyderabad, Vizag, Tirupati..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!input.trim() || loading}
              title="Send message"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
