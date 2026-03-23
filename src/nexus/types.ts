// ─── Signal Types ──────────────────────────────────────────────

export type SignalSource =
  | "aviation" | "maritime" | "satellite" | "gpsjam" | "notam"
  | "social_x" | "social_telegram" | "social_tiktok" | "social_vk"
  | "social_weibo" | "social_reddit" | "social_discord" | "social_4chan"
  | "economic_oil" | "economic_gold" | "economic_wheat" | "economic_bdi"
  | "economic_defense" | "economic_crypto"
  | "camera_ip" | "camera_traffic" | "camera_youtube" | "camera_port"
  | "gdelt" | "noaa" | "usgs" | "nasa_firms" | "sdr_radio"
  | "absence_ads_b" | "absence_ais" | "absence_social"
  | "private_jets" | "fastfood_pentagon" | "nightlights" | "dark_web"
  | "acled" | "wikipedia_edits" | "netblocks" | "cloudflare_radar"
  | "yahoo_finance" | "sentinel_hub" | "reliefweb" | "views_prio";

export interface NexusSignal {
  id: string;
  source: SignalSource;
  lat: number;
  lng: number;
  radiusKm: number;
  eventTime: Date;
  ingestTime: Date;
  description: string;
  confidence: number;
  payload: Record<string, unknown>;
  evidenceUrl?: string;
  tags?: string[];
}

// ─── Source Metadata ───────────────────────────────────────────

export const SOURCE_META: Record<string, { name: string; weight: number; latency: string; free: boolean }> = {
  aviation:          { name: "ADS-B OpenSky",           weight: 0.85, latency: "< 5s",    free: true  },
  maritime:          { name: "AIS Stream",               weight: 0.80, latency: "< 10s",   free: true  },
  satellite:         { name: "NORAD TLE",                weight: 0.90, latency: "~1h",     free: true  },
  gpsjam:            { name: "GPS Jamming",              weight: 0.88, latency: "30min",   free: true  },
  notam:             { name: "NOTAM FAA",                weight: 0.95, latency: "< 1min",  free: true  },
  social_x:          { name: "Twitter/X",                weight: 0.65, latency: "< 30s",   free: false },
  social_telegram:   { name: "Telegram",                 weight: 0.78, latency: "< 5s",    free: false },
  social_tiktok:     { name: "TikTok + Vision IA",       weight: 0.60, latency: "< 2min",  free: true  },
  social_vk:         { name: "VK Monitor",               weight: 0.70, latency: "< 30s",   free: false },
  social_weibo:      { name: "Weibo",                    weight: 0.60, latency: "< 10min", free: false },
  social_reddit:     { name: "Reddit",                   weight: 0.55, latency: "< 1min",  free: true  },
  social_discord:    { name: "Discord",                  weight: 0.55, latency: "< 5s",    free: true  },
  social_4chan:      { name: "4chan",                    weight: 0.45, latency: "< 1min",  free: true  },
  economic_oil:      { name: "Pétrole Brent/WTI",        weight: 0.70, latency: "1min",    free: true  },
  economic_gold:     { name: "Or / XAU",                 weight: 0.65, latency: "1min",    free: true  },
  economic_wheat:    { name: "Blé / Maïs",               weight: 0.60, latency: "15min",   free: true  },
  economic_bdi:      { name: "Baltic Dry Index",          weight: 0.68, latency: "Daily",   free: true  },
  economic_defense:  { name: "Défense (LMT/RTX/NOC)",   weight: 0.72, latency: "1min",    free: true  },
  economic_crypto:   { name: "Crypto BTC/ETH",           weight: 0.50, latency: "30s",     free: true  },
  camera_ip:         { name: "Caméras IP publiques",     weight: 0.80, latency: "Live",    free: true  },
  camera_youtube:    { name: "YouTube Lives",            weight: 0.70, latency: "Live",    free: true  },
  camera_traffic:    { name: "Cams trafic DOT/TfL",      weight: 0.75, latency: "Live",    free: true  },
  camera_port:       { name: "Caméras ports",            weight: 0.78, latency: "Live",    free: true  },
  gdelt:             { name: "GDELT 2.0",                weight: 0.62, latency: "15min",   free: true  },
  noaa:              { name: "NOAA Météo",               weight: 0.82, latency: "1h",      free: true  },
  usgs:              { name: "USGS Sismique",            weight: 0.90, latency: "< 30s",   free: true  },
  nasa_firms:        { name: "NASA FIRMS VIIRS",         weight: 0.85, latency: "< 3h",    free: true  },
  sdr_radio:         { name: "SDR Radio",                weight: 0.65, latency: "Live",    free: true  },
  absence_ads_b:     { name: "Void ADS-B",              weight: 0.92, latency: "< 5min",  free: true  },
  absence_ais:       { name: "Dark Ship AIS",            weight: 0.88, latency: "< 30min", free: true  },
  absence_social:    { name: "Silence social",           weight: 0.78, latency: "< 5min",  free: true  },
  private_jets:      { name: "Jets privés",              weight: 0.78, latency: "< 5s",    free: true  },
  fastfood_pentagon: { name: "Fast-food Pentagon",       weight: 0.45, latency: "~1h",     free: false },
  nightlights:       { name: "NASA Black Marble",        weight: 0.82, latency: "Daily",   free: true  },
  dark_web:          { name: "Dark Web",                 weight: 0.60, latency: "Variable", free: true },
  acled:             { name: "ACLED",                    weight: 0.94, latency: "1h",      free: true  },
  wikipedia_edits:   { name: "Wikipedia Velocity",       weight: 0.72, latency: "< 2min",  free: true  },
  netblocks:         { name: "NetBlocks",                weight: 0.88, latency: "5min",    free: true  },
  cloudflare_radar:  { name: "Cloudflare Radar",         weight: 0.82, latency: "1min",    free: true  },
  yahoo_finance:     { name: "Yahoo Finance",            weight: 0.70, latency: "1min",    free: true  },
  sentinel_hub:      { name: "Sentinel Hub ESA",         weight: 0.88, latency: "Daily",   free: true  },
  reliefweb:         { name: "UN OCHA ReliefWeb",        weight: 0.80, latency: "1h",      free: true  },
  views_prio:        { name: "ViEWS PRIO Oslo",          weight: 0.87, latency: "Monthly", free: true  },
};

// ─── Alert Types ───────────────────────────────────────────────

export interface CorrelationScore {
  spatial: number;
  temporal: number;
  semantic: number;
  behavioral: number;
  historical: number;
  sourceDiv: number;
  total: number;
}

export type AlertLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type AlertCategory =
  | "MILITAIRE" | "GÉOPOLITIQUE" | "CONFLIT_ARMÉ" | "MARITIME" | "NATUREL"
  | "CYBER" | "ÉCONOMIQUE" | "ABSENCE_SIGNAL" | "TERRORISME" | "SURVEILLANCE" | "ESPACE";

export const ALERT_COLOR: Record<number, string> = {
  10: "#dc2626", 9: "#ef4444", 8: "#f97316", 7: "#f59e0b",
  6: "#eab308", 5: "#84cc16", 4: "#4ade80", 3: "#22d3ee", 2: "#3b82f6", 1: "#94a3b8",
};

export const ALERT_LABEL: Record<number, string> = {
  10: "EXTINCTION", 9: "CRITIQUE", 8: "SÉVÈRE", 7: "ÉLEVÉ",
  6: "MODÉRÉ", 5: "SURVEILLANCE", 4: "FAIBLE", 3: "INFO", 2: "LOG", 1: "TRACE",
};

export function scoreToLevel(s: number): AlertLevel {
  if (s >= 0.97) return 10; if (s >= 0.92) return 9; if (s >= 0.85) return 8;
  if (s >= 0.76) return 7;  if (s >= 0.65) return 6; if (s >= 0.53) return 5;
  if (s >= 0.42) return 4;  if (s >= 0.30) return 3; if (s >= 0.18) return 2;
  return 1;
}

// ─── Event Types ────────────────────────────────────────────────

export interface HistoricalMatch {
  name: string;
  date: string;
  similarity: number;
  outcome: string;
  falsePositiveRate: number;
}

export interface NexusEvent {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  lat: number;
  lng: number;
  radiusKm: number;
  zone: string;
  country: string;
  signals: NexusSignal[];
  correlation: CorrelationScore;
  explanation: string;
  aiSummary: string;
  historicalMatches: HistoricalMatch[];
  detectedAt: Date;
  updatedAt: Date;
  status: "active" | "acknowledged" | "dismissed" | "confirmed" | "archive";
  notified: boolean;
  swarmActive: boolean;
  reportId?: string;
}

// ─── Source Health Types ────────────────────────────────────────

export interface SourceHealth {
  source: SignalSource;
  name: string;
  active: boolean;
  configured: boolean;
  lastUpdate: Date | null;
  signalsPerHour: number;
  errorRate: number;
  latencyMs: number;
  envVar?: string;
}

// ─── Agent Task Types ───────────────────────────────────────────

export type AgentTaskType = "collect" | "archive" | "translate" | "geolocate" | "report";

export interface AgentTask {
  id: string;
  eventId: string;
  type: AgentTaskType;
  status: "pending" | "running" | "done" | "failed";
  startTime: Date;
  endTime?: Date;
  result?: string;
}

// ─── Zone Types (for dynamic zone engine integration) ───────────

export interface ZoneInfo {
  name: string;
  country: string;
  lat: number;
  lng: number;
  radiusKm: number;
  baseline?: number;
  trend?: number;
}

// ─── Category Classification Types ──────────────────────────────

export interface CategoryTermSet {
  category: AlertCategory;
  terms: string[];
  weight: number;
}

// ─── Re-export engine types ─────────────────────────────────────

export type {
  SourcePrediction,
  SourceMetrics,
  CredibilityScore,
  ChannelMetadata,
} from "./credibility-engine";

export type {
  ConflictBaseline,
  ZoneActivity,
  GlobalConflictIndex,
} from "./dynamic-baseline";

export type {
  Signal as DynamicSignal,
  DetectedZone,
  ZoneEvolution,
} from "./dynamic-zone";

export type {
  HistoricalEvent,
  PatternMatch,
  EventSignature,
} from "./pattern-engine";
