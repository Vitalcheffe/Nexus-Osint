"use client";
/**
 * NEXUS Intelligence Panel v3
 * ─────────────────────────────────────────────────────────────
 * The unified command centre. Bloomberg Terminal × Mission Control.
 * Every signal source, every alert, every agent — one surface.
 *
 * Tabs: ALERTES · SIGNAUX · SOURCES · MARCHÉS · SWARM · RAPPORT · BOT
 */

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useStore } from "@/core/state/store";
import { dataBus } from "@/core/data/DataBus";
import type { NexusAlert, LiveSignal, EconomicIndicator, IntelReport } from "@/core/state/nexusSlice";
import type { AgentTask } from "@/nexus/types";
import TelegramIntelPanel from "./TelegramIntelPanel";
import { MultiSourcePanel } from "./MultiSourcePanel";
import { DarkWebPanel } from "./DarkWebPanel";
import { PropagationGraph } from "./PropagationGraph";

// ─── Design tokens ────────────────────────────────────────────

const C = {
  10: { fg: "#dc2626", bg: "rgba(220,38,38,0.10)",  label: "EXTINCTION",  glow: "rgba(220,38,38,0.30)"  },
  9:  { fg: "#ef4444", bg: "rgba(239,68,68,0.09)",  label: "CRITIQUE",    glow: "rgba(239,68,68,0.22)"  },
  8:  { fg: "#f97316", bg: "rgba(249,115,22,0.09)", label: "SÉVÈRE",      glow: "rgba(249,115,22,0.18)" },
  7:  { fg: "#f59e0b", bg: "rgba(245,158,11,0.08)", label: "ÉLEVÉ",       glow: "rgba(245,158,11,0.15)" },
  6:  { fg: "#eab308", bg: "rgba(234,179,8,0.07)",  label: "MODÉRÉ",      glow: "rgba(234,179,8,0.12)"  },
  5:  { fg: "#84cc16", bg: "rgba(132,204,22,0.06)", label: "SURVEILLANCE", glow: "transparent"           },
  4:  { fg: "#4ade80", bg: "rgba(74,222,128,0.05)", label: "FAIBLE",      glow: "transparent"           },
  3:  { fg: "#22d3ee", bg: "rgba(34,211,238,0.05)", label: "INFO",        glow: "transparent"           },
} as Record<number, { fg: string; bg: string; label: string; glow: string }>;

const lc = (n: number) => C[n] ?? C[4];

function rt(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  return `${Math.floor(s/3600)}h`;
}

// ─── Tiny sparkline ───────────────────────────────────────────

function Spark({ data, color, height = 24 }: { data: number[]; color: string; height?: number }) {
  if (!data?.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const w = 60, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * w} cy={h - ((data[data.length-1] - min) / range) * h} r="2" fill={color} />
    </svg>
  );
}

// ─── Live Ticker ──────────────────────────────────────────────

function LiveTicker() {
  const signals  = useStore(s => s.nexusLiveSignals);
  const paused   = useStore(s => s.nexusTickerPaused);
  const toggle   = useStore(s => s.toggleTicker);
  const tickerRef = useRef<HTMLDivElement>(null);
  const animRef   = useRef<number | null>(null);
  const posRef    = useRef(0);

  useEffect(() => {
    const el = tickerRef.current;
    if (!el || paused) { if (animRef.current) cancelAnimationFrame(animRef.current); return; }
    const totalW = el.scrollWidth / 2;
    const step = () => {
      posRef.current -= 0.6;
      if (Math.abs(posRef.current) >= totalW) posRef.current = 0;
      el.style.transform = `translateX(${posRef.current}px)`;
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [paused, signals]);

  const items = [...signals, ...signals]; // double for seamless loop

  return (
    <div style={{
      height: 26,
      background: "var(--bg-secondary)",
      borderBottom: "1px solid var(--border-subtle)",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      position: "relative",
      flexShrink: 0,
    }}>
      {/* Gradient masks */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 20, background: "linear-gradient(90deg, var(--bg-secondary), transparent)", zIndex: 2 }} />
      <div style={{ position: "absolute", right: 24, top: 0, bottom: 0, width: 20, background: "linear-gradient(-90deg, var(--bg-secondary), transparent)", zIndex: 2 }} />

      <div ref={tickerRef} style={{ display: "flex", alignItems: "center", whiteSpace: "nowrap", willChange: "transform" }}>
        {items.map((sig, i) => {
          const cfg = lc(sig.level);
          return (
            <span key={`${sig.id}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 24 }}>
              <span style={{ fontSize: 9, color: cfg.fg, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                [{sig.source}]
              </span>
              <span style={{ fontSize: 9, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                {sig.text.substring(0, 55)}{sig.text.length > 55 ? "…" : ""}
              </span>
              <span suppressHydrationWarning style={{ fontSize: 8, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginLeft: 2 }}>
                {rt(sig.timestamp)}
              </span>
              <span style={{ color: "var(--border-medium)", marginLeft: 4 }}>·</span>
            </span>
          );
        })}
      </div>

      {/* Pause button */}
      <button
        onClick={toggle}
        style={{
          position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
          background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)",
          borderRadius: 3, padding: "1px 4px",
          fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
          cursor: "pointer", zIndex: 3, lineHeight: 1.4,
        }}
      >
        {paused ? "▶" : "⏸"}
      </button>
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────

function StatusBar() {
  const alerts   = useStore(s => s.nexusAlerts);
  const signals  = useStore(s => s.nexusLiveSignals);
  const tasks    = useStore(s => s.nexusAgentTasks);
  const critical = alerts.filter(a => a.level >= 7 && !a.acknowledged).length;
  const running  = tasks.filter(t => t.status === "running").length;

  const stats = [
    { v: alerts.filter(a => !a.acknowledged).length, l: "ALERTES",  c: critical>0 ? "#ef4444" : "#4ade80", blink: critical>0 },
    { v: critical,                                    l: "CRITIQUE", c: "#ef4444",                           blink: critical>0 },
    { v: signals.length,                              l: "SIGNAUX",  c: "var(--accent-cyan)",                blink: false },
    { v: running > 0 ? `${running}▶` : "0",          l: "AGENTS",   c: running>0 ? "#f59e0b" : "#4ade80",  blink: running>0 },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 1, background: "var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
      {stats.map(s => (
        <div key={s.l} style={{ background: "var(--bg-secondary)", padding: "6px 4px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: s.c, lineHeight: 1, animation: s.blink ? "nexusPulse 1.2s ease-in-out infinite" : "none" }}>{s.v}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginTop: 2, letterSpacing: "0.08em" }}>{s.l}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────

type Tab = "alerts"|"signals"|"sources"|"markets"|"swarm"|"report"|"telegram"|"intel"|"live"|"timeline"|"matrix"|"darkweb";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "alerts",   label: "ALERTS"  },
  { id: "signals",  label: "SIGNALS" },
  { id: "live",     label: "LIVE"    },
  { id: "markets",  label: "MARKETS" },
  { id: "swarm",    label: "SWARM"   },
  { id: "report",   label: "REPORT"  },
  { id: "sources",  label: "SOURCES" },
  { id: "telegram", label: "BOT"     },
  { id: "intel",    label: "INTEL"   },
  { id: "timeline", label: "TIMELINE"},
  { id: "matrix",   label: "MATRIX"  },
  { id: "darkweb",  label: "DARK"    },
];

function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  const alerts  = useStore(s => s.nexusAlerts);
  const tasks   = useStore(s => s.nexusAgentTasks);
  const reports = useStore(s => s.nexusReports);
  const running = tasks.filter(t => t.status === "running").length;

  const badge: Partial<Record<Tab, string|number>> = {
    alerts:   alerts.filter(a => !a.acknowledged).length || "—",
    signals:  useStore.getState().nexusLiveSignals.length || "—",
    live:     "LIVE",
    sources:  "35+",
    markets:  "6",
    swarm:    running > 0 ? `${running}` : tasks.length || "—",
    report:   reports.length || "—",
    telegram: "92",
    intel:    "92",
    timeline: "—",
    matrix:   "9x11",
    darkweb:  "TOR",
  };

  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", flexShrink: 0, overflowX: "auto" }}>
      {TABS.map(tab => {
        const isA = tab.id === active;
        return (
          <button key={tab.id} onClick={() => onSelect(tab.id)} style={{
            flexShrink: 0, padding: "6px 6px 5px",
            background: isA ? "var(--bg-primary)" : "transparent",
            borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: isA ? "2px solid var(--accent-cyan)" : "2px solid transparent",
            borderRadius: 0, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5,
            transition: "all 0.12s ease", minWidth: 42,
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, letterSpacing: "0.07em", color: isA ? "var(--accent-cyan)" : "var(--text-muted)", fontWeight: isA ? 700 : 400 }}>{tab.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: isA ? "var(--accent-cyan)" : "var(--text-secondary)" }}>{badge[tab.id] ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── ALERTS TAB ───────────────────────────────────────────────

function AlertCard({ alert, selected, onSelect }: { alert: NexusAlert; selected: boolean; onSelect: () => void; key?: React.Key }) {
  const ack    = useStore(s => s.acknowledgeAlert);
  const gen    = useStore(s => s.generateReport);
  const setTab = useStore(s => s.setNexusActiveTab);
  const cfg    = lc(alert.level);

  const fly = () => dataBus.emit("cameraGoTo", { lat: alert.lat, lon: alert.lng, alt: 400000, distance: 700000 });

  return (
    <div onClick={onSelect} style={{
      background: selected ? cfg.bg : "transparent",
      borderTop: `1px solid ${selected ? cfg.fg+"50" : "var(--border-subtle)"}`,
      borderRight: `1px solid ${selected ? cfg.fg+"50" : "var(--border-subtle)"}`,
      borderBottom: `1px solid ${selected ? cfg.fg+"50" : "var(--border-subtle)"}`,
      borderLeft: `3px solid ${cfg.fg}`,
      borderRadius: "var(--radius-md)", padding: "9px 10px", marginBottom: 5, cursor: "pointer",
      boxShadow: selected && alert.level >= 8 ? `0 0 16px ${cfg.glow}` : "none",
      opacity: alert.acknowledged && !selected ? 0.45 : 1,
      transition: "all 0.12s ease",
    }}>
      {/* Row 1 — level · zone · confidence · time */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 15, color: cfg.fg, background: cfg.bg, border: `1px solid ${cfg.fg}44`, borderRadius: 4, padding: "0 6px", flexShrink: 0 }}>{alert.level}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 11.5, color: "var(--text-primary)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{alert.zone}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: cfg.fg, letterSpacing: "0.05em" }}>{cfg.label} · {alert.type.replace("_"," ")}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: alert.confidence >= 90 ? "#ef4444" : alert.confidence >= 75 ? "#f59e0b" : "var(--accent-cyan)" }}>{alert.confidence}%</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }} suppressHydrationWarning>{rt(alert.timestamp)}</div>
        </div>
      </div>

      {/* Signal dots (collapsed) */}
      {!selected && (
        <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 0 }}>
          {alert.signals.slice(0, 8).map((_, i) => (
            <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: cfg.fg, opacity: 0.7 }} />
          ))}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginLeft: 3 }}>{alert.signals.length} sig</span>
          {alert.swarmActive && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--accent-amber)", padding: "0 4px", borderRadius: 2, border: "1px solid rgba(217,119,6,0.2)", marginLeft: "auto" }}>SWARM</span>
          )}
        </div>
      )}

      {/* Expanded */}
      {selected && (
        <>
          {/* AI Summary */}
          <div style={{ padding: "6px 8px", background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.12)", borderRadius: 5, marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", lineHeight: 1.55 }}>
            AI ANALYSIS: {alert.aiSummary}
          </div>

          {/* Signals list */}
          <div style={{ marginBottom: 8 }}>
            {alert.signals.map((sig, i) => (
              <div key={i} style={{ display: "flex", gap: 6, padding: "3px 0", borderBottom: i < alert.signals.length-1 ? "1px solid var(--border-subtle)" : "none" }}>
                <span style={{ fontSize: 10, flexShrink: 0, lineHeight: 1.5 }}>{sig.icon}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", lineHeight: 1.5 }}>{sig.text}</span>
              </div>
            ))}
          </div>

          {/* 6D Correlation bars */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 8px", marginBottom: 8 }}>
            {([
              ["GÉO",      alert.correlation.spatial],
              ["TEMPS",    alert.correlation.temporal],
              ["NLP",      alert.correlation.semantic],
              ["COMPORT.", alert.correlation.behavioral],
              ["HIST.",    alert.correlation.historical],
              ["DIV.",     alert.correlation.sourceDiv],
            ] as [string, number][]).map(([k, v]) => (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.05em" }}>{k}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: cfg.fg, fontWeight: 700 }}>{Math.round(v*100)}%</span>
                </div>
                <div style={{ height: 3, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${v*100}%`, height: "100%", background: cfg.fg, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Historical matches */}
          {alert.historicalMatches.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {alert.historicalMatches.map((m, i) => (
                <div key={i} style={{ padding: "3px 7px", background: "var(--bg-tertiary)", borderRadius: 4, marginBottom: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)" }}>TIME {m.name} ({m.date})</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent-cyan)", fontWeight: 700 }}>{Math.round(m.similarity*100)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={e => { e.stopPropagation(); fly(); }} style={actionBtn("cyan")}>GLOBE</button>
            {!alert.acknowledged && (
              <button onClick={e => { e.stopPropagation(); ack(alert.id); }} style={actionBtn("green")}>✓ ACK</button>
            )}
            <button onClick={e => { e.stopPropagation(); gen(alert.id); setTab("report"); }} style={actionBtn("amber")}>RPT RAPPORT</button>
            {alert.swarmActive && (
              <button onClick={e => { e.stopPropagation(); setTab("swarm"); }} style={actionBtn("orange")}>AGT SWARM</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function actionBtn(col: "cyan"|"green"|"amber"|"orange") {
  const colors = { cyan: ["rgba(34,211,238,0.08)","rgba(34,211,238,0.2)","var(--accent-cyan)"], green: ["rgba(74,222,128,0.08)","rgba(74,222,128,0.2)","#4ade80"], amber: ["rgba(245,158,11,0.08)","rgba(245,158,11,0.2)","#f59e0b"], orange: ["rgba(249,115,22,0.08)","rgba(249,115,22,0.2)","#f97316"] };
  const [bg, border, color] = colors[col];
  return { flex: 1, padding: "4px 0", background: bg, border: `1px solid ${border}`, borderRadius: 4, color, fontFamily: "var(--font-mono)", fontSize: 8, cursor: "pointer", letterSpacing: "0.04em" } as React.CSSProperties;
}

function AlertsTab() {
  const alerts         = useStore(s => s.nexusAlerts);
  const selectedId     = useStore(s => s.nexusSelectedAlertId);
  const setSelected    = useStore(s => s.setNexusSelectedAlert);
  const silencedUntil  = useStore(s => s.nexusSilencedUntil);
  const silenceNotifs  = useStore(s => s.silenceNotifs);
  const isSilenced     = silencedUntil > Date.now();
  const silenceLabel   = isSilenced
    ? new Date(silencedUntil).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const sorted = [...alerts].sort((a,b) => (a.acknowledged !== b.acknowledged ? (a.acknowledged?1:-1) : b.level-a.level));
  return (
    <div style={{ padding: "8px 10px" }}>
      {/* Silence banner */}
      {isSilenced && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 8px", marginBottom: 8,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
          borderRadius: "var(--radius-md)",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#f59e0b" }}>
            🔕 SILENCÉ jusqu'à {silenceLabel}
          </span>
          <button
            onClick={() => silenceNotifs(0)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 7.5, color: "#f59e0b",
            }}
          >RÉACTIVER</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ padding: "24px 8px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>STANDBY — NO ALERTS</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.7, opacity: 0.6 }}>
            Alerts are generated by the correlation engine when 3+ independent<br/>
            sources converge on the same zone within a 15-min window.<br/>
            Configure API keys to start receiving live signals.
          </div>
        </div>
      ) : sorted.map(a => (
        <AlertCard key={a.id} alert={a as NexusAlert} selected={a.id === selectedId} onSelect={() => setSelected(a.id === selectedId ? null : a.id)} />
      ))}
    </div>
  );
}

// ─── SIGNALS TAB ──────────────────────────────────────────────

function SignalsTab() {
  const signals = useStore(s => s.nexusLiveSignals);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ padding: "8px 10px" }}>
      <div suppressHydrationWarning style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>
        LIVE SIGNAL FEED — {signals.length} SIGNALS
      </div>
      {signals.length === 0 ? (
        <div style={{ padding: "20px 8px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>AWAITING SIGNALS</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.7, opacity: 0.6 }}>
            Live signals appear here as the engine ingests data<br/>from configured sources (ADS-B, AIS, GDELT, RSS, …).
          </div>
        </div>
      ) : signals.map(sig => {
        const cfg = lc(sig.level);
        return (
          <div key={sig.id} style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.fg, flexShrink: 0, marginTop: 3, boxShadow: `0 0 5px ${cfg.fg}66` }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: cfg.fg, fontWeight: 700 }}>[{sig.source}]</span>
                <span suppressHydrationWarning style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{rt(sig.timestamp)}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", lineHeight: 1.4 }}>{sig.icon} {sig.text}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)" }}>{sig.zone}</span>
                <span suppressHydrationWarning style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: cfg.fg }}>conf: {Math.round(sig.confidence*100)}%</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SOURCES TAB ──────────────────────────────────────────────

const SOURCE_LIST = [
  // PHYSICAL SENSORS — no API key required
  { id: "aviation",       name: "ADS-B OpenSky",         cat: "SENSOR",    env: null,                    note: "Public feed" },
  { id: "maritime",       name: "AIS Stream",             cat: "SENSOR",    env: "AISSTREAM_API_KEY",     note: "Free at aisstream.io" },
  { id: "satellite",      name: "NORAD TLE",              cat: "SENSOR",    env: null,                    note: "Public feed" },
  { id: "gpsjam",         name: "GPS Jamming (ADS-B)",    cat: "SENSOR",    env: null,                    note: "Derived from ADS-B" },
  { id: "notam",          name: "NOTAM Airspaces",        cat: "SENSOR",    env: null,                    note: "FAA/Eurocontrol public" },
  { id: "usgs",           name: "USGS Seismic",           cat: "SENSOR",    env: null,                    note: "Public feed" },
  { id: "nasa_firms",     name: "NASA FIRMS Fires",       cat: "SENSOR",    env: "NASA_FIRMS_MAP_KEY",    note: "Free at firms.modaps.eosdis.nasa.gov" },
  { id: "nightlights",    name: "NASA Black Marble VIIRS",cat: "SENSOR",    env: "SENTINEL_HUB_INSTANCE_ID", note: "ESA free tier" },
  // ABSENCE SIGNALS
  { id: "absence_ads_b",  name: "ADS-B Void Detection",  cat: "ABSENCE",   env: null,                    note: "Derived from ADS-B" },
  { id: "absence_ais",    name: "Dark Ship (AIS off)",    cat: "ABSENCE",   env: "AISSTREAM_API_KEY",     note: "Requires AIS" },
  { id: "private_jets",   name: "Private Jets (adsb.fi)", cat: "ABSENCE",   env: null,                    note: "Public feed, known ICAO24 only" },
  // SOCIAL
  { id: "gdelt",          name: "GDELT Events 2.0",       cat: "SOCIAL",    env: null,                    note: "Public API" },
  { id: "rss_wire",       name: "RSS Wire (AP/Reuters…)", cat: "SOCIAL",    env: null,                    note: "Public feeds" },
  { id: "bluesky",        name: "Bluesky OSINT",          cat: "SOCIAL",    env: null,                    note: "Public AppView API" },
  { id: "mastodon",       name: "Mastodon (4 instances)", cat: "SOCIAL",    env: null,                    note: "Public timelines" },
  { id: "social_telegram",name: "Telegram (92 channels)", cat: "SOCIAL",    env: "TELEGRAM_API_ID",       note: "Requires Telethon session" },
  // ECONOMIC
  { id: "economic",       name: "Yahoo Finance / AV",     cat: "ECONOMIC",  env: null,                    note: "Optional: ALPHA_VANTAGE_API_KEY" },
  // CONFLICT GROUND TRUTH
  { id: "acled",          name: "ACLED Conflict Data",    cat: "INTEL",     env: "ACLED_API_KEY",         note: "Free at acleddata.com" },
  { id: "ransomwatch",    name: "Ransomwatch Feed",       cat: "CYBER",     env: null,                    note: "Public GitHub JSON" },
  { id: "wikipedia",      name: "Wikipedia Edit Surge",   cat: "INTEL",     env: null,                    note: "Public API" },
  // INTERNET MONITORING
  { id: "netblocks",      name: "Internet Shutdown",      cat: "INTEL",     env: "CLOUDFLARE_RADAR_TOKEN",note: "Free at Cloudflare" },
  // DARK WEB (requires Python collector)
  { id: "dark_web",       name: "Dark Web collector",     cat: "ADVANCED",  env: "— (Python script)",     note: "Run scripts/nexus_darkweb_collector.py" },
];

const CAT_C: Record<string, string> = {
  SENSOR: "#22d3ee", ABSENCE: "#f97316", SOCIAL: "#a78bfa",
  ECONOMIC: "#f59e0b", INTEL: "#4ade80", CYBER: "#ec4899", ADVANCED: "#94a3b8",
};

function SourcesTab() {
  const configured = SOURCE_LIST.filter(s => !s.env || s.env === "— (Python script)");
  const needsKey   = SOURCE_LIST.filter(s => s.env && s.env !== "— (Python script)");
  const cats       = [...new Set(SOURCE_LIST.map(s => s.cat))];

  return (
    <div style={{ padding: "8px 10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border-subtle)", borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
        {[
          { l: "NO KEY NEEDED", v: configured.length, c: "#4ade80" },
          { l: "API KEY REQ.",  v: needsKey.length,   c: "#f59e0b" },
        ].map(s => (
          <div key={s.l} style={{ background: "var(--bg-secondary)", padding: "6px 8px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16, color: s.c }}>{s.v}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {cats.map(cat => {
        const cc   = CAT_C[cat] || "#94a3b8";
        const srcs = SOURCE_LIST.filter(s => s.cat === cat);
        return (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, fontWeight: 700, color: cc, letterSpacing: "0.1em", marginBottom: 4, paddingBottom: 3, borderBottom: `1px solid ${cc}20` }}>
              ▸ {cat}
            </div>
            {srcs.map(src => (
              <div key={src.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "4px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-primary)" }}>{src.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", marginTop: 1 }}>{src.note}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 8 }}>
                  {src.env && src.env !== "— (Python script)" ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "#f59e0b", background: "rgba(245,158,11,0.08)", padding: "1px 4px", borderRadius: 2 }}>
                      {src.env}
                    </span>
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "#4ade80", background: "rgba(74,222,128,0.08)", padding: "1px 4px", borderRadius: 2 }}>
                      {src.env === "— (Python script)" ? "SCRIPT" : "FREE"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── MARKETS TAB ─────────────────────────────────────────────

interface LiveIndicator {
  id: string; name: string; symbol: string;
  value: number; changePercent: number;
  anomalyScore: number; signal: string;
  history?: number[]; geoZone: string;
}

function MarketsTab() {
  const [inds, setInds]     = useState<LiveIndicator[]>([]);
  const [status, setStatus] = useState<"loading"|"live"|"error"|"unavailable">("loading");
  const [source, setSource] = useState("");
  const [lastFetch, setLastFetch] = useState<Date|null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/economic");
      const data = await res.json();
      if (!data.indicators?.length) {
        setStatus("unavailable"); setSource(data.source ?? ""); setInds([]);
      } else {
        setInds(data.indicators); setStatus("live");
        setSource(data.source ?? ""); setLastFetch(new Date());
      }
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const mono = "var(--font-mono)";

  return (
    <div style={{ padding: "8px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
          MARKETS — CRISIS INDICATORS
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {status === "live" && <span style={{ fontFamily: mono, fontSize: 7, color: "#4ade80" }}>LIVE · {source}</span>}
          <button onClick={load} style={{ fontFamily: mono, fontSize: 7, padding: "2px 6px", background: "transparent", border: "1px solid var(--border-subtle)", color: "var(--text-muted)", cursor: "pointer", borderRadius: 2 }}>↺</button>
        </div>
      </div>

      {status === "loading" && (
        <div style={{ padding: "24px 0", textAlign: "center", fontFamily: mono, fontSize: 9, color: "var(--text-muted)" }}>Fetching Yahoo Finance…</div>
      )}

      {status === "error" && (
        <div style={{ padding: "10px 8px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 3 }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: "#ef4444" }}>FETCH ERROR</div>
          <div style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", marginTop: 3 }}>Yahoo Finance and Alpha Vantage both unreachable.</div>
        </div>
      )}

      {status === "unavailable" && (
        <div style={{ padding: "10px 8px", background: "rgba(107,114,128,0.06)", border: "1px solid var(--border-subtle)", borderRadius: 3 }}>
          <div style={{ fontFamily: mono, fontSize: 9, color: "var(--text-secondary)" }}>NO DATA</div>
          <div style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.6 }}>
            No market data returned. Optional: set ALPHA_VANTAGE_API_KEY for a more reliable feed (free at alphavantage.co).
          </div>
        </div>
      )}

      {status === "live" && inds.map(ind => {
        const isUp = ind.changePercent > 0;
        const ac   = ind.anomalyScore >= 0.80 ? "#ef4444" : ind.anomalyScore >= 0.60 ? "#f59e0b" : "#4ade80";
        return (
          <div key={ind.id} style={{ padding: "7px 8px", marginBottom: 6, background: "var(--bg-secondary)", borderLeft: `3px solid ${ac}`, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)" }}>{ind.name}</span>
                <span style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", marginLeft: 5 }}>{ind.symbol}</span>
                <div style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>→ {ind.geoZone}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 13, color: isUp ? "#4ade80" : "#ef4444" }}>
                  {isUp ? "+" : ""}{ind.changePercent.toFixed(2)}%
                </div>
                <div style={{ fontFamily: mono, fontSize: 9, color: "var(--text-muted)" }}>
                  {ind.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
            {ind.history && <Spark data={ind.history} color={ac} height={18} />}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: "var(--text-muted)", fontStyle: "italic" }}>{ind.signal}</div>
              <div style={{ fontFamily: mono, fontSize: 7, color: ac, fontWeight: 700 }}>ANOM {Math.round(ind.anomalyScore * 100)}%</div>
            </div>
          </div>
        );
      })}

      {status === "live" && lastFetch && (
        <div style={{ fontFamily: mono, fontSize: 7, color: "var(--text-muted)", marginTop: 6, textAlign: "right" }}>
          Updated {lastFetch.toLocaleTimeString()} · auto-refresh 60s
        </div>
      )}
    </div>
  );
}

// ─── SWARM TAB ────────────────────────────────────────────────

const TASK_META: Record<string, { icon: string; label: string; desc: string }> = {
  collect:   { icon: "COL", label: "COLLECT",   desc: "Cache archival before expiry" },
  archive:   { icon: "ARC", label: "ARCHIVE",   desc: "Immutable archive SHA-256" },
  translate: { icon: "TRL", label: "TRANSLATE", desc: "50 language translation" },
  geolocate: { icon: "GEO", label: "GEOLOCATE", desc: "Media geolocation OSINT" },
  report:    { icon: "RPT", label: "REPORT",    desc: "PDF report generation" },
};

const STATUS_C: Record<string, string> = {
  done: "#4ade80", running: "#f59e0b", pending: "#94a3b8", failed: "#ef4444",
};

function SwarmTab() {
  const tasks  = useStore(s => s.nexusAgentTasks);
  const alerts = useStore(s => s.nexusAlerts);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPct(p => (p + 3) % 100), 120);
    return () => clearInterval(t);
  }, []);

  const running = tasks.filter(t => t.status === "running").length;
  const done    = tasks.filter(t => t.status === "done").length;

  const swarmAlerts = alerts.filter(a => a.swarmActive);

  return (
    <div style={{ padding: "8px 10px" }}>
      {/* Swarm header */}
      <div style={{ padding: "8px 10px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--radius-md)", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>AGT AGENT SWARM</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: running > 0 ? "var(--accent-amber)" : "var(--text-secondary)" }}>{running > 0 ? `${running} ACTIVE` : "IDLE"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "var(--border-subtle)", borderRadius: 4, overflow: "hidden" }}>
          {[
            { l: "TÂCHES",    v: tasks.length,                       c: "var(--accent-cyan)" },
            { l: "ACTIVES",   v: running,                            c: "#f59e0b" },
            { l: "COMPLÈTES", v: done,                               c: "#4ade80" },
          ].map(s => (
            <div key={s.l} style={{ background: "var(--bg-secondary)", padding: "5px 4px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14, color: s.c }}>{s.v}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", letterSpacing: "0.06em" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Auto-trigger note */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", padding: "4px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 2, marginBottom: 10, lineHeight: 1.6 }}>
        Auto-trigger: correlation score ≥ 0.88 (level 8+){"\n"}
        Pipeline: collect → archive → translate → geolocate → report
      </div>

      {/* Tasks by event */}
      {swarmAlerts.map(alert => {
        const alertTasks = tasks.filter(t => t.eventId === alert.id);
        const cfg = lc(alert.level);
        return (
          <div key={alert.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 6px", background: cfg.bg, border: `1px solid ${cfg.fg}33`, borderRadius: 5 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: cfg.fg }}>{alert.level}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)" }}>{alert.zone}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: cfg.fg, marginLeft: "auto" }}>{alertTasks.filter(t=>t.status==="done").length}/{alertTasks.length} tasks</span>
            </div>
            {alertTasks.map(task => {
              const meta = TASK_META[task.type];
              const sc = STATUS_C[task.status];
              const isRunning = task.status === "running";
              return (
                <div key={task.id} style={{ marginBottom: 5, padding: "6px 8px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)", borderLeft: `2px solid ${sc}`, borderRadius: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isRunning ? 4 : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span>{meta.icon}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: sc }}>{meta.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{meta.desc}</span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: sc, fontWeight: 700 }}>{task.status.toUpperCase()}</span>
                  </div>
                  {isRunning && (
                    <div style={{ height: 3, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b", borderRadius: 2, transition: "width 0.12s linear" }} />
                    </div>
                  )}
                  {task.result && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "#4ade80", marginTop: 3, lineHeight: 1.4 }}>✓ {task.result}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {swarmAlerts.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
          Aucun swarm actif.{"\n"}Déclenché automatiquement sur alerte ≥ niveau 8.
        </div>
      )}
    </div>
  );
}

// ─── REPORT TAB ───────────────────────────────────────────────

function ReportTab() {
  const reports    = useStore(s => s.nexusReports);
  const alerts     = useStore(s => s.nexusAlerts);
  const generate   = useStore(s => s.generateReport);
  const [selected, setSelected] = useState<string|null>(null);

  const report = reports.find(r => r.id === selected) ?? reports[0];

  return (
    <div style={{ padding: "8px 10px" }}>
      {/* Generate buttons */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.06em" }}>GÉNÉRER UN RAPPORT</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {alerts.filter(a => !a.acknowledged || a.level >= 7).map(alert => {
            const cfg = lc(alert.level);
            const hasReport = !!alert.reportId;
            return (
              <button key={alert.id} onClick={() => { generate(alert.id); setSelected(alert.reportId ?? null); }} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                background: "var(--bg-secondary)",
                borderTop: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)",
                borderLeft: `2px solid ${cfg.fg}`, borderRadius: 4, cursor: "pointer",
                textAlign: "left", width: "100%",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: cfg.fg }}>{alert.level}</span>
                <span style={{ flex: 1, fontSize: 10, color: "var(--text-secondary)" }}>{alert.zone}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: hasReport ? "#4ade80" : "var(--accent-cyan)", background: hasReport ? "rgba(74,222,128,0.08)" : "rgba(34,211,238,0.08)", padding: "1px 5px", borderRadius: 3 }}>
                  {hasReport ? "✓ GÉNÉRÉ" : "GÉNÉRER →"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Report viewer */}
      {report && (
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 6, letterSpacing: "0.06em" }}>
            RAPPORT #{report.id.slice(-8).toUpperCase()} · {report.zone.toUpperCase()}
          </div>
          <div style={{ padding: "8px 10px", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)" }}>{report.zone} — {report.category}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: lc(report.level).fg }}>LV {report.level}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              {report.signalCount} signaux · confiance {report.confidence}%
            </div>
          </div>

          {report.sections.map((sec, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--accent-cyan)", letterSpacing: "0.08em", marginBottom: 4 }}>{i+1}. {sec.title.toUpperCase()}</div>
              <div style={{ padding: "6px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border-subtle)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {sec.content}
              </div>
            </div>
          ))}

          <button style={{ width: "100%", padding: "6px", background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 5, color: "var(--accent-cyan)", fontFamily: "var(--font-mono)", fontSize: 9, cursor: "pointer", letterSpacing: "0.04em" }}>
            ↓ EXPORTER PDF
          </button>
        </div>
      )}

      {reports.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
          Aucun rapport.{"\n"}Cliquer "GÉNÉRER" sur une alerte active.
        </div>
      )}
    </div>
  );
}

// ─── TELEGRAM TAB ─────────────────────────────────────────────

function TelegramTab() {
  const notifs        = useStore(s => s.nexusTelegramNotifs);
  const ackAlert      = useStore(s => s.acknowledgeAlert);
  const genReport     = useStore(s => s.generateReport);
  const silenceNotifs = useStore(s => s.silenceNotifs);
  const setTab        = useStore(s => s.setNexusActiveTab);

  // Real bot status — fetched from /api/telegram-monitor on mount
  const [botStatus, setBotStatus] = React.useState<{
    configured: boolean;
    channel: string | null;
    minLevel: number;
    notice: string;
  } | null>(null);

  React.useEffect(() => {
    fetch("/api/telegram-monitor")
      .then(r => r.json())
      .then((d: { configured: boolean; channel: string | null; minLevel: number; notice: string }) => setBotStatus(d))
      .catch(() => setBotStatus({ configured: false, channel: null, minLevel: 7, notice: "Impossible de joindre /api/telegram-monitor" }));
  }, []);

  const botColor = botStatus === null ? "#64748b"
    : notifs.length > 0  ? "#4ade80"
    : botStatus.configured ? "#f59e0b"
    : "#ef4444";

  const botLabel = botStatus === null ? "CHARGEMENT…"
    : notifs.length > 0  ? "ACTIF · DONNÉES REÇUES"
    : botStatus.configured ? "CONFIGURÉ · EN ATTENTE"
    : "NON CONFIGURÉ";

  return (
    <div style={{ padding: "8px 10px" }}>
      {/* Bot status card — state derived from real API response */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(0,136,204,0.07)", border: "1px solid rgba(0,136,204,0.18)", borderRadius: "var(--radius-md)", marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 2, background: "var(--bg-tertiary)", border: "1px solid var(--border-medium)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--accent-cyan)", flexShrink: 0 }}>TG</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)" }}>
            {botStatus?.channel ?? "@nexus_intel_bot"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: botColor, boxShadow: notifs.length > 0 ? `0 0 4px ${botColor}` : "none" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: botColor }}>{botLabel}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
            Seuil: lv ≥ {botStatus?.minLevel ?? 7}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent-cyan)", fontWeight: 700 }}>{notifs.length} envoyés</div>
        </div>
      </div>

      {/* Empty state */}
      {notifs.length === 0 && (
        <div style={{ padding: "16px 8px", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.08em" }}>AUCUNE NOTIFICATION</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.7, opacity: 0.6 }}>
            {botStatus?.configured === false
              ? botStatus.notice
              : "Le bot publie les alertes niveau ≥ " + (botStatus?.minLevel ?? 7) + " sur le canal Telegram."}
          </div>
        </div>
      )}

      {/* Notification cards */}
      {notifs.map(n => {
        const cfg = lc(n.level);
        return (
          <div key={n.id} style={{ marginBottom: 7, padding: "7px 10px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", borderTopLeftRadius: 3, borderLeft: `2px solid ${cfg.fg}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: cfg.fg, background: cfg.bg, padding: "1px 5px", borderRadius: 3 }}>LV{n.level}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-primary)" }}>{n.zone}</span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{n.time}</span>
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.55 }}>{n.summary}</p>
            <div style={{ display: "flex", gap: 4, marginTop: 5 }}>

              {/* Globe — fly camera to zone */}
              <button
                onClick={() => {
                  if (n.lat != null && n.lng != null) {
                    dataBus.emit("cameraGoTo", { lat: n.lat, lon: n.lng, alt: 400000, distance: 700000 });
                  } else {
                    setTab("alerts");
                  }
                }}
                style={{ padding: "2px 5px", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: 3, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 7.5, cursor: "pointer" }}
              >🗺️ Globe</button>

              {/* RPT Rapport — generate report + navigate to report tab */}
              <button
                onClick={() => { if (n.alertId) { genReport(n.alertId); setTab("report"); } }}
                disabled={!n.alertId}
                style={{ padding: "2px 5px", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: 3, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 7.5, cursor: n.alertId ? "pointer" : "default", opacity: n.alertId ? 1 : 0.4 }}
              >RPT Rapport</button>

              {/* OK — acknowledge linked alert */}
              <button
                onClick={() => { if (n.alertId) ackAlert(n.alertId); }}
                disabled={!n.alertId}
                style={{ padding: "2px 5px", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: 3, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 7.5, cursor: n.alertId ? "pointer" : "default", opacity: n.alertId ? 1 : 0.4 }}
              >✓ OK</button>

              {/* 2h — silence all notifications for 2 hours */}
              <button
                onClick={() => silenceNotifs(2 * 60 * 60 * 1000)}
                style={{ padding: "2px 5px", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)", borderRadius: 3, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 7.5, cursor: "pointer" }}
              >🔕 2h</button>
            </div>
          </div>
        );
      })}

      {/* Bot commands reference */}
      <div style={{ marginTop: 8, padding: "6px 8px", background: "var(--bg-tertiary)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <span style={{ color: "var(--accent-cyan)", fontWeight: 700 }}>Commandes bot :</span>{"\n"}
        /status · /alerte [id] · /zone [pays] · /détails · /silence 2h{"\n"}
        /priorité [zone] · /rapport · /historique · /sources
      </div>
    </div>
  );
}


// ─── TIMELINE TAB ─────────────────────────────────────────────

function TimelineTab() {
  const alerts  = useStore(s => s.nexusAlerts);
  const signals = useStore(s => s.nexusLiveSignals);
  const reports = useStore(s => s.nexusReports);

  interface TimelineEvent {
    id: string;
    ts: Date;
    type: "ALERT" | "SIGNAL" | "REPORT" | "ACK";
    level: number;
    zone: string;
    text: string;
    color: string;
  }

  const events: TimelineEvent[] = [
    ...alerts.map(a => ({
      id: `a_${a.id}`,
      ts: a.timestamp,
      type: "ALERT" as const,
      level: a.level,
      zone: a.zone,
      text: `${a.type} — ${a.signals.length} signaux — conf. ${a.confidence}%`,
      color: lc(a.level).fg,
    })),
    ...signals.slice(0, 40).map(s => ({
      id: `s_${s.id}`,
      ts: s.timestamp,
      type: "SIGNAL" as const,
      level: s.level,
      zone: s.zone,
      text: `[${s.source}] ${s.text.slice(0, 60)}`,
      color: lc(s.level).fg,
    })),
    ...reports.map(r => ({
      id: `r_${r.id}`,
      ts: new Date(r.generatedAt),
      type: "REPORT" as const,
      level: r.level,
      zone: r.zone,
      text: `Rapport généré — ${r.signalCount} signaux`,
      color: "#22d3ee",
    })),
  ].sort((a, b) => b.ts.getTime() - a.ts.getTime());

  const TYPE_ICONS: Record<TimelineEvent["type"], string> = {
    ALERT: "LIVE", SIGNAL: "◆", REPORT: "RPT", ACK: "✓",
  };

  return (
    <div style={{ padding: "8px 10px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.06em" }}>
        CHRONOLOGIE — {events.length} ÉVÉNEMENTS · {alerts.filter(a => !a.acknowledged).length} ACTIFS
      </div>

      {events.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>
          Aucun événement enregistré
        </div>
      )}

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 16, top: 0, bottom: 0, width: 1, background: "var(--border-subtle)" }} />

        {events.slice(0, 80).map((ev, i) => (
          <div key={ev.id} style={{ display: "flex", gap: 10, marginBottom: 8, paddingLeft: 4 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: `${ev.color}18`,
                border: `1.5px solid ${ev.color}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, zIndex: 1, position: "relative",
              }}>
                {TYPE_ICONS[ev.type]}
              </div>
            </div>
            <div style={{ flex: 1, paddingTop: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: ev.color, fontWeight: 700, background: `${ev.color}18`, padding: "1px 4px", borderRadius: 2 }}>{ev.type}</span>
                  {ev.type === "ALERT" && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: ev.color }}>LV{ev.level}</span>
                  )}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)" }}>{ev.zone}</span>
                </div>
                <span suppressHydrationWarning style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)" }}>{rt(ev.ts)}</span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", lineHeight: 1.4 }}>{ev.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MATRIX TAB ───────────────────────────────────────────────

function MatrixTab() {
  const alerts = useStore(s => s.nexusAlerts);
  const selId  = useStore(s => s.nexusSelectedAlertId);
  const setSelected = useStore(s => s.setNexusSelectedAlert);
  const [view, setView] = useState<"matrix" | "propagation">("matrix");

  const ZONES = ["Tel Aviv", "Ukraine", "Mer Rouge", "Taiwan", "Sahel", "Moscou"];

  const SOURCES_MATRIX = [
    { id: "aviation",    label: "ADS-B",   color: "#3b82f6" },
    { id: "maritime",    label: "AIS",     color: "#06b6d4" },
    { id: "gpsjam",      label: "GPSJ",    color: "#f97316" },
    { id: "gdelt",       label: "GDELT",   color: "#10b981" },
    { id: "bluesky",     label: "BSKY",    color: "#60a5fa" },
    { id: "mastodon",    label: "MASTO",   color: "#a78bfa" },
    { id: "rss_wire",    label: "WIRE",    color: "#4ade80" },
    { id: "ransomwatch", label: "RANSOM",  color: "#dc2626" },
    { id: "satellite",   label: "SAR",     color: "#8b5cf6" },
  ];

  function stableVal(seed: string): number {
    let h = 5381;
    for (let i = 0; i < seed.length; i++) h = (h * 33 ^ seed.charCodeAt(i)) >>> 0;
    return (h % 1000) / 1000;
  }

  function getCellValue(zone: string, sourceId: string): number {
    const alert = alerts.find(a => a.zone.toLowerCase().includes(zone.toLowerCase().split(" ")[0]));
    if (!alert) return 0;
    const sig = alert.signals.find(s => s.source === sourceId);
    const v = stableVal(zone + sourceId + alert.level);
    if (sig) return 0.85 + v * 0.14;
    if (alert.level >= 7) return 0.3 + v * 0.3;
    return v * 0.2;
  }

  function heatColor(v: number): string {
    if (v <= 0)   return "#070d1d";
    if (v < 0.2)  return "#0c1a3a";
    if (v < 0.40) return "#1a2e05";
    if (v < 0.60) return "#422006";
    if (v < 0.75) return "#431407";
    if (v < 0.88) return "#450000";
    return "#3f0000";
  }

  function textColor(v: number): string {
    if (v <= 0)   return "#1e3a5f";
    if (v < 0.30) return "#334155";
    if (v < 0.60) return "#84cc16";
    if (v < 0.80) return "#f59e0b";
    return "#ef4444";
  }

  const matrix = ZONES.map(z => ({
    zone: z,
    values: SOURCES_MATRIX.map(s => ({ source: s, value: getCellValue(z, s.id) })),
    maxSignal: Math.max(...SOURCES_MATRIX.map(s => getCellValue(z, s.id))),
  }));

  return (
    <div style={{ padding: "8px 6px" }}>
      {/* View switcher */}
      <div style={{ display: "flex", gap: 1, marginBottom: 8 }}>
        {(["matrix", "propagation"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 8,
              padding: "3px 8px", border: "1px solid",
              borderColor: view === v ? "var(--accent-cyan)" : "var(--border-subtle)",
              background: view === v ? "rgba(34,211,238,0.08)" : "transparent",
              color: view === v ? "var(--accent-cyan)" : "var(--text-muted)",
              cursor: "pointer", borderRadius: 2, letterSpacing: "0.06em",
            }}
          >
            {v === "matrix" ? "HEATMAP" : "PROPAGATION"}
          </button>
        ))}
      </div>

      {view === "matrix" && (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginBottom: 8, letterSpacing: "0.06em" }}>
            ZONE × SOURCE ACTIVITY
          </div>

          <div style={{ minWidth: 280, overflowX: "auto" }}>
            <div style={{ display: "flex", marginBottom: 3, paddingLeft: 64 }}>
              {SOURCES_MATRIX.map(s => (
                <div key={s.id} style={{ width: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 6.5, color: s.color, fontWeight: 700, flexShrink: 0 }}>
                  {s.label.slice(0, 4)}
                </div>
              ))}
            </div>

            {matrix.map(row => {
              const rowAlert = alerts.find(a => a.zone.toLowerCase().includes(row.zone.toLowerCase().split(" ")[0]));
              const level = rowAlert?.level ?? 0;
              const levelCfg = level >= 3 ? lc(level) : null;
              return (
                <div
                  key={row.zone}
                  style={{ display: "flex", alignItems: "center", marginBottom: 2, cursor: "pointer" }}
                  onClick={() => { if (rowAlert) { setSelected(rowAlert.id); setView("propagation"); } }}
                >
                  <div style={{
                    width: 60, flexShrink: 0, paddingRight: 4,
                    fontFamily: "var(--font-mono)", fontSize: 7.5,
                    color: levelCfg?.fg ?? "var(--text-muted)",
                    fontWeight: level >= 6 ? 700 : 400,
                    textAlign: "right", whiteSpace: "nowrap", overflow: "hidden",
                  }}>
                    {row.zone.length > 8 ? row.zone.slice(0, 8) : row.zone}
                  </div>
                  {row.values.map(cell => (
                    <div key={cell.source.id} style={{
                      width: 24, height: 18, flexShrink: 0,
                      background: heatColor(cell.value),
                      border: "1px solid #0a0f1e",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 1,
                    }}>
                      {cell.value > 0.05 && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, color: textColor(cell.value), fontWeight: 700 }}>
                          {Math.round(cell.value * 100)}
                        </span>
                      )}
                    </div>
                  ))}
                  <div style={{ paddingLeft: 4, fontFamily: "var(--font-mono)", fontSize: 7.5, color: levelCfg?.fg ?? "var(--text-muted)", fontWeight: level >= 6 ? 700 : 400 }}>
                    {level >= 3 ? `L${level}` : ""}
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)" }}>
              Click a zone row to view propagation graph
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {(([[0.10, "#334155", "0-20%"], [0.40, "#84cc16", "20-60%"], [0.75, "#f59e0b", "60-80%"], [0.92, "#ef4444", "80-100%"]] as [number, string, string][])).map(([v, color, label]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <div style={{ width: 8, height: 8, background: heatColor(v), border: "1px solid #1e3a5f" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: color as string }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === "propagation" && (
        <>
          {/* Alert selector */}
          <div style={{ marginBottom: 6 }}>
            <select
              value={selId ?? ""}
              onChange={e => setSelected(e.target.value)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 8, width: "100%",
                background: "var(--bg-secondary)", border: "1px solid var(--border-medium)",
                color: "var(--text-primary)", padding: "3px 6px", borderRadius: 2,
              }}
            >
              {alerts.map(a => (
                <option key={a.id} value={a.id}>
                  LV{a.level} — {a.zone} — {a.signals.length} signals
                </option>
              ))}
            </select>
          </div>
          <PropagationGraph />
        </>
      )}
    </div>
  );
}

// ─── TELEGRAM INTEL FULL TAB ──────────────────────────────────

function TelegramIntelFullTab() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <TelegramIntelPanel
        onFlyToZone={(lat, lng, name) => {
          if (typeof window !== "undefined" && (window as any).__nexusFlyTo) {
            (window as any).__nexusFlyTo(lat, lng, name);
          }
        }}
      />
    </div>
  );
}

// ─── MAIN PANEL ───────────────────────────────────────────────

export function NexusPanel() {
  const open      = useStore(s => s.nexusPanelOpen);
  const activeTab = useStore(s => s.nexusActiveTab);
  const setTab    = useStore(s => s.setNexusActiveTab);
  const toggle    = useStore(s => s.toggleNexusPanel);
  const alerts    = useStore(s => s.nexusAlerts);
  const setSelected = useStore(s => s.setNexusSelectedAlert);
  const critical  = alerts.filter(a => a.level >= 7 && !a.acknowledged).length;
  const tasks     = useStore(s => s.nexusAgentTasks);
  const running   = tasks.filter(t => t.status === "running").length;

  const TAB_KEYS: Record<string, Tab> = {
    "1": "alerts", "2": "signals", "3": "live", "4": "markets",
    "5": "swarm", "6": "report", "7": "sources", "8": "telegram",
    "9": "intel", "0": "timeline", "-": "matrix",
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;

      if (e.key === "Escape" || e.key === "Esc") {
        setSelected(null);
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setTab("live");
        return;
      }
      if (TAB_KEYS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTab(TAB_KEYS[e.key]);
        return;
      }
      if (e.key === "g" || e.key === "G") {
        const sel = useStore.getState().nexusSelectedAlertId;
        const alert = useStore.getState().nexusAlerts.find(a => a.id === sel);
        if (alert && typeof window !== "undefined" && (window as any).__nexusFlyTo) {
          (window as any).__nexusFlyTo(alert.lat, alert.lng, alert.zone);
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const sel = useStore.getState().nexusSelectedAlertId;
        const sorted = [...alerts].sort((a, b) => b.level - a.level);
        const idx = sorted.findIndex(a => a.id === sel);
        const next = e.key === "ArrowDown"
          ? sorted[Math.min(idx + 1, sorted.length - 1)]
          : sorted[Math.max(idx - 1, 0)];
        if (next) setSelected(next.id);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [alerts, setTab, setSelected]);

  return (
    <div style={{
      position: "fixed", top: 80, bottom: 140,
      right: "var(--space-lg)", width: 330,
      display: "flex", flexDirection: "column",
      background: "var(--bg-primary)",
      border: `1px solid ${critical > 0 ? "rgba(239,68,68,0.25)" : "var(--border-subtle)"}`,
      borderRadius: "var(--radius-lg)", overflow: "hidden", zIndex: 40,
      transition: "transform 0.25s var(--ease-smooth), opacity 0.25s ease",
      transform: open ? "translateX(0)" : "translateX(350px)",
      opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
      boxShadow: critical > 0 ? "0 0 40px rgba(239,68,68,0.15), 0 0 80px rgba(0,0,0,0.6)" : "0 0 40px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{ padding: "7px 12px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Critical indicator — only shown if active alerts */}
          {critical > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent-red)", animation: "nexusPulse 1.4s ease-in-out infinite", flexShrink: 0 }} />}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 11, color: "var(--text-primary)", letterSpacing: "0.14em" }}>NEXUS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {running > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent-amber)", padding: "2px 5px", borderRadius: 2, border: "1px solid rgba(217,119,6,0.2)" }}>{running} AGENT{running > 1 ? "S" : ""}</span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: critical > 0 ? "var(--accent-red)" : "var(--text-secondary)", padding: "2px 6px", borderRadius: 2, border: `1px solid ${critical > 0 ? "rgba(220,38,38,0.25)" : "var(--border-subtle)"}`, fontWeight: critical > 0 ? 600 : 400 }}>
            {critical > 0 ? `${critical} CRITICAL` : "NOMINAL"}
          </span>
        </div>
      </div>

      {/* Live ticker */}
      <LiveTicker />

      {/* Status bar */}
      <StatusBar />

      {/* Tab bar */}
      <TabBar active={activeTab} onSelect={setTab} />

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {activeTab === "alerts"   && <AlertsTab />}
        {activeTab === "signals"  && <SignalsTab />}
        {activeTab === "live"     && <MultiSourcePanel />}
        {activeTab === "sources"  && <SourcesTab />}
        {activeTab === "markets"  && <MarketsTab />}
        {activeTab === "swarm"    && <SwarmTab />}
        {activeTab === "report"   && <ReportTab />}
        {activeTab === "telegram" && <TelegramTab />}
        {activeTab === "intel"    && <TelegramIntelFullTab />}
        {activeTab === "timeline" && <TimelineTab />}
        {activeTab === "matrix"   && <MatrixTab />}
        {activeTab === "darkweb"  && <DarkWebPanel />}
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 10px", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--text-muted)" }}>92 CANAUX TG · 35+ SOURCES · MIT/HARVARD/ETH/PRIO</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: 3 }}>
          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 3px #4ade80" }} />ENGINE LIVE
        </span>
      </div>
    </div>
  );
}
