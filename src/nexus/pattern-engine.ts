/**
 * NEXUS Pattern Detection Engine
 * ─────────────────────────────────────────────────────────────
 *
 * PRINCIPE: Pas de patterns historiques hardcodés.
 * Les similarités sont calculées dynamiquement par:
 * 1. Embeddings vectoriels des événements passés
 * 2. Clustering des caractéristiques communes
 * 3. Scoring de similarité cosine
 *
 * SOURCES DE DONNÉES:
 * - ACLED historical events (2018-2024)
 * - GDELT event database
 * - UNOSAT damage assessments
 *
 * RÉFÉRENCES:
 * - "Event embedding for conflict prediction" (ArXiv 2024)
 * - ViEWS methodology (PRIO Oslo)
 */

import { embed, cosineSimilarity } from "@/lib/embeddings";

// ─── Types ────────────────────────────────────────────────────

export interface HistoricalEvent {
  id: string;
  date: Date;
  countryCode: string;
  zoneName: string;
  eventTypes: string[];
  actorCount: number;
  fatalities: number;
  duration: number;           // Durée du conflit en jours
  outcome: "escalation" | "deescalation" | "stable" | "resolved";
  embedding?: number[];       // Vector embedding
}

export interface PatternMatch {
  historicalEvent: HistoricalEvent;
  similarity: number;         // 0-1
  matchingFactors: string[];
  divergenceFactors: string[];
  predictedOutcome: string;
  confidence: number;
}

export interface EventSignature {
  spatial: { lat: number; lng: number; radiusKm: number };
  temporal: { start: Date; peak: Date | null };
  categorical: {
    eventTypes: string[];
    actors: string[];
    fatalitiesRange: [number, number];
  };
  intensity: {
    eventCount: number;
    sourceDiversity: number;
    mediaVolume: number;
  };
}

// ─── Engine ────────────────────────────────────────────────────

export class PatternEngine {
  private historicalEvents: HistoricalEvent[] = [];
  private embeddingsCache: Map<string, number[]> = new Map();
  private initialized = false;

  /**
   * Initialise le moteur avec les données historiques
   * En production, ces données viendraient d'une base de données
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Charger les événements historiques depuis ACLED (si configuré)
    // Sinon, utiliser un ensemble minimal de patterns génériques
    await this.loadHistoricalEvents();
    this.initialized = true;
  }

  /**
   * Charge les événements historiques depuis les sources
   */
  private async loadHistoricalEvents(): Promise<void> {
    const acledKey = process.env.ACLED_API_KEY;
    const acledEmail = process.env.ACLED_EMAIL;

    if (acledKey && acledEmail) {
      // Charger les événements majeurs des 5 dernières années
      const now = new Date();
      const fiveYearsAgo = new Date(now.getTime() - 5 * 365 * 86400000);

      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      // Top 20 pays les plus conflictuels
      const countries = [
        "Ukraine", "Syria", "Yemen", "Afghanistan", "Somalia",
        "Iraq", "Nigeria", "Democratic Republic of Congo", "Sudan", "South Sudan",
        "Myanmar", "Ethiopia", "Mali", "Central African Republic", "Libya",
        "Palestine", "Israel", "Lebanon", "Iran", "Russia"
      ];

      for (const country of countries.slice(0, 10)) { // Limiter pour demo
        try {
          const url = [
            `https://api.acleddata.com/acled/read/`,
            `?key=${encodeURIComponent(acledKey)}`,
            `&email=${encodeURIComponent(acledEmail)}`,
            `&country=${encodeURIComponent(country)}`,
            `&event_date=${fmt(fiveYearsAgo)}|${fmt(now)}`,
            `&event_date_where=BETWEEN`,
            `&limit=100`,
          ].join("");

          const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) continue;

          const json = await res.json() as { data?: Record<string, string | number>[] };

          // Agréger les événements par mois/pays pour créer des "patterns"
          const events = json.data || [];

          // Grouper par période
          const byPeriod = new Map<string, typeof events>();
          events.forEach(e => {
            const period = String(e.event_date).slice(0, 7); // YYYY-MM
            if (!byPeriod.has(period)) byPeriod.set(period, []);
            byPeriod.get(period)!.push(e);
          });

          // Créer des événements historiques agrégés
          for (const [period, periodEvents] of byPeriod) {
            const fatalities = periodEvents.reduce(
              (s, e) => s + (parseInt(String(e.fatalities)) || 0), 0
            );

            // Ne garder que les événements significatifs
            if (fatalities < 50 && periodEvents.length < 10) continue;

            const actors = new Set<string>();
            const types = new Set<string>();
            periodEvents.forEach(e => {
              if (e.actor1) actors.add(String(e.actor1));
              if (e.actor2) actors.add(String(e.actor2));
              if (e.event_type) types.add(String(e.event_type));
            });

            // Calculer l'outcome (approximation: comparer avec période suivante)
            const nextPeriod = this.incrementMonth(period);
            const nextEvents = byPeriod.get(nextPeriod) || [];
            const nextFatalities = nextEvents.reduce(
              (s, e) => s + (parseInt(String(e.fatalities)) || 0), 0
            );

            let outcome: HistoricalEvent["outcome"] = "stable";
            if (nextFatalities > fatalities * 1.5) outcome = "escalation";
            else if (nextFatalities < fatalities * 0.5) outcome = "deescalation";
            else if (nextEvents.length === 0) outcome = "resolved";

            this.historicalEvents.push({
              id: `acled_${country}_${period}`,
              date: new Date(period + "-01"),
              countryCode: String(periodEvents[0]?.iso || "XX"),
              zoneName: country,
              eventTypes: Array.from(types),
              actorCount: actors.size,
              fatalities,
              duration: 30, // Approximation
              outcome,
            });
          }
        } catch {
          // Continue avec les autres pays
        }
      }
    }

    // Si aucun événement n'a été chargé, utiliser des patterns génériques
    if (this.historicalEvents.length === 0) {
      this.loadGenericPatterns();
    }
  }

  /**
   * Patterns génériques - Utilisés uniquement si ACLED non configuré
   * Ces patterns sont basés sur des observations générales, pas des événements spécifiques
   */
  private loadGenericPatterns(): void {
    // Les patterns génériques sont des abstractions, pas des événements réels
    this.historicalEvents = [
      {
        id: "pattern_airstrike",
        date: new Date("2024-01-01"),
        countryCode: "XX",
        zoneName: "Generic Airstrike Pattern",
        eventTypes: ["Air/Drone strike", "Explosions/Remote violence"],
        actorCount: 2,
        fatalities: 100,
        duration: 3,
        outcome: "escalation",
      },
      {
        id: "pattern_ground_offensive",
        date: new Date("2024-01-01"),
        countryCode: "XX",
        zoneName: "Generic Ground Offensive",
        eventTypes: ["Battles", "Armed clash"],
        actorCount: 4,
        fatalities: 500,
        duration: 14,
        outcome: "escalation",
      },
      {
        id: "pattern_ceasefire",
        date: new Date("2024-01-01"),
        countryCode: "XX",
        zoneName: "Generic Ceasefire Pattern",
        eventTypes: ["Peaceful protest", "Agreement"],
        actorCount: 2,
        fatalities: 0,
        duration: 1,
        outcome: "deescalation",
      },
    ];
  }

  private incrementMonth(period: string): string {
    const [year, month] = period.split("-").map(Number);
    if (month === 12) return `${year + 1}-01`;
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }

  /**
   * Trouve les patterns similaires dans l'historique
   */
  async findSimilarPatterns(
    signature: EventSignature,
    topK = 5
  ): Promise<PatternMatch[]> {
    await this.initialize();

    // Créer un embedding de la signature
    const signatureText = this.signatureToText(signature);
    const signatureEmbedding = await this.getEmbedding(signatureText);

    // Calculer la similarité avec tous les événements historiques
    const similarities: Array<{ event: HistoricalEvent; similarity: number; factors: string[] }> = [];

    for (const event of this.historicalEvents) {
      const eventEmbedding = await this.getEventEmbedding(event);
      const similarity = cosineSimilarity(signatureEmbedding, eventEmbedding);

      // Identifier les facteurs de correspondance
      const factors = this.identifyMatchingFactors(signature, event);

      similarities.push({ event, similarity, factors });
    }

    // Trier par similarité et prendre le top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topMatches = similarities.slice(0, topK);

    return topMatches.map(({ event, similarity, factors }) => {
      const divergenceFactors = this.identifyDivergenceFactors(signature, event);

      return {
        historicalEvent: event,
        similarity,
        matchingFactors: factors,
        divergenceFactors,
        predictedOutcome: this.predictOutcome(event, similarity),
        confidence: this.computeConfidence(similarity, event),
      };
    });
  }

  /**
   * Convertit une signature en texte pour embedding
   */
  private signatureToText(sig: EventSignature): string {
    const parts = [
      `Events: ${sig.categorical.eventTypes.join(", ")}`,
      `Actors: ${sig.categorical.actors.join(", ")}`,
      `Fatalities: ${sig.categorical.fatalitiesRange[0]}-${sig.categorical.fatalitiesRange[1]}`,
      `Event count: ${sig.intensity.eventCount}`,
      `Sources: ${sig.intensity.sourceDiversity}`,
    ];
    return parts.join(". ");
  }

  /**
   * Obtient l'embedding d'un événement (avec cache)
   */
  private async getEventEmbedding(event: HistoricalEvent): Promise<number[]> {
    if (event.embedding) return event.embedding;

    const cached = this.embeddingsCache.get(event.id);
    if (cached) return cached;

    const text = [
      event.zoneName,
      ...event.eventTypes,
      `${event.actorCount} actors`,
      `${event.fatalities} fatalities`,
      event.outcome,
    ].join(" ");

    const embedding = await this.getEmbedding(text);
    event.embedding = embedding;
    this.embeddingsCache.set(event.id, embedding);

    return embedding;
  }

  /**
   * Obtient un embedding (wrapper autour de la lib d'embeddings)
   */
  private async getEmbedding(text: string): Promise<number[]> {
    try {
      const vec = await embed(text);
      return vec ? Array.from(vec) : this.getFallbackEmbedding(text);
    } catch {
      return this.getFallbackEmbedding(text);
    }
  }

  /**
   * Embedding de fallback (hash simple)
   */
  private getFallbackEmbedding(text: string): number[] {
    // Simple hash-based pseudo-embedding (384 dimensions)
    const dims = 384;
    const embedding: number[] = new Array(dims).fill(0);
    const words = text.toLowerCase().split(/\W+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % dims;
      embedding[idx] += 1 / (i + 1);
    }

    // Normaliser
    const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
    return embedding.map(x => x / (norm || 1));
  }

  /**
   * Identifie les facteurs de correspondance
   */
  private identifyMatchingFactors(
    signature: EventSignature,
    event: HistoricalEvent
  ): string[] {
    const factors: string[] = [];

    // Types d'événements communs
    const commonTypes = signature.categorical.eventTypes.filter(
      t => event.eventTypes.includes(t)
    );
    if (commonTypes.length > 0) {
      factors.push(`Event types: ${commonTypes.join(", ")}`);
    }

    // Fourchette de mortalité similaire
    const [minFatal, maxFatal] = signature.categorical.fatalitiesRange;
    if (event.fatalities >= minFatal * 0.5 && event.fatalities <= maxFatal * 2) {
      factors.push(`Similar casualty range (${event.fatalities} fatalities)`);
    }

    // Nombre d'acteurs similaire
    if (Math.abs(event.actorCount - signature.categorical.actors.length) <= 2) {
      factors.push(`Similar actor count (${event.actorCount})`);
    }

    // Intensité similaire
    if (Math.abs(event.fatalities / 100 - signature.intensity.eventCount / 50) < 0.3) {
      factors.push("Similar intensity level");
    }

    return factors.length > 0 ? factors : ["No strong matching factors"];
  }

  /**
   * Identifie les facteurs de divergence
   */
  private identifyDivergenceFactors(
    signature: EventSignature,
    event: HistoricalEvent
  ): string[] {
    const factors: string[] = [];

    // Fourchette de mortalité différente
    const [minFatal, maxFatal] = signature.categorical.fatalitiesRange;
    if (event.fatalities < minFatal * 0.3 || event.fatalities > maxFatal * 3) {
      factors.push(`Different casualty scale (${event.fatalities} vs ${minFatal}-${maxFatal})`);
    }

    // Contexte temporel différent
    const yearsDiff = Math.abs(
      new Date().getFullYear() - event.date.getFullYear()
    );
    if (yearsDiff > 2) {
      factors.push(`Historical precedent from ${yearsDiff} years ago`);
    }

    // Types d'événements différents
    const commonTypes = signature.categorical.eventTypes.filter(
      t => event.eventTypes.includes(t)
    );
    if (commonTypes.length === 0) {
      factors.push("Different event types");
    }

    return factors;
  }

  /**
   * Prédit l'issue basée sur le pattern
   */
  private predictOutcome(event: HistoricalEvent, similarity: number): string {
    if (similarity < 0.3) return "Insufficient similarity for prediction";

    switch (event.outcome) {
      case "escalation":
        return `Potential escalation (pattern: ${event.zoneName}, ${event.date.getFullYear()})`;
      case "deescalation":
        return `Likely deescalation (pattern: ${event.zoneName}, ${event.date.getFullYear()})`;
      case "resolved":
        return `May resolve quickly (pattern: ${event.zoneName}, ${event.date.getFullYear()})`;
      default:
        return `May remain stable (pattern: ${event.zoneName}, ${event.date.getFullYear()})`;
    }
  }

  /**
   * Calcule la confiance dans la prédiction
   */
  private computeConfidence(similarity: number, event: HistoricalEvent): number {
    // Confiance basée sur:
    // - Similarité (40%)
    // - Récence de l'événement (30%)
    // - Qualité des données (30%)

    const recency = Math.max(0, 1 - (Date.now() - event.date.getTime()) / (5 * 365 * 86400000));
    const dataQuality = event.fatalities > 0 ? 1 : 0.5;

    return similarity * 0.4 + recency * 0.3 + dataQuality * 0.3;
  }

  /**
   * Nettoie le cache
   */
  clearCache(): void {
    this.embeddingsCache.clear();
    this.historicalEvents = [];
    this.initialized = false;
  }
}

// ─── Singleton ──────────────────────────────────────────────────

export const patternEngine = new PatternEngine();
