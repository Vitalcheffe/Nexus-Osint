import { nexusEngine } from "@/nexus/engine";
import { useStore } from "@/core/state/store";
import type { NexusEvent, SourceHealth } from "@/nexus/types";
import type { NexusAlert, NexusSignalUI, AlertType } from "@/core/state/nexusSlice";

// ─── NexusEvent → NexusAlert ──────────────────────────────────
// The engine produces NexusEvent (internal correlation format).
// The UI consumes NexusAlert (display format).
// Single authoritative conversion — nothing invented, all fields
// derived directly from the engine output.

const CATEGORY_TO_ALERT_TYPE: Record<string, AlertType> = {
  MILITAIRE:      "MILITAIRE",
  "GÉOPOLITIQUE": "GÉOPOLITIQUE",
  "CONFLIT_ARMÉ": "CONFLIT_ARMÉ",
  MARITIME:       "MARITIME",
  NATUREL:        "NATUREL",
  CYBER:          "CYBER",
  "ÉCONOMIQUE":   "ÉCONOMIQUE",
  ABSENCE_SIGNAL: "ABSENCE_SIGNAL",
  TERRORISME:     "TERRORISME",
  SURVEILLANCE:   "SURVEILLANCE",
  ESPACE:         "SURVEILLANCE",  // ESPACE absent from AlertType → nearest match
};

function eventToAlert(ev: NexusEvent): NexusAlert {
  const signals: NexusSignalUI[] = ev.signals.map(s => ({
    icon:       s.source.replace(/_/g, "/").toUpperCase().slice(0, 8),
    text:       s.description,
    source:     s.source,
    confidence: parseFloat(s.confidence.toFixed(3)),
  }));

  return {
    id:         ev.id,
    level:      ev.level,
    zone:       ev.zone,
    country:    ev.country,
    lat:        ev.lat,
    lng:        ev.lng,
    type:       CATEGORY_TO_ALERT_TYPE[ev.category] ?? "SURVEILLANCE",
    signals,
    confidence:   Math.round(ev.correlation.total * 100),
    similarEvent: ev.historicalMatches[0]?.name ?? null,
    timestamp:    ev.detectedAt instanceof Date ? ev.detectedAt : new Date(ev.detectedAt),
    acknowledged: ev.status === "acknowledged",
    swarmActive:  ev.swarmActive,
    reportId:     ev.reportId,
    correlation: {
      spatial:    ev.correlation.spatial,
      temporal:   ev.correlation.temporal,
      semantic:   ev.correlation.semantic,
      behavioral: ev.correlation.behavioral,
      historical: ev.correlation.historical,
      sourceDiv:  ev.correlation.sourceDiv,
    },
    historicalMatches: ev.historicalMatches.map(m => ({
      name:       m.name,
      similarity: m.similarity,
      date:       m.date,
      outcome:    m.outcome,
    })),
    aiSummary: ev.aiSummary,
  };
}

// ─── Bridge lifecycle ─────────────────────────────────────────

let initialized    = false;
let unsubEngine:   (() => void) | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;

export function initNexusBridge(): void {
  if (initialized) return;
  initialized = true;

  // Engine emits every time signals are processed.
  // Convert ALL active events → NexusAlert and push to store.
  unsubEngine = nexusEngine.onEvents((events: NexusEvent[]) => {
    const alerts     = events.filter(ev => ev.status !== "dismissed").map(eventToAlert);
    const tasks      = nexusEngine.getActiveTasks();

    useStore.setState({
      nexusAlerts:      alerts,
      nexusLiveEvents:  events,
      nexusAgentTasks:  tasks,
      nexusSignalCount: nexusEngine.getSignals().length,
      nexusLastUpdate:  new Date(),
    });
  });

  // Source health poll — real signal-rate data from engine buffers.
  healthInterval = setInterval(() => {
    const health: SourceHealth[] = nexusEngine.getSourceHealth();
    useStore.setState({ nexusSourceHealth: health });
  }, 15_000);

  // Seed initial state immediately (avoids empty flash on mount).
  const events = nexusEngine.getEvents();
  useStore.setState({
    nexusSourceHealth: nexusEngine.getSourceHealth(),
    nexusLiveEvents:   events,
    nexusAlerts:       events.filter(ev => ev.status !== "dismissed").map(eventToAlert),
    nexusAgentTasks:   nexusEngine.getActiveTasks(),
    nexusSignalCount:  0,
    nexusLastUpdate:   new Date(),
  });
}

export function destroyNexusBridge(): void {
  unsubEngine?.();
  if (healthInterval) clearInterval(healthInterval);
  initialized    = false;
  unsubEngine    = null;
  healthInterval = null;
}

// ─── Imperative actions (called from UI) ─────────────────────

export const nexusBridge = {
  acknowledge: (id: string): void => {
    nexusEngine.acknowledge(id);
    const events = nexusEngine.getEvents();
    useStore.setState({
      nexusLiveEvents: events,
      nexusAlerts:     events.filter(ev => ev.status !== "dismissed").map(eventToAlert),
    });
  },
  dismiss: (id: string): void => {
    nexusEngine.dismiss(id);
    const events = nexusEngine.getEvents();
    useStore.setState({
      nexusLiveEvents: events,
      nexusAlerts:     events.filter(ev => ev.status !== "dismissed").map(eventToAlert),
    });
  },
};
