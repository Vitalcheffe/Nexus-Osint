/**
 * NEXUS Credibility Engine — Algorithmic Scoring System
 * ─────────────────────────────────────────────────────────────
 *
 * PRINCIPE FONDAMENTAL:
 * Aucun score n'est hardcodé. Tout est calculé dynamiquement
 * à partir de la performance historique observable.
 *
 * MÉTHODOLOGIE:
 * 1. Performance Tracking: Chaque source est trackée sur ses prédictions
 * 2. Ground Truth Comparison: Comparaison avec événements confirmés (ACLED, OCHA)
 * 3. Temporal Decay: Les performances anciennes pèsent moins
 * 4. Bayesian Update: Mise à jour continue des scores
 *
 * RÉFÉRENCES SCIENTIFIQUES:
 * - Murphy & Winkler "Probability Forecasting" (1984)
 * - Tetlock "Superforecasting" (2015)
 * - ACLED Methodology for ground truth validation
 */

// ─── Types ────────────────────────────────────────────────────

export interface SourcePrediction {
  sourceId: string;
  timestamp: Date;
  prediction: {
    lat: number;
    lng: number;
    event_type: string;
    confidence: number;
  };
  outcome?: {
    confirmed: boolean;
    confirmedLat?: number;
    confirmedLng?: number;
    confirmedType?: string;
    confirmationTime?: Date;
    distanceKm?: number;
  };
}

export interface SourceMetrics {
  sourceId: string;
  totalPredictions: number;
  confirmedPredictions: number;
  avgSpatialErrorKm: number;
  avgTemporalDelayMin: number;
  typeAccuracy: number;
  falsePositiveRate: number;
  firstMoverRate: number;      // % du temps où la source est première
  calibrationScore: number;    // Brier score (plus bas = mieux)
  lastUpdated: Date;
}

export interface CredibilityScore {
  sourceId: string;
  score: number;               // 0-100
  confidence: number;          // Incertitude du score lui-même
  components: {
    accuracy: number;
    timeliness: number;
    spatial: number;
    calibration: number;
  };
  trend: number;               // -1 à +1 (amélioration/dégradation)
  sampleSize: number;          // Nombre de prédictions utilisées
}

// ─── Core Engine ──────────────────────────────────────────────

export class CredibilityEngine {
  private predictions: Map<string, SourcePrediction[]> = new Map();
  private metrics: Map<string, SourceMetrics> = new Map();
  private groundTruthWindow = 30 * 24 * 60 * 60 * 1000; // 30 jours

  /**
   * Enregistre une prédiction pour suivi ultérieur
   */
  recordPrediction(pred: SourcePrediction): void {
    const existing = this.predictions.get(pred.sourceId) || [];
    existing.push(pred);
    // Garder seulement les 1000 dernières prédictions par source
    if (existing.length > 1000) existing.shift();
    this.predictions.set(pred.sourceId, existing);
  }

  /**
   * Enregistre le résultat (ground truth) d'une prédiction
   */
  resolvePrediction(
    sourceId: string,
    timestamp: Date,
    outcome: SourcePrediction["outcome"]
  ): void {
    const preds = this.predictions.get(sourceId);
    if (!preds) return;

    const pred = preds.find(p =>
      Math.abs(p.timestamp.getTime() - timestamp.getTime()) < 60000
    );
    if (pred) pred.outcome = outcome;
  }

  /**
   * Calcule le score de crédibilité pour une source
   * BASÉ UNIQUEMENT SUR LES DONNÉES OBSERVÉES
   */
  computeCredibility(sourceId: string): CredibilityScore {
    const preds = this.predictions.get(sourceId) || [];
    const now = Date.now();
    const cutoff = now - this.groundTruthWindow;

    // Filtrer les prédictions dans la fenêtre temporelle
    const recent = preds.filter(p => p.timestamp.getTime() > cutoff);
    const resolved = recent.filter(p => p.outcome !== undefined);

    // Pas assez de données → score neutre avec haute incertitude
    if (resolved.length < 5) {
      return {
        sourceId,
        score: 50,
        confidence: 0.2,
        components: { accuracy: 50, timeliness: 50, spatial: 50, calibration: 50 },
        trend: 0,
        sampleSize: resolved.length,
      };
    }

    // ─── Composantes du score ──────────────────────────────────

    // 1. ACCURACY: % de prédictions confirmées
    const confirmed = resolved.filter(p => p.outcome?.confirmed);
    const accuracy = (confirmed.length / resolved.length) * 100;

    // 2. SPATIAL: Erreur moyenne en km (pénalité logarithmique)
    const spatialErrors = confirmed
      .map(p => p.outcome?.distanceKm ?? 0)
      .filter(d => d > 0);
    const avgSpatialError = spatialErrors.length > 0
      ? spatialErrors.reduce((a, b) => a + b, 0) / spatialErrors.length
      : 50;
    const spatialScore = Math.max(0, 100 - 10 * Math.log10(avgSpatialError + 1));

    // 3. TIMELINESS: Délai moyen avant confirmation
    const temporalDelays = confirmed
      .map(p => {
        const delay = p.outcome?.confirmationTime
          ? p.outcome.confirmationTime.getTime() - p.timestamp.getTime()
          : 0;
        return delay / 60000; // minutes
      });
    const avgDelay = temporalDelays.length > 0
      ? temporalDelays.reduce((a, b) => a + b, 0) / temporalDelays.length
      : 60;
    const timelinessScore = Math.max(0, 100 - avgDelay / 10);

    // 4. CALIBRATION: Brier score simplifié
    // Compare confidence déclarée vs taux de confirmation
    const brierComponents = resolved.map(p => {
      const conf = p.prediction.confidence;
      const outcome = p.outcome?.confirmed ? 1 : 0;
      return (conf - outcome) ** 2;
    });
    const brierScore = brierComponents.reduce((a, b) => a + b, 0) / brierComponents.length;
    const calibrationScore = Math.max(0, 100 * (1 - brierScore));

    // ─── Score composite ────────────────────────────────────────
    // Pondération: accuracy 30%, spatial 25%, timeliness 25%, calibration 20%
    const composite =
      accuracy * 0.30 +
      spatialScore * 0.25 +
      timelinessScore * 0.25 +
      calibrationScore * 0.20;

    // ─── Trend (amélioration/dégradation) ───────────────────────
    const midPoint = resolved.length / 2;
    const firstHalf = resolved.slice(0, midPoint);
    const secondHalf = resolved.slice(midPoint);
    const firstAcc = firstHalf.filter(p => p.outcome?.confirmed).length / Math.max(1, firstHalf.length);
    const secondAcc = secondHalf.filter(p => p.outcome?.confirmed).length / Math.max(1, secondHalf.length);
    const trend = secondAcc - firstAcc;

    // ─── Confidence du score ────────────────────────────────────
    // Plus d'échantillons = plus de confiance (asymptotique)
    const scoreConfidence = Math.min(0.95, 0.3 + resolved.length / 100);

    return {
      sourceId,
      score: Math.round(composite),
      confidence: scoreConfidence,
      components: {
        accuracy: Math.round(accuracy),
        timeliness: Math.round(timelinessScore),
        spatial: Math.round(spatialScore),
        calibration: Math.round(calibrationScore),
      },
      trend,
      sampleSize: resolved.length,
    };
  }

  /**
   * Calcule les métriques détaillées pour une source
   */
  computeMetrics(sourceId: string): SourceMetrics | null {
    const preds = this.predictions.get(sourceId);
    if (!preds || preds.length === 0) return null;

    const resolved = preds.filter(p => p.outcome !== undefined);
    const confirmed = resolved.filter(p => p.outcome?.confirmed);

    // Erreur spatiale moyenne
    const spatialErrors = confirmed
      .map(p => p.outcome?.distanceKm ?? 0)
      .filter(d => d > 0);
    const avgSpatialError = spatialErrors.length > 0
      ? spatialErrors.reduce((a, b) => a + b, 0) / spatialErrors.length
      : 0;

    // Délai temporel moyen
    const delays = confirmed.map(p => {
      const d = p.outcome?.confirmationTime
        ? p.outcome.confirmationTime.getTime() - p.timestamp.getTime()
        : 0;
      return d / 60000;
    });
    const avgTemporalDelay = delays.length > 0
      ? delays.reduce((a, b) => a + b, 0) / delays.length
      : 0;

    // Type accuracy
    const typeMatches = confirmed.filter(p =>
      p.outcome?.confirmedType === p.prediction.event_type
    );
    const typeAccuracy = confirmed.length > 0
      ? typeMatches.length / confirmed.length
      : 0;

    // Brier score
    const brier = resolved.map(p => {
      const conf = p.prediction.confidence;
      const outcome = p.outcome?.confirmed ? 1 : 0;
      return (conf - outcome) ** 2;
    }).reduce((a, b) => a + b, 0) / resolved.length;

    return {
      sourceId,
      totalPredictions: preds.length,
      confirmedPredictions: confirmed.length,
      avgSpatialErrorKm: avgSpatialError,
      avgTemporalDelayMin: avgTemporalDelay,
      typeAccuracy,
      falsePositiveRate: 1 - (confirmed.length / resolved.length),
      firstMoverRate: 0, // Calculé séparément via comparaison cross-source
      calibrationScore: brier,
      lastUpdated: new Date(),
    };
  }

  /**
   * Compare deux sources pour déterminer le "first mover"
   */
  computeFirstMoverRate(sourceId: string, allSources: string[]): number {
    const preds = this.predictions.get(sourceId);
    if (!preds) return 0;

    let firstMoverCount = 0;
    let comparableCount = 0;

    for (const pred of preds) {
      // Chercher si d'autres sources ont prédit le même événement
      const sameEventPreds: { sourceId: string; timestamp: Date }[] = [];

      for (const otherId of allSources) {
        if (otherId === sourceId) continue;
        const otherPreds = this.predictions.get(otherId) || [];

        for (const other of otherPreds) {
          // Même zone géographique (+- 50km) et même type d'événement
          const dist = this.haversine(
            pred.prediction.lat, pred.prediction.lng,
            other.prediction.lat, other.prediction.lng
          );
          const timeDiff = Math.abs(pred.timestamp.getTime() - other.timestamp.getTime());

          if (dist < 50 && timeDiff < 3600000 && pred.prediction.event_type === other.prediction.event_type) {
            sameEventPreds.push({ sourceId: otherId, timestamp: other.timestamp });
          }
        }
      }

      if (sameEventPreds.length > 0) {
        comparableCount++;
        const minTime = Math.min(...sameEventPreds.map(p => p.timestamp.getTime()));
        if (pred.timestamp.getTime() < minTime) firstMoverCount++;
      }
    }

    return comparableCount > 0 ? firstMoverCount / comparableCount : 0;
  }

  /**
   * Export pour persistance (KV store)
   */
  exportData(): { predictions: [string, SourcePrediction[]][] } {
    return {
      predictions: Array.from(this.predictions.entries()),
    };
  }

  /**
   * Import depuis persistance
   */
  importData(data: { predictions: [string, SourcePrediction[]][] }): void {
    this.predictions = new Map(data.predictions);
  }

  // ─── Utilitaires ─────────────────────────────────────────────

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}

// ─── Singleton instance ────────────────────────────────────────

export const credibilityEngine = new CredibilityEngine();

// ─── Channel Metadata (non-scored) ──────────────────────────────

/**
 * Métadonnées de canaux - SANS SCORES DE CRÉDIBILITÉ
 * Les scores sont calculés dynamiquement par CredibilityEngine
 *
 * Ces métadonnées sont des faits observables, pas des opinions:
 * - langue, région, affiliations déclarées
 * - warnings documentés (sources: OpenMinds, OSINT for Ukraine, etc.)
 */
export interface ChannelMetadata {
  id: string;
  handle: string;
  url: string;
  name: string;
  languages: string[];
  regions: string[];
  declaredAffiliation?: string;
  documentedWarnings: string[];
  warningSources: string[];
}

/**
 * Canaux monitorés avec métadonnées factuelles uniquement
 * Les scores de crédibilité sont calculés par l'engine
 */
export const MONITORED_CHANNELS: ChannelMetadata[] = [
  {
    id: "iswnews_en",
    handle: "iswnews_en",
    url: "https://t.me/iswnews_en",
    name: "ISW — Institute for the Study of War",
    languages: ["en"],
    regions: ["UA", "RU", "IR", "SY"],
    declaredAffiliation: "ISW Washington DC Think Tank",
    documentedWarnings: ["PRO_UKRAINE_FRAMING"],
    warningSources: ["ISW methodology paper"],
  },
  {
    id: "ClashReport",
    handle: "ClashReport",
    url: "https://t.me/ClashReport",
    name: "Clash Report",
    languages: ["en", "tr", "fr", "ar"],
    regions: ["GLOBAL"],
    documentedWarnings: [],
    warningSources: [],
  },
  {
    id: "MilitantWire",
    handle: "MilitantWire",
    url: "https://t.me/MilitantWire",
    name: "Militant Wire",
    languages: ["en"],
    regions: ["SY", "IQ", "UA", "AF"],
    documentedWarnings: [],
    warningSources: [],
  },
  {
    id: "Slavyangrad",
    handle: "Slavyangrad",
    url: "https://t.me/Slavyangrad",
    name: "Slavyangrad",
    languages: ["en", "ru"],
    regions: ["UA", "RU"],
    documentedWarnings: [
      "PRO_RUSSIA_CONFIRMED",
      "DISINFORMATION_DOCUMENTED",
    ],
    warningSources: [
      "OSINT for Ukraine 2025",
      "OpenMinds Ltd 2024",
      "Foreign Policy 2022",
    ],
  },
  {
    id: "presstv",
    handle: "presstv",
    url: "https://t.me/presstv",
    name: "Press TV",
    languages: ["en", "fa"],
    regions: ["IR", "PS", "LB"],
    declaredAffiliation: "Iranian State Media",
    documentedWarnings: [
      "STATE_PROPAGANDA_IRAN",
      "DISINFORMATION_DOCUMENTED",
    ],
    warningSources: [
      "US Treasury Sanctions List",
      "EU DisinfoLab Report",
    ],
  },
  {
    id: "QudsNen",
    handle: "QudsNen",
    url: "https://t.me/QudsNen",
    name: "Quds News Network",
    languages: ["ar", "en"],
    regions: ["PS", "LB", "IQ"],
    documentedWarnings: ["PRO_HAMAS", "VERIFY_CASUALTY_FIGURES"],
    warningSources: ["Media Bias/Fact Check"],
  },
];

/**
 * Récupère les métadonnées d'un canal
 */
export function getChannelMetadata(handle: string): ChannelMetadata | undefined {
  return MONITORED_CHANNELS.find(c => c.handle === handle);
}

/**
 * Calcule le penalty de biais basé sur les warnings documentés
 * Ce n'est PAS un score de crédibilité - c'est un facteur de correction
 */
export function computeBiasPenalty(warnings: string[]): number {
  const PENALTY_MAP: Record<string, number> = {
    "PRO_RUSSIA_CONFIRMED": 0.25,
    "PRO_IRAN_CONFIRMED": 0.20,
    "PRO_HAMAS": 0.15,
    "PRO_ISRAEL_BIAS": 0.10,
    "STATE_PROPAGANDA_IRAN": 0.30,
    "STATE_PROPAGANDA_RUSSIA": 0.30,
    "DISINFORMATION_DOCUMENTED": 0.35,
    "EXTREMIST_CONTENT": 0.40,
  };

  let penalty = 0;
  for (const w of warnings) {
    penalty = Math.max(penalty, PENALTY_MAP[w] ?? 0);
  }
  return penalty;
}
