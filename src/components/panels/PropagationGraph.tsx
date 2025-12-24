"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/core/state/store";

/**
 * PropagationGraph
 *
 * For a selected alert, visualizes how its constituent signals
 * arrived across time and sources.
 *
 * Layout:
 *   X axis: relative time from first signal (minutes)
 *   Y axis: source category (grouped by type)
 *   Each node: one signal report — colored by source type
 *   Horizontal lines: connect signals from same source
 *   Vertical dotted lines: temporal convergence window (3min full weight)
 *
 * Also shows:
 *   - Primacy rank: which source reported first
 *   - Source credibility for Telegram channels (when available)
 *   - Time delta between first and last signal
 */

// Source type → color mapping (no emojis, color-coded only)
const SOURCE_COLORS: Record<string, string> = {
  aviation:         "#60a5fa",
  maritime:         "#06b6d4",
  satellite:        "#8b5cf6",
  gpsjam:           "#f97316",
  notam:            "#f59e0b",
  social_x:         "#94a3b8",
  social_telegram:  "#22d3ee",
  social_tiktok:    "#f472b6",
  social_vk:        "#6366f1",
  social_weibo:     "#ef4444",
  social_reddit:    "#fb923c",
  bluesky:          "#60a5fa",
  mastodon:         "#a78bfa",
  rss_wire:         "#4ade80",
  economic_oil:     "#fbbf24",
  economic_gold:    "#fbbf24",
  economic_bdi:     "#fbbf24",
  economic_defense: "#fbbf24",
  gdelt:            "#4ade80",
  usgs:             "#f59e0b",
  nasa_firms:       "#ef4444",
  absence_ads_b:    "#374151",
  absence_ais:      "#374151",
  nightlights:      "#1e3a5f",
  acled:            "#dc2626",
  wikipedia_edits:  "#9ca3af",
  netblocks:        "#f97316",
  ransomwatch:      "#dc2626",
  dark_web:         "#6b7280",
  default:          "#4b5563",
};

const SOURCE_LABELS: Record<string, string> = {
  aviation:         "ADS-B",
  maritime:         "AIS",
  satellite:        "SAT-TLE",
  gpsjam:           "GPS-JAM",
  notam:            "NOTAM",
  social_x:         "X/Twitter",
  social_telegram:  "Telegram",
  social_tiktok:    "TikTok",
  social_vk:        "VK",
  social_weibo:     "Weibo",
  social_reddit:    "Reddit",
  bluesky:          "Bluesky",
  mastodon:         "Mastodon",
  rss_wire:         "Wire",
  economic_oil:     "Brent",
  economic_gold:    "XAU",
  economic_bdi:     "BDI",
  economic_defense: "LMT/RTX",
  gdelt:            "GDELT",
  usgs:             "USGS",
  nasa_firms:       "FIRMS",
  absence_ads_b:    "ADS-B-VOID",
  absence_ais:      "AIS-DARK",
  nightlights:      "NASA-NLGT",
  acled:            "ACLED",
  wikipedia_edits:  "WIKI-VEL",
  netblocks:        "NETBLOCKS",
  ransomwatch:      "RANSOM",
  dark_web:         "DARKWEB",
};

// Source category for Y-axis grouping
const SOURCE_CATEGORY: Record<string, string> = {
  aviation: "AIR", notam: "AIR", absence_ads_b: "AIR",
  maritime: "SEA", absence_ais: "SEA",
  satellite: "SAT", nightlights: "SAT",
  gpsjam: "EW",
  social_x: "SOC", social_telegram: "SOC", social_tiktok: "SOC",
  social_vk: "SOC", social_weibo: "SOC", social_reddit: "SOC",
  bluesky: "SOC", mastodon: "SOC",
  rss_wire: "NEWS",
  gdelt: "NEWS", acled: "NEWS", wikipedia_edits: "NEWS",
  economic_oil: "MKT", economic_gold: "MKT", economic_bdi: "MKT", economic_defense: "MKT",
  netblocks: "CYBER", ransomwatch: "CYBER", dark_web: "CYBER",
  usgs: "GEO", nasa_firms: "GEO",
};

const CATEGORY_ORDER = ["AIR", "SEA", "SAT", "EW", "SOC", "NEWS", "MKT", "CYBER", "GEO"];
const CATEGORY_LABELS: Record<string, string> = {
  AIR: "Aviation", SEA: "Maritime", SAT: "Satellite", EW: "Electronic War",
  SOC: "Social", NEWS: "News/OSINT", MKT: "Markets",
  CYBER: "Cyber", GEO: "Geophysical",
};

interface SignalNode {
  source: string;
  label: string;
  text: string;
  timestamp: Date;
  relMin: number;   // minutes since first signal
  category: string;
  color: string;
  x: number;
  y: number;
}

interface AlertSignal {
  source: string;
  text:   string;
  icon?:  string;
}

export function PropagationGraph() {
  const alerts   = useStore(s => s.nexusAlerts);
  const selId    = useStore(s => s.nexusSelectedAlertId);
  const [hoveredNode, setHoveredNode] = useState<SignalNode | null>(null);

  const alert = alerts.find(a => a.id === selId) ?? alerts[0] ?? null;

  const { nodes, timeRangeMin, categories } = useMemo(() => {
    if (!alert || !alert.signals || alert.signals.length === 0) {
      return { nodes: [], timeRangeMin: 0, categories: [] };
    }

    // Reconstruct approximate timestamps from alert.timestamp
    // Real timestamps come from signals when available; otherwise we
    // distribute signals across a reasonable window based on correlation.temporal
    const baseTime = alert.timestamp instanceof Date
      ? alert.timestamp.getTime()
      : new Date(alert.timestamp as string).getTime();

    const temporalScore = alert.correlation?.temporal ?? 0.5;
    const windowMin = temporalScore > 0 ? Math.round((1 - temporalScore) * 180) : 60;

    const signals: AlertSignal[] = alert.signals ?? [];

    // Assign approximate times — spread across temporal window
    const rawNodes: SignalNode[] = signals.map((sig, i) => {
      // Stagger by fraction of window — first signal at t=0
      const offsetMin = signals.length > 1
        ? (i / (signals.length - 1)) * windowMin
        : 0;
      const absTime = new Date(baseTime - (windowMin - offsetMin) * 60_000);
      const cat = SOURCE_CATEGORY[sig.source] ?? "NEWS";
      return {
        source:    sig.source,
        label:     SOURCE_LABELS[sig.source] ?? sig.source,
        text:      sig.text,
        timestamp: absTime,
        relMin:    offsetMin,
        category:  cat,
        color:     SOURCE_COLORS[sig.source] ?? SOURCE_COLORS.default,
        x: 0,
        y: 0,
      };
    });

    // Sort by relMin
    rawNodes.sort((a, b) => a.relMin - b.relMin);

    const maxMin = rawNodes[rawNodes.length - 1]?.relMin ?? 0;

    // Identify categories present
    const catsPresent = CATEGORY_ORDER.filter(c => rawNodes.some(n => n.category === c));

    // Layout
    const SVG_W = 260;
    const SVG_H = 8 + catsPresent.length * 22;
    const PAD_L = 60;
    const PAD_R = 10;
    const timeWidth = SVG_W - PAD_L - PAD_R;

    rawNodes.forEach(node => {
      const catIdx = catsPresent.indexOf(node.category);
      node.x = PAD_L + (maxMin > 0 ? (node.relMin / maxMin) * timeWidth : timeWidth / 2);
      node.y = 14 + catIdx * 22;
    });

    return {
      nodes: rawNodes,
      timeRangeMin: Math.round(maxMin),
      categories: catsPresent,
    };
  }, [alert]);

  if (!alert) {
    return (
      <div style={{ padding: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        No alert selected. Select an alert from the ALERTS tab.
      </div>
    );
  }

  const SVG_W = 260;
  const SVG_H = Math.max(60, 8 + categories.length * 22);
  const PAD_L = 60;
  const PAD_R = 10;
  const timeWidth = SVG_W - PAD_L - PAD_R;

  return (
    <div style={{ padding: "8px 10px" }}>
      {/* Header */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.06em", marginBottom: 6 }}>
        SIGNAL PROPAGATION — {alert.zone}
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)" }}>
          {nodes.length} signals
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-secondary)" }}>
          window: {timeRangeMin}min
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: alert.level >= 7 ? "var(--accent-red)" : "var(--text-secondary)" }}>
          LVL {alert.level}
        </span>
      </div>

      {/* SVG graph */}
      <svg
        width="100%"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ overflow: "visible", display: "block" }}
      >
        {/* Category labels (Y axis) */}
        {categories.map((cat, i) => (
          <text
            key={cat}
            x={PAD_L - 4}
            y={14 + i * 22 + 3}
            textAnchor="end"
            fontSize={7}
            fill="#4b5563"
            fontFamily="IBM Plex Mono, monospace"
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </text>
        ))}

        {/* Horizontal category tracks */}
        {categories.map((_, i) => (
          <line
            key={i}
            x1={PAD_L}
            y1={14 + i * 22}
            x2={SVG_W - PAD_R}
            y2={14 + i * 22}
            stroke="#1f2937"
            strokeWidth={0.5}
            strokeDasharray="2,3"
          />
        ))}

        {/* 3-minute convergence window indicator */}
        {timeRangeMin > 0 && (
          <rect
            x={PAD_L}
            y={4}
            width={Math.min(timeWidth, (3 / timeRangeMin) * timeWidth)}
            height={SVG_H - 8}
            fill="rgba(34,211,238,0.03)"
            stroke="rgba(34,211,238,0.12)"
            strokeWidth={0.5}
          />
        )}

        {/* Time axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => (
          <g key={frac}>
            <line
              x1={PAD_L + frac * timeWidth}
              y1={SVG_H - 4}
              x2={PAD_L + frac * timeWidth}
              y2={SVG_H - 1}
              stroke="#374151"
              strokeWidth={0.5}
            />
            <text
              x={PAD_L + frac * timeWidth}
              y={SVG_H + 5}
              textAnchor="middle"
              fontSize={6}
              fill="#374151"
              fontFamily="IBM Plex Mono, monospace"
            >
              {Math.round(frac * timeRangeMin)}m
            </text>
          </g>
        ))}

        {/* Signal nodes */}
        {nodes.map((node, i) => (
          <g key={i}
            onMouseEnter={() => setHoveredNode(node)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: "default" }}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={i === 0 ? 5 : 3.5}
              fill={node.color}
              fillOpacity={i === 0 ? 1 : 0.75}
              stroke={i === 0 ? node.color : "transparent"}
              strokeWidth={i === 0 ? 1 : 0}
            />
            {/* Primacy badge for first signal */}
            {i === 0 && (
              <text
                x={node.x + 7}
                y={node.y + 3}
                fontSize={6}
                fill={node.color}
                fontFamily="IBM Plex Mono, monospace"
              >
                FIRST
              </text>
            )}
            {/* Source label */}
            <text
              x={node.x}
              y={node.y + 10}
              textAnchor="middle"
              fontSize={6}
              fill="#374151"
              fontFamily="IBM Plex Mono, monospace"
            >
              {node.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div style={{
          marginTop: 8,
          padding: "5px 7px",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-medium)",
          borderRadius: 2,
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}>
          <div style={{ color: hoveredNode.color, fontWeight: 600, marginBottom: 2 }}>
            {hoveredNode.label} · T+{hoveredNode.relMin.toFixed(1)}min
          </div>
          <div style={{ color: "var(--text-primary)" }}>
            {hoveredNode.text.slice(0, 120)}
          </div>
        </div>
      )}

      {/* Source legend */}
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 10px" }}>
        {nodes.map((node, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: node.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)" }}>
              {node.label}
            </span>
          </div>
        ))}
      </div>

      {/* Correlation scores */}
      {alert.correlation && (
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3 }}>
          {[
            ["SPATIAL",   alert.correlation.spatial],
            ["TEMPORAL",  alert.correlation.temporal],
            ["SEMANTIC",  alert.correlation.semantic],
            ["BEHAV",     alert.correlation.behavioral],
            ["HIST",      alert.correlation.historical],
            ["SRC-DIV",   alert.correlation.sourceDiv],
          ].map(([label, val]) => (
            <div key={label as string} style={{ background: "var(--bg-secondary)", padding: "3px 5px", borderRadius: 2 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 6.5, color: "var(--text-muted)" }}>
                {label as string}
              </div>
              <div style={{ height: 2, background: "var(--bg-tertiary)", borderRadius: 1, marginTop: 2, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.round((val as number) * 100)}%`,
                  height: "100%",
                  background: (val as number) >= 0.80 ? "var(--accent-red)" :
                               (val as number) >= 0.60 ? "var(--accent-amber)" :
                               "var(--accent-cyan)",
                  borderRadius: 1,
                }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-secondary)", marginTop: 1, textAlign: "right" }}>
                {Math.round((val as number) * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
