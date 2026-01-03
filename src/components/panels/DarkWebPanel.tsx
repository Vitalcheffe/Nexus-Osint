"use client";

import React, { useEffect, useRef, useState } from "react";
import type { DarkWebSignal } from "@/app/api/darkweb/ingest/route";

// ─── Constants ────────────────────────────────────────────────

const SOURCE_META: Record<string, { label: string; color: string; icon: string }> = {
  "4chan_pol":       { label: "4chan /pol/",     color: "#ef4444", icon: "☢" },
  "4chan_k":         { label: "4chan /k/",       color: "#f97316", icon: "⚔" },
  "4chan_int":       { label: "4chan /int/",     color: "#f59e0b", icon: "🌐" },
  "4chan_news":      { label: "4chan /news/",    color: "#eab308", icon: "📰" },
  reddit_worldnews:  { label: "Reddit World",   color: "#ff4500", icon: "●" },
  reddit_CombatFootage: { label: "CombatFootage", color: "#dc2626", icon: "🎥" },
  reddit_geopolitics: { label: "r/Geopolitics", color: "#f97316", icon: "🗺" },
  reddit_CredibleDefense: { label: "r/CredDef", color: "#3b82f6", icon: "🛡" },
  reddit_UkraineWarVideoReport: { label: "r/UkraineWar", color: "#22d3ee", icon: "UA" },
  hackernews:        { label: "Hacker News",    color: "#ff6600", icon: "Y" },
  pastebin:          { label: "Pastebin",        color: "#4ade80", icon: "📋" },
  ddosecrets:        { label: "DDoSecrets",      color: "#a855f7", icon: "🔓" },
  the_intercept:     { label: "The Intercept",   color: "#22d3ee", icon: "⚡" },
  propublica:        { label: "ProPublica",      color: "#3b82f6", icon: "📰" },
  nytimes_onion:     { label: "NYT .onion",      color: "#94a3b8", icon: "N" },
  bbc_onion:         { label: "BBC .onion",       color: "#ef4444", icon: "B" },
  dw_onion:          { label: "DW .onion",        color: "#f59e0b", icon: "D" },
  rferl_onion:       { label: "RFE/RL .onion",   color: "#f97316", icon: "R" },
  bellingcat:        { label: "Bellingcat",       color: "#84cc16", icon: "🔍" },
  lockbit3_leak:     { label: "LockBit 3",        color: "#dc2626", icon: "🔒" },
  alphv_leak:        { label: "ALPHV/BlackCat",   color: "#7f1d1d", icon: "🐱" },
  clop_leak:         { label: "CLOP",             color: "#991b1b", icon: "🔒" },
};

const CAT_META: Record<string, { color: string; label: string }> = {
  SOCIAL:       { color: "#f59e0b", label: "SOCIAL"  },
  CYBER:        { color: "#a855f7", label: "CYBER"   },
  GROUND_TRUTH: { color: "#10b981", label: "INTEL"   },
  ABSENCE:      { color: "#64748b", label: "ABSENCE" },
};

type TabDW = "FLUX" | "CLEARNET" | "ONION" | "CYBER_THREAT" | "STATS";

function age(ts: string): string {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function ConfBar({ v, color }: { v: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <div style={{ width: 40, height: 2, background: "#1a2744", borderRadius: 2 }}>
        <div style={{ width: `${Math.round(v * 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 7, color, fontFamily: "JetBrains Mono,monospace", minWidth: 24 }}>
        {Math.round(v * 100)}%
      </span>
    </div>
  );
}

function SignalCard({ sig }: { sig: DarkWebSignal; key?: string }) {
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_META[sig.source] ?? { label: sig.sourceName, color: "#64748b", icon: "?" };
  const cat = CAT_META[sig.category] ?? CAT_META.SOCIAL;

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: sig.isAnomaly ? "#120808" : "#070d1d",
        borderLeft: `3px solid ${sig.onion ? "#a855f7" : src.color}`,
        borderRadius: 3,
        padding: "7px 9px",
        marginBottom: 4,
        cursor: "pointer",
        borderTop: `1px solid ${sig.isAnomaly ? "#3f0000" : "#0f172a"}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{
            fontSize: 8, fontFamily: "JetBrains Mono,monospace",
            color: sig.onion ? "#a855f7" : src.color, fontWeight: 700,
          }}>
            {sig.onion ? "🧅" : "🌐"} {src.label.slice(0, 14)}
          </span>
          <span style={{
            fontSize: 7, padding: "1px 3px", borderRadius: 2,
            background: `${cat.color}18`, color: cat.color,
            fontFamily: "JetBrains Mono,monospace",
          }}>
            {cat.label}
          </span>
          {sig.isAnomaly && (
            <span style={{
              fontSize: 7, padding: "1px 3px", borderRadius: 2,
              background: "#3a0000", color: "#f87171",
              fontFamily: "JetBrains Mono,monospace", fontWeight: 700,
            }}>⚠ ANOMALIE</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 7, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>
            {age(sig.timestamp)}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 9, color: "#e2e8f0", lineHeight: 1.4, marginBottom: 3 }}>
        {sig.title}
      </div>

      <ConfBar v={sig.confidence} color={sig.isAnomaly ? "#ef4444" : src.color} />

      {expanded && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #1e3a5f" }}>
          {sig.zone && sig.zone !== "Global" && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 7, color: "#22d3ee", fontFamily: "JetBrains Mono,monospace" }}>
                📍 {sig.zone}
              </span>
              {sig.lat !== 0 && (
                <span style={{ fontSize: 7, color: "#334155", fontFamily: "JetBrains Mono,monospace", marginLeft: 6 }}>
                  {sig.lat.toFixed(2)}°, {sig.lng.toFixed(2)}°
                </span>
              )}
            </div>
          )}
          {sig.body && sig.body !== sig.title && (
            <div style={{ fontSize: 8, color: "#94a3b8", lineHeight: 1.5, marginBottom: 4 }}>
              {sig.body}
            </div>
          )}
          {sig.tags.length > 0 && (
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" as const, marginBottom: 4 }}>
              {sig.tags.map(t => (
                <span key={t} style={{
                  fontSize: 7, padding: "1px 4px", borderRadius: 2,
                  background: "#0f172a", color: "#334155",
                  fontFamily: "JetBrains Mono,monospace",
                }}>#{t}</span>
              ))}
            </div>
          )}
          <a
            href={sig.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 8, color: "#22d3ee", fontFamily: "JetBrains Mono,monospace", textDecoration: "none" }}
          >
            {sig.onion ? "🧅 Voir .onion →" : "🌐 Source →"}
          </a>
        </div>
      )}
    </div>
  );
}

function StatsPanel() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch("/api/darkweb/stats")
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return (
    <div style={{ textAlign: "center", padding: "30px", color: "#334155", fontFamily: "JetBrains Mono,monospace", fontSize: 9 }}>
      Chargement stats…
    </div>
  );

  return (
    <div style={{ padding: "8px 10px" }}>
      <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 8, color: "#22d3ee", marginBottom: 10, letterSpacing: "0.06em" }}>
        ARCHITECTURE — DARK WEB COLLECTOR
      </div>

      {Object.entries(stats.sources as Record<string, any[]>).map(([group, sources]) => (
        <div key={group} style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 8, color: "#475569", marginBottom: 4, letterSpacing: "0.04em" }}>
            {group.toUpperCase().replace("_", " ")}
          </div>
          {sources.map((s: any) => (
            <div key={s.id} style={{
              background: "#070d1d", borderRadius: 3, padding: "5px 8px",
              marginBottom: 3, borderLeft: `2px solid ${s.status === "ACTIVE" ? "#4ade80" : s.status === "TOR_REQUIRED" ? "#a855f7" : "#f59e0b"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, color: "#e2e8f0", fontFamily: "JetBrains Mono,monospace" }}>{s.name}</span>
                <span style={{
                  fontSize: 7, padding: "1px 4px", borderRadius: 2, fontFamily: "JetBrains Mono,monospace",
                  background: s.status === "ACTIVE" ? "#1a3a1a" : s.status === "TOR_REQUIRED" ? "#2a1a3a" : "#3a2a1a",
                  color: s.status === "ACTIVE" ? "#4ade80" : s.status === "TOR_REQUIRED" ? "#a855f7" : "#f59e0b",
                }}>
                  {s.status === "TOR_REQUIRED" ? "🧅 TOR" : s.status === "NEEDS_IP" ? "IP REQUIS" : "✓ ACTIF"}
                </span>
              </div>
              {s.note && (
                <div style={{ fontSize: 7, color: "#475569", fontFamily: "JetBrains Mono,monospace", marginTop: 2 }}>{s.note}</div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 8, padding: "8px 10px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 4 }}>
        <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 8, color: "#22d3ee", marginBottom: 5 }}>LANCEMENT COLLECTEUR</div>
        <div style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 7.5, color: "#94a3b8", lineHeight: 1.8 }}>
          # 1. Installer Tor<br />
          apt install tor / brew install tor<br />
          <br />
          # 2. Démarrer Tor<br />
          tor &amp;<br />
          <br />
          # 3. Python deps<br />
          pip install requests[socks] stem beautifulsoup4 pysocks<br />
          <br />
          # 4. Lancer<br />
          NEXUS_API_URL=http://localhost:3000 python3 scripts/nexus_darkweb_collector.py
        </div>
      </div>
    </div>
  );
}

export function DarkWebPanel() {
  const [tab, setTab] = useState<TabDW>("FLUX");
  const [signals, setSignals] = useState<DarkWebSignal[]>([]);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let es: EventSource;
    const connect = () => {
      es = new EventSource("/api/darkweb/ingest");
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "darkweb_signal" && msg.data) {
            const sig = msg.data as DarkWebSignal;
            setSignals(prev => {
              const deduped = prev.filter(s => s.id !== sig.id);
              return [sig, ...deduped].slice(0, 300);
            });
          }
        } catch {}
      };
      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connect, 5000);
      };
    };
    connect();
    return () => es?.close();
  }, []);

  const onionSigs    = signals.filter(s => s.onion);
  const clearnetSigs = signals.filter(s => !s.onion && s.category !== "CYBER");
  const cyberSigs    = signals.filter(s => s.category === "CYBER");
  const anomalySigs  = signals.filter(s => s.isAnomaly);

  const filtered = signals.filter(s => {
    if (tab === "ONION" && !s.onion) return false;
    if (tab === "CLEARNET" && s.onion) return false;
    if (tab === "CYBER_THREAT" && s.category !== "CYBER") return false;
    if (onlyAnomaly && !s.isAnomaly) return false;
    if (search && !s.title.toLowerCase().includes(search.toLowerCase()) && !s.zone?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const TABS: TabDW[] = ["FLUX", "CLEARNET", "ONION", "CYBER_THREAT", "STATS"];
  const TAB_LABELS: Record<TabDW, string> = {
    FLUX: "FLUX", CLEARNET: "CLEAR", ONION: "🧅 .ONION",
    CYBER_THREAT: "CYBER", STATS: "CONFIG",
  };
  const TAB_BADGES: Record<TabDW, string | number> = {
    FLUX: signals.length,
    CLEARNET: clearnetSigs.length,
    ONION: onionSigs.length,
    CYBER_THREAT: cyberSigs.length,
    STATS: "⚙",
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column" as const, height: "100%",
      background: "#060d1f", color: "#e2e8f0", position: "relative" as const,
    }}>
      {/* Header */}
      <div style={{
        padding: "7px 12px", borderBottom: "1px solid #1e3a5f",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0, background: "#04080f",
      }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#a855f7", fontFamily: "JetBrains Mono,monospace", fontWeight: 700, letterSpacing: "0.08em" }}>
            🧅 DARK WEB INTEL
          </span>
          <span style={{
            fontSize: 8, padding: "1px 5px", borderRadius: 10,
            background: connected ? "#1a0a3a" : "#3a0a0a",
            color: connected ? "#a855f7" : "#f87171",
            fontFamily: "JetBrains Mono,monospace",
          }}>
            {connected ? "● LIVE" : "● RECONNECT"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <span style={{
            fontSize: 7, padding: "1px 4px", borderRadius: 2,
            background: "#2a1a3a", color: "#a855f7",
            fontFamily: "JetBrains Mono,monospace",
          }}>TOR</span>
          <span style={{
            fontSize: 7, padding: "1px 4px", borderRadius: 2,
            background: "#1a3a1a", color: "#4ade80",
            fontFamily: "JetBrains Mono,monospace",
          }}>CLEARNET</span>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e3a5f", flexShrink: 0 }}>
        {([
          ["TOTAL", signals.length, "#a855f7"],
          [".ONION", onionSigs.length, "#7c3aed"],
          ["CLEAR", clearnetSigs.length, "#3b82f6"],
          ["CYBER", cyberSigs.length, "#ef4444"],
          ["⚠", anomalySigs.length, "#dc2626"],
        ] as [string, number, string][]).map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, textAlign: "center" as const, padding: "5px 0", borderRight: "1px solid #1e3a5f" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c, fontFamily: "JetBrains Mono,monospace", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 7, color: "#475569", fontFamily: "JetBrains Mono,monospace" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e3a5f", flexShrink: 0, overflowX: "auto" as const }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flexShrink: 0, padding: "5px 8px", border: "none", cursor: "pointer",
            background: tab === t ? "#0a0f1e" : "transparent",
            borderBottom: `2px solid ${tab === t ? "#a855f7" : "transparent"}`,
            display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 1,
          }}>
            <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 6.5, letterSpacing: "0.05em", color: tab === t ? "#a855f7" : "#475569", fontWeight: tab === t ? 700 : 400 }}>
              {TAB_LABELS[t]}
            </span>
            <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 9, fontWeight: 700, color: tab === t ? "#a855f7" : "#334155" }}>
              {TAB_BADGES[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" as const }}>
        {tab === "STATS" ? (
          <StatsPanel />
        ) : (
          <div style={{ padding: "8px 10px" }}>
            {/* Filters */}
            <div style={{ marginBottom: 7, display: "flex", flexDirection: "column" as const, gap: 4 }}>
              <input
                type="text"
                placeholder="filtrer signaux…"
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "4px 7px",
                  background: "#0a1628", border: "1px solid #1e3a5f",
                  borderRadius: 3, color: "#e2e8f0", fontSize: 9,
                  fontFamily: "JetBrains Mono,monospace",
                  boxSizing: "border-box" as const,
                }}
              />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={onlyAnomaly}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOnlyAnomaly(e.target.checked)}
                    style={{ accentColor: "#a855f7" }}
                  />
                  <span style={{ fontSize: 8, color: "#a855f7", fontFamily: "JetBrains Mono,monospace" }}>
                    Anomalies uniquement
                  </span>
                </label>
                <span style={{ fontSize: 7, color: "#334155", fontFamily: "JetBrains Mono,monospace", marginLeft: "auto" }}>
                  {filtered.length} signaux
                </span>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: "center" as const, color: "#334155", padding: "30px 0", fontSize: 10, fontFamily: "JetBrains Mono,monospace" }}>
                {connected ? "En attente de signaux…" : "Connexion au collecteur…"}
                {!connected && (
                  <div style={{ fontSize: 8, color: "#1e3a5f", marginTop: 8 }}>
                    Lancer: python3 scripts/nexus_darkweb_collector.py
                  </div>
                )}
              </div>
            ) : (
              filtered.slice(0, 100).map(s => <SignalCard key={s.id} sig={s} />)
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "3px 10px", borderTop: "1px solid #1e3a5f",
        background: "#04080f", flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 7, color: "#1e3a5f" }}>
          TOR SOCKS5:9050 · SSE /api/darkweb/ingest
        </span>
        <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 7, color: "#a855f7" }}>
          {onionSigs.length > 0 ? "🧅 ONION ACTIVE" : "CLEARNET ONLY"}
        </span>
      </div>
    </div>
  );
}
