"use client";

import React, { useEffect, useRef, useState } from "react";
import { NEXUS_SOURCES, type DataSourceConfig } from "@/nexus/data-sources";

interface LiveSignal {
  id: string;
  source: string;
  sourceName: string;
  category: string;
  lat: number;
  lng: number;
  country?: string;
  zone?: string;
  confidence: number;
  title: string;
  body: string;
  tags: string[];
  timestamp: string;
  isAnomaly?: boolean;
}

interface SourceStatus {
  id: string;
  // LIVE    = actively receiving signals from SSE
  // ACTIVE  = no API key needed, public endpoint, waiting for first signal
  // PENDING = API key required, not yet receiving
  // OFFLINE = unreachable / key configured but no response
  status: "LIVE" | "ACTIVE" | "PENDING" | "OFFLINE";
  signalsLast5min: number;
  lastSignal?: string;
  category: string;
}

const CAT: Record<string, { color: string; icon: string; short: string }> = {
  AVIATION:     { color: "#3b82f6", icon: "✈", short: "AIR" },
  MARITIME:     { color: "#06b6d4", icon: "⚓", short: "SEA" },
  SATELLITE:    { color: "#8b5cf6", icon: "◉", short: "SAT" },
  SOCIAL:       { color: "#f59e0b", icon: "◈", short: "SOC" },
  GROUND_TRUTH: { color: "#10b981", icon: "◆", short: "GND" },
  FINANCIAL:    { color: "#84cc16", icon: "◈", short: "FIN" },
  GEOPHYSICAL:  { color: "#f97316", icon: "◉", short: "GEO" },
  ELECTRONIC:   { color: "#ef4444", icon: "◈", short: "EW" },
  CYBER:        { color: "#a855f7", icon: "◆", short: "CYB" },
  VISUAL:       { color: "#22d3ee", icon: "◈", short: "VIS" },
  HUMAN:        { color: "#ec4899", icon: "◉", short: "HUM" },
  ABSENCE:      { color: "#64748b", icon: "◈", short: "ABS" },
};

type Tab = "FLUX" | "SOURCES" | "CATEGORIES" | "SCIENCE";
type CatFilter = "ALL" | keyof typeof CAT;

function age(ts: string): string {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 2, background: "#1a2744", borderRadius: 2 }}>
        <div style={{ width: `${Math.round(v * 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 8, color, fontFamily: "JetBrains Mono,monospace", minWidth: 22 }}>{Math.round(v * 100)}%</span>
    </div>
  );
}

function SignalRow({ sig }: { sig: LiveSignal; key?: unknown }) {
  const c = CAT[sig.category] ?? CAT.GROUND_TRUTH;
  return (
    <div style={{
      background: sig.isAnomaly ? "#1a0a0a" : "#070d1d",
      borderLeft: `3px solid ${sig.isAnomaly ? "#ef4444" : c.color}`,
      borderRadius: 3,
      padding: "6px 8px",
      marginBottom: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 8, color: c.color, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>{sig.sourceName}</span>
          {sig.zone && <span style={{ fontSize: 8, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{sig.zone}</span>}
          {sig.isAnomaly && (
            <span style={{ fontSize: 7, background: "#3a0000", color: "#f87171", padding: "1px 3px", borderRadius: 2, fontFamily: "JetBrains Mono,monospace" }}>ANOMALIE</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 8, color: "#22d3ee", fontFamily: "JetBrains Mono,monospace" }}>{Math.round(sig.confidence * 100)}%</span>
          <span style={{ fontSize: 8, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>{age(sig.timestamp)}</span>
        </div>
      </div>
      <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.4 }}>{sig.title.replace(/^\[.*?\]\s*/, "")}</div>
      {sig.body && sig.body !== sig.title && (
        <div style={{ fontSize: 8, color: "#475569", marginTop: 2, lineHeight: 1.3 }}>
          {sig.body.slice(0, 110)}{sig.body.length > 110 ? "…" : ""}
        </div>
      )}
      {sig.tags?.length > 0 && (
        <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" as const }}>
          {sig.tags.slice(0, 4).map(t => (
            <span key={t} style={{ fontSize: 7, padding: "1px 3px", borderRadius: 2, background: "#0f172a", color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ src, status, onSelect }: { src: DataSourceConfig; status?: SourceStatus; onSelect: () => void; key?: string }) {
  const c = CAT[src.category] ?? { color: "#64748b", icon: "●", short: "???" };
  const st = status?.status ?? (src.free && !src.envVar ? "ACTIVE" : "PENDING");
  const stColor = st === "LIVE" ? "#4ade80" : st === "ACTIVE" ? "#22d3ee" : st === "PENDING" ? "#f59e0b" : "#ef4444";
  return (
    <div
      onClick={onSelect}
      style={{
        background: "#070d1d",
        borderLeft: `3px solid ${c.color}`,
        borderRadius: 3,
        padding: "7px 9px",
        marginBottom: 3,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 8, color: c.color, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>{c.short}</span>
          <span style={{ fontSize: 9, color: "#e2e8f0", fontFamily: "JetBrains Mono,monospace", fontWeight: 600 }}>{src.name}</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {st === "LIVE" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />}
          <span style={{ fontSize: 8, color: stColor, fontFamily: "JetBrains Mono,monospace" }}>{st}</span>
          <span style={{ fontSize: 8, color: "#334155", fontFamily: "JetBrains Mono,monospace" }}>T{src.tier}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 8, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{status?.signalsLast5min ?? 0} sig/5min</span>
        <Bar v={src.signalStrength} color={c.color} />
      </div>
    </div>
  );
}

function SourceDetail({ src, onClose }: { src: DataSourceConfig; onClose: () => void }) {
  const c = CAT[src.category] ?? { color: "#64748b", icon: "●", short: "???" };
  return (
    <div style={{
      position: "absolute" as const, bottom: 0, left: 0, right: 0,
      background: "#060d1f",
      border: "1px solid #22d3ee33",
      borderRadius: "8px 8px 0 0",
      padding: 12,
      zIndex: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: c.color, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>{src.name}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 8, lineHeight: 1.5 }}>{src.description}</div>
      <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
        {([["TIER", `T${src.tier}`], ["POIDS", `${Math.round(src.weight * 100)}%`], ["SIGNAL", `${Math.round(src.signalStrength * 100)}%`], ["SETUP", `${src.setupMinutes}min`]] as [string, string][]).map(([l, v]) => (
          <div key={l} style={{ textAlign: "center" as const }}>
            <div style={{ fontSize: 11, color: c.color, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>{v}</div>
            <div style={{ fontSize: 7, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 8, color: "#334155", fontFamily: "JetBrains Mono,monospace", wordBreak: "break-all" as const, marginBottom: 4 }}>
        {src.endpoint.slice(0, 70)}{src.endpoint.length > 70 ? "…" : ""}
      </div>
      {src.envVar && (
        <div style={{ fontSize: 8, color: "#f59e0b", fontFamily: "JetBrains Mono,monospace", marginBottom: 4 }}>key: {src.envVar}</div>
      )}
      <a href={src.docsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 8, color: "#22d3ee", fontFamily: "JetBrains Mono,monospace", textDecoration: "none" }}>
        docs →
      </a>
    </div>
  );
}

const ALGO = [
  { name: "LDA Semantic",      ref: "Mueller & Rauh, APSR 2018",       note: "25 topics — 700k articles de conflits. Score sémantique 6D.",                        metric: "25 topics",   color: "#22d3ee",  active: true },
  { name: "Velocity Penalty",  ref: "Vosoughi / MIT, Science 2018",    note: "Fausses nouvelles propagent 6×. Pénalité -35% max sur vitesse de propagation.",       metric: "-35% max",    color: "#3b82f6",  active: true },
  { name: "ViEWS Calibration", ref: "PRIO Oslo 2022-2024",             note: "Scoring 1-10 calibré ACLED historique. Fenêtre 2 mois. AUC 0.87.",                    metric: "AUC 0.87",    color: "#84cc16",  active: true },
  { name: "CUSUM Anomaly",     ref: "Murphy et al., Cambridge 2024",   note: "Ruptures de tendance ACLED+GDELT. Testé 3 cas — AUC 93.7%.",                          metric: "AUC 93.7%",   color: "#f59e0b",  active: true },
  { name: "CIB Detector",      ref: "Harvard Shorenstein, 2024",       note: "Backstopping, networked incitement, state actor patterns. 92 canaux Telegram scorés.", metric: "92 canaux",   color: "#ef4444",  active: true },
  { name: "RAG-LLM Context",   ref: "ArXiv 2505.09852, 2025",          note: "ACLED+GDELT+ReliefWeb → Claude API. +34% précision vs paramétrique. Déclenche L7+.",  metric: "+34% acc.",   color: "#a855f7",  active: true },
  { name: "Sentinel Anomaly",  ref: "ETH Zurich CSS, 2024",            note: "SAR Sentinel-1 + optique Sentinel-2 + Black Marble. 72-87% accuracy damage zones.",   metric: "72-87%",      color: "#f97316",  active: false },
  { name: "CAMEO Classifier",  ref: "GDELT 2.0 spec.",                 note: "20 codes CAMEO. Goldstein scale -10→+10. MAJ toutes les 15 minutes.",                 metric: "15min",       color: "#06b6d4",  active: true },
];

export function MultiSourcePanel() {
  const [tab, setTab] = useState<Tab>("FLUX");
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [catFilter, setCatFilter] = useState<CatFilter>("ALL");
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [selectedSrc, setSelectedSrc] = useState<DataSourceConfig | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const init: SourceStatus[] = NEXUS_SOURCES.map(s => ({
      id: s.id,
      status: (s.free && !s.envVar ? "ACTIVE" : s.envVar ? "PENDING" : "OFFLINE") as SourceStatus["status"],
      signalsLast5min: 0,
      category: s.category,
    }));
    setStatuses(init);
  }, []);

  useEffect(() => {
    let es: EventSource;
    const connect = () => {
      es = new EventSource("/api/nexus/intelligence");
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "signal" && msg.data) {
            const sig: LiveSignal = msg.data;
            setSignals(prev => {
              const deduped = prev.filter(s => s.id !== sig.id);
              return [sig, ...deduped].slice(0, 250);
            });
            setStatuses(prev => prev.map(s =>
              s.id === sig.source
                ? { ...s, status: "LIVE" as const, signalsLast5min: s.signalsLast5min + 1, lastSignal: sig.timestamp }
                : s
            ));
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { es?.close(); };
  }, []);

  const filtered = signals.filter(s => {
    if (catFilter !== "ALL" && s.category !== catFilter) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.zone?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const liveCount = statuses.filter(s => s.status === "LIVE").length;
  const anomCount = signals.filter(s => s.isAnomaly).length;
  const last5 = signals.filter(s => Date.now() - new Date(s.timestamp).getTime() < 300000).length;

  const TABS: Tab[] = ["FLUX", "SOURCES", "CATEGORIES", "SCIENCE"];

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, height: "100%", background: "#060d1f", color: "#e2e8f0", position: "relative" as const }}>

      {/* Header */}
      <div style={{ padding: "7px 12px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#22d3ee", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, letterSpacing: "0.08em" }}>MULTI-SOURCE</span>
          <span style={{
            fontSize: 8, padding: "1px 5px", borderRadius: 10,
            background: connected ? "#1a3a1a" : "#3a1a1a",
            color: connected ? "#4ade80" : "#f87171",
            fontFamily: "JetBrains Mono,monospace",
          }}>
            {connected ? "● LIVE" : "● RECONNECT"}
          </span>
        </div>
        <span style={{ fontSize: 8, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{NEXUS_SOURCES.length} sources · {signals.length} sig</span>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e3a5f", flexShrink: 0 }}>
        {([["LIVE", liveCount, "#4ade80"], ["SIG", signals.length, "#22d3ee"], ["/5M", last5, "#3b82f6"], ["⚠", anomCount, "#ef4444"]] as [string, number, string][]).map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, textAlign: "center" as const, padding: "5px 0", borderRight: "1px solid #1e3a5f" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: c, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 7, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e3a5f", flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "6px 0", border: "none", cursor: "pointer",
            background: tab === t ? "#0a1628" : "transparent",
            borderBottom: `2px solid ${tab === t ? "#22d3ee" : "transparent"}`,
            color: tab === t ? "#22d3ee" : "#475569",
            fontSize: 8, fontFamily: "JetBrains Mono,monospace", fontWeight: 700,
          }}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" as const, padding: "8px 10px" }}>

        {tab === "FLUX" && (
          <>
            <div style={{ marginBottom: 7, display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <input
                type="text"
                placeholder="filtrer…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "4px 7px",
                  background: "#0a1628", border: "1px solid #1e3a5f",
                  borderRadius: 3, color: "#e2e8f0", fontSize: 9,
                  fontFamily: "JetBrains Mono,monospace",
                  boxSizing: "border-box" as const,
                }}
              />
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" as const }}>
                {(["ALL", "AVIATION", "MARITIME", "GROUND_TRUTH", "GEOPHYSICAL", "ELECTRONIC", "CYBER", "FINANCIAL", "SOCIAL"] as CatFilter[]).map(cat => (
                  <button key={cat} onClick={() => setCatFilter(cat)} style={{
                    fontSize: 7, padding: "2px 5px", borderRadius: 2, cursor: "pointer",
                    background: catFilter === cat ? `${(CAT[cat]?.color ?? "#22d3ee")}22` : "#0a1628",
                    border: `1px solid ${catFilter === cat ? (CAT[cat]?.color ?? "#22d3ee") : "#1e3a5f"}`,
                    color: catFilter === cat ? (CAT[cat]?.color ?? "#22d3ee") : "#475569",
                    fontFamily: "JetBrains Mono,monospace", fontWeight: 700,
                  }}>
                    {cat === "ALL" ? "ALL" : cat.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center" as const, color: "#334155", padding: "30px 0", fontSize: 10, fontFamily: "JetBrains Mono,monospace" }}>
                {connected ? "En attente de signaux…" : "Connexion…"}
              </div>
            ) : (
              filtered.slice(0, 100).map(s => <SignalRow key={s.id} sig={s} />)
            )}
          </>
        )}

        {tab === "SOURCES" && (
          <>
            <div style={{ fontSize: 8, color: "#475569", fontFamily: "JetBrains Mono,monospace", marginBottom: 7 }}>
              {NEXUS_SOURCES.filter(s => s.free && !s.envVar).length} sans clé · {NEXUS_SOURCES.filter(s => s.free).length} gratuit · {NEXUS_SOURCES.length} total
            </div>
            {NEXUS_SOURCES.map(src => (
              <SourceCard
                key={src.id}
                src={src}
                status={statuses.find(s => s.id === src.id)}
                onSelect={() => setSelectedSrc(selectedSrc?.id === src.id ? null : src)}
              />
            ))}
          </>
        )}

        {tab === "CATEGORIES" && (
          <>
            {Object.entries(CAT).map(([cat, meta]) => {
              const sources = NEXUS_SOURCES.filter(s => s.category === cat);
              const active = statuses.filter(s => s.category === cat && s.status === "LIVE").length;
              const avgStr = sources.reduce((a, s) => a + s.signalStrength, 0) / Math.max(1, sources.length);
              const catSigs = signals.filter(s => s.category === cat).length;
              return (
                <div key={cat} style={{ background: "#070d1d", borderLeft: `3px solid ${meta.color}`, borderRadius: 4, padding: "9px 11px", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div>
                      <div style={{ fontSize: 10, color: meta.color, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>{cat}</div>
                      <div style={{ fontSize: 8, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{sources.length} src · {active} live · {catSigs} sig</div>
                    </div>
                    <div style={{ textAlign: "right" as const }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: meta.color, fontFamily: "JetBrains Mono,monospace" }}>{Math.round(avgStr * 100)}%</div>
                      <div style={{ fontSize: 7, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>SIGNAL</div>
                    </div>
                  </div>
                  <Bar v={avgStr} color={meta.color} />
                  <div style={{ display: "flex", gap: 3, marginTop: 5, flexWrap: "wrap" as const }}>
                    {sources.map(s => {
                      const live = statuses.find(st => st.id === s.id)?.status === "LIVE";
                      return (
                        <span key={s.id} style={{
                          fontSize: 7, padding: "1px 4px", borderRadius: 2,
                          background: live ? `${meta.color}22` : "#0f172a",
                          color: live ? meta.color : "#334155",
                          fontFamily: "JetBrains Mono,monospace",
                        }}>{s.name.slice(0, 14)}</span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "SCIENCE" && (
          <>
            {ALGO.map(a => (
              <div key={a.name} style={{
                background: "#070d1d",
                borderLeft: `3px solid ${a.color}`,
                borderRadius: 4,
                padding: "9px 11px",
                marginBottom: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 10, color: a.color, fontFamily: "JetBrains Mono,monospace", fontWeight: 700 }}>{a.name}</span>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 8, color: a.color, background: `${a.color}22`, padding: "1px 4px", borderRadius: 2, fontFamily: "JetBrains Mono,monospace" }}>{a.metric}</span>
                    <span style={{
                      fontSize: 8, padding: "1px 5px", borderRadius: 8,
                      background: a.active ? "#1a3a1a" : "#3a3a1a",
                      color: a.active ? "#4ade80" : "#f59e0b",
                      fontFamily: "JetBrains Mono,monospace",
                    }}>{a.active ? "ACTIVE" : "PENDING"}</span>
                  </div>
                </div>
                <div style={{ fontSize: 8, color: "#475569", fontFamily: "JetBrains Mono,monospace", marginBottom: 4 }}>{a.ref}</div>
                <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.5 }}>{a.note}</div>
              </div>
            ))}
          </>
        )}

      </div>

      {selectedSrc && <SourceDetail src={selectedSrc} onClose={() => setSelectedSrc(null)} />}
    </div>
  );
}
