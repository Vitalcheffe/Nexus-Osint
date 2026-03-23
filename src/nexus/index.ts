export { credibilityEngine, CredibilityEngine } from "./credibility-engine";
export type { SourcePrediction, SourceMetrics, CredibilityScore, ChannelMetadata } from "./credibility-engine";
export { MONITORED_CHANNELS, getChannelMetadata, computeBiasPenalty } from "./credibility-engine";

export { dynamicBaselineEngine, DynamicBaselineEngine } from "./dynamic-baseline";
export type { ConflictBaseline, ZoneActivity, GlobalConflictIndex } from "./dynamic-baseline";

export { dynamicZoneEngine, DynamicZoneEngine } from "./dynamic-zone";
export type { Signal as DynamicSignal, DetectedZone, ZoneEvolution } from "./dynamic-zone";

export { patternEngine, PatternEngine } from "./pattern-engine";
export type { HistoricalEvent, PatternMatch, EventSignature } from "./pattern-engine";

export { nexusEngine, NexusEngine } from "./engine";
export type {
  NexusSignal,
  NexusEvent,
  CorrelationScore,
  AlertLevel,
  AlertCategory,
  HistoricalMatch,
  SourceHealth,
  AgentTask,
  AgentTaskType,
  ZoneInfo,
} from "./types";
export { scoreToLevel, SOURCE_META, ALERT_COLOR, ALERT_LABEL } from "./types";

export {
  LDA_CONFLICT_TOPICS,
  scoreLDA,
  analyzeVelocity,
  predictViEWS,
  predictViEWSSync,
  detectAnomaly,
  detectCIB,
  buildRAGContext,
  scoreSentinelAnomaly,
  classifyCAMEO,
  CAMEO_CATEGORIES,
  enrichSignal,
  CUSUMDetector,
} from "./science-engine";
export type {
  LDATopicScore,
  VelocityAnalysis,
  ViEWSPrediction,
  AnomalySignal,
  CIBScore,
  RAGContext,
  ACLEDEvent,
  GDELTEvent,
  SentinelAnomalyScore,
  EnrichedSignalData,
} from "./science-engine";

export {
  getAllChannels,
  getChannel,
  getChannelByHandle,
  getChannelsByBias,
  getChannelsByTier,
  getChannelsByRegion,
  computeDynamicCredibility,
  updateChannelFromOutcome,
  processTelegramSignal,
  recordEventPropagation,
  getEventPrimacy,
  jaccardSimilarity,
  CHANNEL_COUNT,
  MONITORED_CHANNELS_V4,
} from "./telegram-intel";
export type { TelegramChannel, TelegramIntelSignal, EventPrimacy } from "./telegram-intel";
export type { ChannelBias, ChannelTier, NarrativeCluster } from "./telegram-channels-v4";

export {
  NEXUS_SOURCES,
  getSourceById,
  getSourcesByCategory,
  getHighSignalSources,
  getFreeSources,
  SOURCE_COUNT,
  CATEGORY_STATS,
  QUICK_START_SOURCES,
  ZERO_CONFIG_SOURCES,
} from "./data-sources";
export type { DataSourceConfig, SourceCategory } from "./data-sources";

export { graphEngine, GraphKnowledgeEngine } from "./graph-engine";
export type {
  EntityType,
  RelationType,
  GraphNode,
  GraphEdge,
  GraphPath,
  Community,
  EntityMatch,
} from "./graph-engine";

export { federatedSearch, FederatedSearchEngine } from "./federated-search";
export type {
  SearchSource,
  SearchQuery,
  SearchResult,
  SearchResponse,
  SourceConnector,
} from "./federated-search";

export { StixMapper, stixMapper, convertEventToStix, convertSignalToStix } from "./stix-integration";
export type {
  StixType,
  StixObject,
  StixBundle,
  StixIdentity,
  StixIndicator,
  StixLocation,
  StixThreatActor,
  StixRelationship,
  StixObservedData,
  StixReport,
  StixSighting,
  StixKillChainPhase,
  StixExternalReference,
} from "./stix-integration";

export { initNexusBridge, destroyNexusBridge, nexusBridge } from "./bridge";

import { dynamicBaselineEngine } from "./dynamic-baseline";
import { dynamicZoneEngine } from "./dynamic-zone";
import { patternEngine } from "./pattern-engine";

export async function initializeNexusEngines(): Promise<void> {
  await patternEngine.initialize();
  const priorityCountries = ["UA", "PS", "IL", "SY", "YE", "IR", "RU", "SD", "MM", "AF"];
  await Promise.all(priorityCountries.map(c => dynamicBaselineEngine.computeBaseline(c)));
}

export async function getNexusSnapshot(): Promise<{
  activeZones: number;
  globalIndex: number;
  topTrending: string[];
  timestamp: Date;
}> {
  const zones = dynamicZoneEngine.getActiveZones();
  const priorityCountries = ["UA", "PS", "IL", "SY", "YE", "IR", "RU"];
  const index = await dynamicBaselineEngine.computeGlobalIndex(priorityCountries);
  return {
    activeZones: zones.length,
    globalIndex: index.overall,
    topTrending: index.trending,
    timestamp: new Date(),
  };
}
