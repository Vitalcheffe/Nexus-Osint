"use client";

/**
 * NEXUS Sources Status Panel
 * Displays real-time status of all configured data sources
 */

import { useStore } from "@/core/state/store";
import { SOURCE_META, type SignalSource } from "@/nexus/types";
import { Monitor, Wifi, WifiOff, AlertTriangle } from "lucide-react";

interface SourceStatus {
  source: SignalSource;
  name: string;
  active: boolean;
  signalsPerHour: number;
  errorRate: number;
  lastUpdate: Date | null;
}

function SourceStatusItem({ status }: { status: SourceStatus }) {
  const meta = SOURCE_META[status.source];
  const color = status.active ? "#22d3ee" : status.errorRate > 0.5 ? "#ef4444" : "#64748b";
  
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        marginBottom: 4,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 4,
        border: `1px solid ${color}22`,
      }}
    >
      {status.active ? (
        <Wifi size={14} style={{ color }} />
      ) : (
        <WifiOff size={14} style={{ color: "#64748b" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "#e2e8f0", fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>
          {status.name}
        </div>
        <div style={{ fontSize: 9, color: "#64748b", fontFamily: "JetBrains Mono, monospace" }}>
          {status.active 
            ? `${status.signalsPerHour} sig/h · ${meta.latency}`
            : "Inactive -- configure API key"}
        </div>
      </div>
      {status.errorRate > 0.5 && (
        <AlertTriangle size={12} style={{ color: "#f59e0b" }} />
      )}
    </div>
  );
}

export function NexusSources() {
  const sourceHealth = useStore((s) => s.nexusSourceHealth);
  
  // If no health data, show placeholder
  if (!sourceHealth || Object.keys(sourceHealth).length === 0) {
    return (
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <Monitor size={14} style={{ color: "#22d3ee" }} />
          <span style={{ fontSize: 10, color: "#22d3ee", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
            NEXUS INTELLIGENCE SOURCES
          </span>
        </div>
        <div style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono, monospace", padding: "8px 0" }}>
          Connect data sources to begin monitoring...
        </div>
      </div>
    );
  }
  
  const sources = Object.entries(SOURCE_META).map(([source, meta]) => ({
    source: source as SignalSource,
    name: meta.name,
    active: sourceHealth[source]?.active ?? false,
    signalsPerHour: sourceHealth[source]?.signalsPerHour ?? 0,
    errorRate: sourceHealth[source]?.errorRate ?? 0,
    lastUpdate: sourceHealth[source]?.lastUpdate ?? null,
  }));
  
  const activeSources = sources.filter(s => s.active);
  const inactiveSources = sources.filter(s => !s.active);
  
  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <Monitor size={14} style={{ color: "#22d3ee" }} />
        <span style={{ fontSize: 10, color: "#22d3ee", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
          NEXUS INTELLIGENCE SOURCES
        </span>
        <span style={{
          fontSize: 9,
          padding: "1px 5px",
          borderRadius: 8,
          background: activeSources.length > 0 ? "rgba(34,211,238,0.15)" : "rgba(100,116,139,0.15)",
          color: activeSources.length > 0 ? "#22d3ee" : "#64748b",
          fontFamily: "JetBrains Mono, monospace",
        }}>
          {activeSources.length}/{sources.length} ACTIVE
        </span>
      </div>
      
      {activeSources.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {activeSources.map((status) => (
            <SourceStatusItem key={status.source} status={status} />
          ))}
        </div>
      )}
      
      {inactiveSources.length > 0 && inactiveSources.length <= 5 && (
        <div style={{ opacity: 0.6 }}>
          {inactiveSources.map((status) => (
            <SourceStatusItem key={status.source} status={status} />
          ))}
        </div>
      )}
      
      {inactiveSources.length > 5 && (
        <div style={{ fontSize: 9, color: "#64748b", fontFamily: "JetBrains Mono, monospace", padding: "4px 0" }}>
          {inactiveSources.length} sources awaiting configuration
        </div>
      )}
    </div>
  );
}

export default NexusSources;