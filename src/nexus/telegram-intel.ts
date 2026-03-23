/**
 * NEXUS Telegram Intelligence Engine
 * ─────────────────────────────────────────────────────────────
 * 
 * FONDEMENTS SCIENTIFIQUES:
 * 
 * 1. CREDIBILITÉ MULTI-DIMENSIONNELLE (Harvard/Nature 2024)
 *    Source-credibility info improves truth discernment — Prike et al. 2024
 *    → Score dynamique calculé par credibilityEngine
 * 
 * 2. DETECTION DU PREMIER ÉMETTEUR (Temporal Independent Cascade — ACM 2023)
 *    T-IC Model: identifier les "sentinel nodes"
 *    → Message ID Telegram (séquentiel et global) = clé pour l'ordre temporel
 * 
 * 3. PROPAGATION DES CASCADES (DeepCas / MIT CSAIL)
 *    Identifier les agrégateurs vs. producteurs de contenu original
 *    → Ratio forward/original pour chaque canal
 * 
 * 4. GRAPHE D'INFLUENCE (Network Analysis — Bellingcat/Harvard)
 *    Qui cite qui? Qui poste avant qui? = DAG (Directed Acyclic Graph)
 * 
 * 5. BIAIS ÉDITORIAL (RAND Disinformation Tools / HKS Review)
 *    Tout canal a un biais — l'objectif n'est pas l'absence de biais
 *    mais sa quantification pour pondérer les signaux
 *
 * ARCHITECTURE:
 *   Telethon (Python) → FastAPI → API route → Engine
 *   → Score confiance temps réel → Globe overlay + NexusPanel
 */

import {
  MONITORED_CHANNELS_V4,
  type ChannelMetadata,
  type ChannelBias,
  type ChannelTier,
  type NarrativeCluster,
} from "./telegram-channels-v4";
import {
  credibilityEngine,
  computeBiasPenalty,
  type CredibilityScore,
} from "./credibility-engine";

// ─── Types ──────────────────────────────────────────────────────

export type { ChannelBias, ChannelTier, NarrativeCluster };

export interface TelegramChannel extends ChannelMetadata {
  // Dynamic scores computed by credibilityEngine
  credibilityScore: number;
  firstMoverScore: number;
  accuracyRate: number;
  originalContentRate: number;
  crossVerificationRate: number;
  editorialLayerScore: number;
  sourceProximityScore: number;
  
  // Computed from tracking
  subscribers: number;
  avgPostsPerDay: number;
  medianLeadTimeMinutes: number;
  
  // Network
  forwardedFrom: string[];
  forwardedBy: string[];
  
  // Alias for documentedWarnings for backward compatibility
  warningFlags: string[];
}

export interface EventPrimacy {
  eventHash: string;
  firstChannel: string;
  firstMsgId: number;
  firstTimestamp: Date;
  chainOrder: Array<{
    channelId: string;
    msgId: number;
    timestamp: Date;
    delaySeconds: number;
    isForward: boolean;
    jaccardSimilarity: number;
  }>;
}

export interface TelegramIntelSignal {
  id: string;
  channelId: string;
  channelHandle: string;
  messageText: string;
  mediaUrls: string[];
  timestamp: Date;
  lat?: number;
  lng?: number;
  confidence: number;
  tags: string[];
  eventData?: {
    eventType?: string;
    actor?: string;
    target?: string;
    casualties?: number;
    location?: string;
  };
}

// ─── Channel Registry with Dynamic Scoring ──────────────────────

const channelRegistry = new Map<string, TelegramChannel>();

function initializeRegistry(): void {
  if (channelRegistry.size > 0) return;
  
  for (const meta of MONITORED_CHANNELS_V4) {
    const biasPenalty = computeBiasPenalty(meta.documentedWarnings);
    
    // Base scores from tier and metadata
    const tierBase = meta.tier === "PRIMARY" ? 75 : meta.tier === "SECONDARY" ? 60 : 45;
    
    channelRegistry.set(meta.id, {
      ...meta,
      credibilityScore: Math.max(10, tierBase - biasPenalty * 100),
      firstMoverScore: meta.tier === "PRIMARY" ? 75 : meta.tier === "SECONDARY" ? 55 : 35,
      accuracyRate: tierBase - biasPenalty * 50,
      originalContentRate: meta.tier === "PRIMARY" ? 80 : meta.tier === "SECONDARY" ? 50 : 25,
      crossVerificationRate: tierBase - biasPenalty * 30,
      editorialLayerScore: meta.bias === "ANALYST" ? 85 : meta.bias === "AGGREGATOR" ? 30 : 60,
      sourceProximityScore: meta.tier === "PRIMARY" ? 80 : meta.tier === "SECONDARY" ? 50 : 30,
      subscribers: 100000,
      avgPostsPerDay: 20,
      medianLeadTimeMinutes: meta.tier === "PRIMARY" ? -30 : 15,
      forwardedFrom: [],
      forwardedBy: [],
      warningFlags: meta.documentedWarnings, // Alias for backward compatibility
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────

export function getAllChannels(): TelegramChannel[] {
  initializeRegistry();
  return Array.from(channelRegistry.values());
}

export function getChannel(id: string): TelegramChannel | undefined {
  initializeRegistry();
  return channelRegistry.get(id);
}

export function getChannelByHandle(handle: string): TelegramChannel | undefined {
  initializeRegistry();
  return Array.from(channelRegistry.values()).find(c => c.handle === handle);
}

export function getChannelsByBias(bias: ChannelBias): TelegramChannel[] {
  initializeRegistry();
  return Array.from(channelRegistry.values()).filter(c => c.bias === bias);
}

export function getChannelsByTier(tier: ChannelTier): TelegramChannel[] {
  initializeRegistry();
  return Array.from(channelRegistry.values()).filter(c => c.tier === tier);
}

export function getChannelsByRegion(region: string): TelegramChannel[] {
  initializeRegistry();
  return Array.from(channelRegistry.values()).filter(c => c.regions.includes(region));
}

// ─── Dynamic Credibility Scoring ────────────────────────────────

export function computeDynamicCredibility(channelId: string): CredibilityScore {
  initializeRegistry();
  const channel = channelRegistry.get(channelId);
  if (!channel) {
    return {
      sourceId: channelId,
      score: 50,
      confidence: 0.3,
      components: { accuracy: 50, timeliness: 50, spatial: 50, calibration: 50 },
      trend: 0,
      sampleSize: 0,
    };
  }
  
  return credibilityEngine.computeCredibility(channelId);
}

export function updateChannelFromOutcome(
  channelId: string,
  predictionTimestamp: Date,
  outcome: {
    confirmed: boolean;
    confirmedLat?: number;
    confirmedLng?: number;
    confirmedType?: string;
    confirmationTime?: Date;
    distanceKm?: number;
  }
): void {
  initializeRegistry();
  credibilityEngine.resolvePrediction(channelId, predictionTimestamp, outcome);
  
  // Update channel scores based on new outcome
  const score = computeDynamicCredibility(channelId);
  const channel = channelRegistry.get(channelId);
  if (channel) {
    channel.credibilityScore = score.score;
    channel.accuracyRate = score.components.accuracy;
    // Other scores updated based on tracking data
  }
}

// ─── Signal Processing ───────────────────────────────────────────

export function processTelegramSignal(signal: TelegramIntelSignal): {
  adjustedConfidence: number;
  biasPenalty: number;
  isHighRisk: boolean;
} {
  initializeRegistry();
  
  const channel = getChannelByHandle(signal.channelHandle);
  if (!channel) {
    return { adjustedConfidence: signal.confidence * 0.5, biasPenalty: 0, isHighRisk: false };
  }
  
  const biasPenalty = computeBiasPenalty(channel.documentedWarnings);
  
  // Record prediction for tracking
  credibilityEngine.recordPrediction({
    sourceId: channel.id,
    timestamp: signal.timestamp,
    prediction: {
      lat: signal.lat ?? 0,
      lng: signal.lng ?? 0,
      event_type: signal.eventData?.eventType ?? "unknown",
      confidence: signal.confidence,
    },
  });
  
  // Adjust confidence based on dynamic credibility
  const credibility = computeDynamicCredibility(channel.id);
  const adjustedConfidence = signal.confidence * (credibility.score / 100) * (1 - biasPenalty * 0.5);
  
  const isHighRisk = 
    biasPenalty > 0.25 ||
    channel.documentedWarnings.some(w => 
      w.includes("DISINFORMATION") || 
      w.includes("PROPAGANDA") ||
      w.includes("EXTREMIST")
    );
  
  return {
    adjustedConfidence: Math.max(0.05, Math.min(0.95, adjustedConfidence)),
    biasPenalty,
    isHighRisk,
  };
}

// ─── Event Primacy Detection ─────────────────────────────────────

const eventChains = new Map<string, EventPrimacy>();

export function recordEventPropagation(
  eventHash: string,
  channelId: string,
  msgId: number,
  messageText: string,
  timestamp: Date
): void {
  initializeRegistry();
  
  let chain = eventChains.get(eventHash);
  
  if (!chain) {
    chain = {
      eventHash,
      firstChannel: channelId,
      firstMsgId: msgId,
      firstTimestamp: timestamp,
      chainOrder: [],
    };
    eventChains.set(eventHash, chain);
  }
  
  const isFirst = timestamp.getTime() < chain.firstTimestamp.getTime();
  
  if (isFirst) {
    // Update first mover
    const prevFirst = chain.firstChannel;
    chain.firstChannel = channelId;
    chain.firstMsgId = msgId;
    chain.firstTimestamp = timestamp;
    
    // Push previous first to chain
    if (prevFirst !== channelId) {
      chain.chainOrder.unshift({
        channelId: prevFirst,
        msgId: chain.firstMsgId,
        timestamp: chain.firstTimestamp,
        delaySeconds: 0,
        isForward: false,
        jaccardSimilarity: 1.0,
      });
    }
  } else {
    const delaySeconds = (timestamp.getTime() - chain.firstTimestamp.getTime()) / 1000;
    chain.chainOrder.push({
      channelId,
      msgId,
      timestamp,
      delaySeconds,
      isForward: false,
      jaccardSimilarity: 0.8,
    });
  }
  
  // Update first mover score for the channel
  const channel = channelRegistry.get(channelId);
  if (channel && isFirst) {
    channel.firstMoverScore = Math.min(100, channel.firstMoverScore + 2);
  }
}

export function getEventPrimacy(eventHash: string): EventPrimacy | undefined {
  return eventChains.get(eventHash);
}

/**
 * Detect primacy from an array of messages (for backward compatibility).
 * This is used by the API route to process clusters of messages.
 */
export function detectPrimacy(messages: Array<{
  channelId: string;
  msgId: number;
  timestamp: Date;
  text?: string;
  forwardedFrom?: string;
}>): EventPrimacy | null {
  if (messages.length === 0) return null;
  
  // Sort by timestamp to find first
  const sorted = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  const chain: EventPrimacy = {
    eventHash: `cluster_${sorted[0].msgId}`,
    firstChannel: sorted[0].channelId,
    firstMsgId: sorted[0].msgId,
    firstTimestamp: sorted[0].timestamp,
    chainOrder: [],
  };
  
  // Build chain order
  for (let i = 1; i < sorted.length; i++) {
    const msg = sorted[i];
    chain.chainOrder.push({
      channelId: msg.channelId,
      msgId: msg.msgId,
      timestamp: msg.timestamp,
      delaySeconds: (msg.timestamp.getTime() - chain.firstTimestamp.getTime()) / 1000,
      isForward: !!msg.forwardedFrom,
      jaccardSimilarity: msg.text ? jaccardSimilarity(msg.text, sorted[0].text || "") : 0.5,
    });
  }
  
  return chain;
}

// ─── Utility Functions ───────────────────────────────────────────

export function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const setA = tokenize(a);
  const setB = tokenize(b);
  const inter = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

export function exportTrackingData(): { predictions: [string, unknown[]][] } {
  return credibilityEngine.exportData();
}

export function importTrackingData(data: { predictions: [string, unknown[]][] }): void {
  credibilityEngine.importData(data as { predictions: [string, import("./credibility-engine").SourcePrediction[]][] });
}

// ─── Legacy Exports for Backward Compatibility ───────────────────

// NEXUS_CHANNELS - for backward compatibility with existing code
export const NEXUS_CHANNELS: TelegramChannel[] = getAllChannels();

// computeChannelScore - wrapper for dynamic credibility computation
export function computeChannelScore(channel: TelegramChannel): number {
  const score = computeDynamicCredibility(channel.id);
  return score.score;
}

// DAMAGE_ZONES - placeholder for damage zone data
// This data should come from real APIs (UNOSAT, Sentinel Hub, etc.)
// Currently empty to avoid hardcoded data
export const DAMAGE_ZONES: Array<{
  id: string;
  name: string;
  country?: string;
  lat: number;
  lng: number;
  radiusKm: number;
  destroyedStructures: number;
  damagedStructures: number;
  totalAffected: number;
  severelyDamaged?: number;
  moderatelyDamaged?: number;
  percentageAffected?: number;
  attackType?: string;
  attributedActor?: string;
  weaponSystem?: string[];
  lastUpdate: string;
  lastUpdatedDate?: string;
  confidence: number;
  source: string;
  sources?: string[];
  verifiedBy?: string[];
}> = [];

// ─── Initialize on load ──────────────────────────────────────────

initializeRegistry();

export const CHANNEL_COUNT = channelRegistry.size;
export { MONITORED_CHANNELS_V4 };
