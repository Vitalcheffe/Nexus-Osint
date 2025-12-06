/**
 * NEXUS Zustand Slice — Unified intelligence platform state
 *
 * All collections start empty. Data is populated exclusively from:
 *   - bridge.ts (NexusEngine → alerts, signals, tasks)
 *   - /api/economic fetch in MarketsTab
 *   - /api/telegram-intel SSE for Telegram notifications
 *   - DarkWebPanel SSE for dark web signals
 *
 * No data is ever hardcoded here. Empty = not yet received from real source.
 */
import type { StateCreator } from "zustand";
import type { AppStore } from "./store";
import type { NexusEvent, SourceHealth, AgentTask } from "@/nexus/types";

export type AlertLevel = 1|2|3|4|5|6|7|8|9|10;
export type AlertType =
  | "MILITAIRE" | "GÉOPOLITIQUE" | "CONFLIT_ARMÉ" | "MARITIME" | "NATUREL"
  | "CYBER" | "ÉCONOMIQUE" | "ABSENCE_SIGNAL" | "TERRORISME" | "SURVEILLANCE";

export interface NexusSignalUI {
  icon: string;
  text: string;
  source: string;
  confidence?: number;
}

export interface NexusAlert {
  id: string;
  level: AlertLevel;
  zone: string;
  country: string;
  lat: number;
  lng: number;
  type: AlertType;
  signals: NexusSignalUI[];
  confidence: number;
  similarEvent: string | null;
  timestamp: Date;
  acknowledged: boolean;
  swarmActive: boolean;
  reportId?: string;
  correlation: {
    spatial: number; temporal: number; semantic: number;
    behavioral: number; historical: number; sourceDiv: number;
  };
  historicalMatches: Array<{ name: string; similarity: number; date: string; outcome: string }>;
  aiSummary: string;
}

export interface LiveSignal {
  id: string;
  source: string;
  icon: string;
  text: string;
  zone: string;
  confidence: number;
  timestamp: Date;
  level: AlertLevel;
}

export interface TelegramNotif {
  id: string;
  time: string;
  level: AlertLevel;
  zone: string;
  summary: string;
  alertId: string;
  lat?: number;
  lng?: number;
}

export interface SocialSource {
  platform: string;
  icon: string;
  volume: number;
  delta: string;
  hot: boolean;
  trend: number[];
}

export interface EconomicIndicator {
  id: string;
  name: string;
  symbol: string;
  value: number;
  changePercent: number;
  anomalyScore: number;
  signal: string;
  history: number[];
  geoZone: string;
}

export interface IntelReport {
  id: string;
  eventId: string;
  zone: string;
  level: AlertLevel;
  category: string;
  generatedAt: Date;
  summary: string;
  sections: Array<{ title: string; content: string }>;
  signalCount: number;
  confidence: number;
}

// ─── Slice ────────────────────────────────────────────────────

export interface NexusSlice {
  // Panel UI
  nexusPanelOpen:   boolean;
  nexusActiveTab:   "alerts"|"signals"|"sources"|"markets"|"swarm"|"report"|"telegram"|"intel"|"live"|"timeline"|"matrix"|"darkweb";
  nexusSelectedAlertId: string | null;
  nexusTickerPaused: boolean;
  // Live data — populated by bridge.ts and API fetches
  nexusAlerts:              NexusAlert[];
  nexusLiveSignals:         LiveSignal[];
  nexusTelegramNotifs:      TelegramNotif[];
  nexusSocialSources:       SocialSource[];
  nexusEconomicIndicators:  EconomicIndicator[];
  nexusAgentTasks:          AgentTask[];
  nexusLiveEvents:          NexusEvent[];
  nexusSourceHealth:        SourceHealth[];
  nexusSignalCount:         number;
  nexusLastUpdate:          Date | null;
  nexusReports:             IntelReport[];
  // Silence window (ms timestamp when silence ends, 0 = not silenced)
  nexusSilencedUntil: number;
  // Actions
  toggleNexusPanel:     () => void;
  setNexusActiveTab:    (tab: NexusSlice["nexusActiveTab"]) => void;
  setNexusSelectedAlert:(id: string | null) => void;
  acknowledgeAlert:     (id: string) => void;
  toggleTicker:         () => void;
  generateReport:       (alertId: string) => void;
  silenceNotifs:        (durationMs: number) => void;
}

export const createNexusSlice: StateCreator<AppStore, [], [], NexusSlice> = (set, get) => ({
  nexusPanelOpen:          true,
  nexusActiveTab:          "alerts",
  nexusSelectedAlertId:    null,
  nexusTickerPaused:       false,
  nexusAlerts:             [],
  nexusLiveSignals:        [],
  nexusTelegramNotifs:     [],
  nexusSocialSources:      [],
  nexusEconomicIndicators: [],
  nexusAgentTasks:         [],
  nexusLiveEvents:         [],
  nexusSourceHealth:       [],
  nexusSignalCount:        0,
  nexusLastUpdate:         null,
  nexusReports:            [],
  nexusSilencedUntil:      0,

  toggleNexusPanel:      () => set(s => ({ nexusPanelOpen: !s.nexusPanelOpen })),
  setNexusActiveTab:     (tab) => set({ nexusActiveTab: tab }),
  setNexusSelectedAlert: (id)  => set({ nexusSelectedAlertId: id }),
  toggleTicker:          ()    => set(s => ({ nexusTickerPaused: !s.nexusTickerPaused })),
  silenceNotifs:         (ms)  => set({ nexusSilencedUntil: Date.now() + ms }),

  acknowledgeAlert: (id) => set(s => ({
    nexusAlerts: s.nexusAlerts.map(a => a.id === id ? { ...a, acknowledged: true } : a),
  })),

  generateReport: (alertId) => {
    const alert = get().nexusAlerts.find(a => a.id === alertId);
    if (!alert) return;
    const report: IntelReport = {
      id:          `rpt-${alertId}-${Date.now()}`,
      eventId:     alertId,
      zone:        alert.zone,
      level:       alert.level,
      category:    alert.type,
      generatedAt: new Date(),
      summary:     alert.aiSummary || `Événement ${alert.type} — ${alert.zone} — niveau ${alert.level}/10`,
      signalCount: alert.signals.length,
      confidence:  alert.confidence,
      sections: [
        {
          title:   "Résumé exécutif",
          content: alert.aiSummary || `Événement ${alert.type} détecté sur ${alert.zone}. Niveau ${alert.level}/10.`,
        },
        {
          title:   "Signaux corrélés",
          content: alert.signals.map((s, i) =>
            `${i + 1}. [${s.source.toUpperCase()}] ${s.text}${s.confidence ? ` — conf. ${Math.round(s.confidence * 100)}%` : ""}`
          ).join("\n"),
        },
        {
          title:   "Analyse de corrélation",
          content: [
            `Spatial:   ${Math.round(alert.correlation.spatial    * 100)}%`,
            `Temporel:  ${Math.round(alert.correlation.temporal   * 100)}%`,
            `NLP:       ${Math.round(alert.correlation.semantic   * 100)}%`,
            `Comporte.: ${Math.round(alert.correlation.behavioral * 100)}%`,
            `Historiq.: ${Math.round(alert.correlation.historical * 100)}%`,
            `Div. src:  ${Math.round(alert.correlation.sourceDiv  * 100)}%`,
            `TOTAL:     ${alert.confidence}%`,
          ].join("\n"),
        },
        {
          title:   "Matches historiques",
          content: alert.historicalMatches.length
            ? alert.historicalMatches.map(m =>
                `• ${m.name} (${m.date}) — sim. ${Math.round(m.similarity * 100)}%\n  ${m.outcome}`
              ).join("\n")
            : "Aucun précédent similaire trouvé dans la base (seuil > 20%).",
        },
        {
          title:   "Recommandations",
          content: alert.level >= 8
            ? "ACTION IMMÉDIATE — Escalade vers analyste senior requise. Vérification ACLED/GDELT en cours."
            : alert.level >= 6
            ? "Surveillance renforcée — briefing toutes les 30min. Croiser avec Telegram OSINT."
            : "Monitoring standard — prochaine revue dans 2h si pas d'escalade.",
        },
      ],
    };
    set(s => ({
      nexusReports: [report, ...s.nexusReports],
      nexusAlerts:  s.nexusAlerts.map(a => a.id === alertId ? { ...a, reportId: report.id } : a),
    }));
  },
});
