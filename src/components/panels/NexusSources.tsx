"use client";

import { useState, useEffect } from "react";

const SOURCES = [
  { name: "Aviation ADS-B",     detail: "12,847 vols",          ok: true,  pulsing: true  },
  { name: "Maritime AIS",       detail: "8,234 navires",         ok: true,  pulsing: false },
  { name: "Twitter/X",          detail: "8,420 posts/min",       ok: true,  pulsing: true  },
  { name: "Telegram (127 ch.)", detail: "3,420 msgs/h",          ok: true,  pulsing: true  },
  { name: "TikTok Vision",      detail: "34 vidéos analysées",   ok: true,  pulsing: false },
  { name: "Sentinel Satellite", detail: "4 passes actives",      ok: true,  pulsing: false },
  { name: "GDELT Events",       detail: "24,000 événements",     ok: true,  pulsing: false },
  { name: "VK / Weibo",         detail: "1,200 posts/min",       ok: true,  pulsing: false },
];

export function NexusSources() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ marginTop: "var(--space-xl)", paddingTop: "var(--space-lg)", borderTop: "1px solid var(--border-subtle)" }}>
      <div className="sidebar__title" style={{ marginBottom: "var(--space-md)" }}>
        Nexus — Sources actives
      </div>
      {SOURCES.map((src, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 0",
            borderBottom: i < SOURCES.length - 1 ? "1px solid var(--border-subtle)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: src.ok ? "var(--accent-green)" : "var(--accent-red)",
                boxShadow: src.pulsing ? `0 0 6px var(--accent-green)` : "none",
                opacity: src.pulsing ? (tick % 2 === 0 ? 1 : 0.5) : 1,
                transition: "opacity 0.5s",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{src.name}</span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              textAlign: "right",
            }}
          >
            {src.detail}
          </span>
        </div>
      ))}
    </div>
  );
}
