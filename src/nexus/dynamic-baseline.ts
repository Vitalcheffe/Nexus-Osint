/**
 * NEXUS Dynamic Baseline Engine
 * ─────────────────────────────────────────────────────────────
 *
 * PRINCIPE: Aucune baseline hardcodée.
 * Toutes les statistiques sont calculées depuis les données réelles.
 *
 * SOURCES DE DONNÉES:
 * - ACLED: Événements de conflit géocodés (ground truth)
 * - GDELT: Couverture médiatique globale
 * - UN OCHA: Crises humanitaires
 *
 * MÉTHODOLOGIE:
 * La baseline de violence pour un pays/zone est calculée comme:
 *   baseline = f(event_count, fatalities, actor_diversity, recency)
 *
 * RÉFÉRENCES:
 * - ViEWS Methodology (PRIO Oslo)
 * - ACLED Codebook
 * - GDELT 2.0 Documentation
 */

// ─── Types ────────────────────────────────────────────────────

export interface ConflictBaseline {
  countryCode: string;
  countryName: string;
  eventCount30d: number;
  eventCount90d: number;
  fatalities30d: number;
  fatalities90d: number;
  actorCount: number;
  actorDiversity: number;      // 0-1: diversité des acteurs armés
  baselineScore: number;       // 0-1: niveau de violence normalisé
  trend: number;               // -1 à +1: escalation/desescallation
  volatility: number;          // 0-1: instabilité
  lastUpdated: Date;
  dataSource: string;          // "acled" | "gdelt" | "fallback"
}

export interface ZoneActivity {
  zoneId: string;
  zoneName: string;
  lat: number;
  lng: number;
  radiusKm: number;
  eventCount: number;
  lastEventTime: Date | null;
  primaryActors: string[];
  eventTypes: Record<string, number>;
  intensity: number;           // 0-1
}

export interface GlobalConflictIndex {
  overall: number;             // 0-100
  hotZones: ZoneActivity[];
  trending: string[];          // Pays en escalation
  calmed: string[];            // Pays en désescalade
  timestamp: Date;
}

// ─── Engine ────────────────────────────────────────────────────

export class DynamicBaselineEngine {
  private cache: Map<string, ConflictBaseline> = new Map();
  private lastUpdate: Date | null = null;
  private cacheTTL = 3600000; // 1 heure

  /**
   * Calcule la baseline pour un pays depuis ACLED
   * Si ACLED n'est pas configuré, utilise GDELT comme fallback
   */
  async computeBaseline(countryCode: string): Promise<ConflictBaseline> {
    // Check cache
    const cached = this.cache.get(countryCode);
    if (cached && this.lastUpdate && Date.now() - this.lastUpdate.getTime() < this.cacheTTL) {
      return cached;
    }

    const acledKey = process.env.ACLED_API_KEY;
    const acledEmail = process.env.ACLED_EMAIL;

    if (acledKey && acledEmail) {
      return this.computeFromACLED(countryCode, acledKey, acledEmail);
    }

    // Fallback: GDELT (moins précis mais toujours disponible)
    return this.computeFromGDELT(countryCode);
  }

  /**
   * Calcul depuis ACLED - Source de ground truth
   */
  private async computeFromACLED(
    countryCode: string,
    apiKey: string,
    email: string
  ): Promise<ConflictBaseline> {
    const now = new Date();
    const day30 = new Date(now.getTime() - 30 * 86400000);
    const day90 = new Date(now.getTime() - 90 * 86400000);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Récupérer les événements des 90 derniers jours
    const url = [
      `https://api.acleddata.com/acled/read/`,
      `?key=${encodeURIComponent(apiKey)}`,
      `&email=${encodeURIComponent(email)}`,
      `&country=${countryCode}`,
      `&event_date=${fmt(day90)}|${fmt(now)}`,
      `&event_date_where=BETWEEN`,
      `&limit=500`,
      `&fields=event_date|event_type|actor1|actor2|fatalities|latitude|longitude`,
    ].join("");

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`ACLED returned ${res.status}`);

      const json = await res.json() as { data?: ACLEDEventRaw[] };
      const events = json.data || [];

      // Calculer les métriques
      const events30d = events.filter(e => new Date(e.event_date) > day30);
      const fatalities30d = events30d.reduce((s, e) => s + (parseInt(e.fatalities) || 0), 0);
      const fatalities90d = events.reduce((s, e) => s + (parseInt(e.fatalities) || 0), 0);

      // Diversité des acteurs
      const actors = new Set<string>();
      events.forEach(e => {
        if (e.actor1) actors.add(e.actor1);
        if (e.actor2) actors.add(e.actor2);
      });

      // Types d'événements
      const eventTypes: Record<string, number> = {};
      events.forEach(e => {
        eventTypes[e.event_type] = (eventTypes[e.event_type] || 0) + 1;
      });

      // Calcul du baseline score (normalisé 0-1)
      // Formule inspirée de ViEWS: événements + morts + diversité acteurs
      const eventScore = Math.min(1, events30d.length / 100);
      const fatalityScore = Math.min(1, fatalities30d / 500);
      const diversityScore = Math.min(1, actors.size / 10);

      const baselineScore = (
        eventScore * 0.40 +
        fatalityScore * 0.35 +
        diversityScore * 0.25
      );

      // Calcul de la tendance (comparaison 30d vs 60-90d)
      const events60to90 = events.filter(e => {
        const d = new Date(e.event_date);
        return d < day30 && d > day90;
      }).length;

      const recentRate = events30d.length / 30;
      const olderRate = events60to90 / 60;
      const trend = olderRate > 0
        ? Math.max(-1, Math.min(1, (recentRate - olderRate) / olderRate))
        : (events30d.length > 0 ? 1 : 0);

      // Volatilité (écart-type des événements par jour)
      const dailyCounts = new Map<string, number>();
      events.forEach(e => {
        const day = e.event_date.slice(0, 10);
        dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);
      });
      const counts = Array.from(dailyCounts.values());
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
      const volatility = Math.min(1, Math.sqrt(variance) / (mean + 1));

      const baseline: ConflictBaseline = {
        countryCode,
        countryName: this.getCountryName(countryCode),
        eventCount30d: events30d.length,
        eventCount90d: events.length,
        fatalities30d,
        fatalities90d,
        actorCount: actors.size,
        actorDiversity: diversityScore,
        baselineScore,
        trend,
        volatility,
        lastUpdated: now,
        dataSource: "acled",
      };

      this.cache.set(countryCode, baseline);
      this.lastUpdate = now;
      return baseline;

    } catch (error) {
      console.warn(`[DynamicBaseline] ACLED failed for ${countryCode}, falling back to GDELT`);
      return this.computeFromGDELT(countryCode);
    }
  }

  /**
   * Calcul depuis GDELT - Fallback si ACLED non configuré
   * Moins précis mais toujours disponible
   */
  private async computeFromGDELT(countryCode: string): Promise<ConflictBaseline> {
    const countryName = this.getCountryName(countryCode);

    try {
      // GDELT query pour les événements conflictuels
      const query = `${countryName} conflict military attack violence`;
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=50&format=json&timespan=30d`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`GDELT returned ${res.status}`);

      const json = await res.json() as { articles?: GDELTRawArticle[] };
      const articles = json.articles || [];

      // Score basé sur le volume médiatique et le ton
      const avgTone = articles.length > 0
        ? articles.reduce((s, a) => s + (a.avgtone ? parseFloat(a.avgtone) : 0), 0) / articles.length
        : 0;

      // Plus le ton est négatif, plus c'est conflictuel
      const toneScore = Math.max(0, Math.min(1, (-avgTone + 10) / 20));
      const volumeScore = Math.min(1, articles.length / 30);

      const baselineScore = toneScore * 0.6 + volumeScore * 0.4;

      const baseline: ConflictBaseline = {
        countryCode,
        countryName,
        eventCount30d: articles.length,
        eventCount90d: articles.length * 3, // Extrapolation
        fatalities30d: 0, // GDELT ne fournit pas les morts
        fatalities90d: 0,
        actorCount: 0,
        actorDiversity: 0,
        baselineScore,
        trend: 0, // Pas assez de données pour la tendance
        volatility: 0.5, // Inconnu
        lastUpdated: new Date(),
        dataSource: "gdelt",
      };

      this.cache.set(countryCode, baseline);
      return baseline;

    } catch {
      // Aucune donnée disponible - baseline par défaut
      return this.getDefaultBaseline(countryCode);
    }
  }

  /**
   * Baseline par défaut quand aucune donnée n'est disponible
   * Score neutre avec haute incertitude
   */
  private getDefaultBaseline(countryCode: string): ConflictBaseline {
    return {
      countryCode,
      countryName: this.getCountryName(countryCode),
      eventCount30d: 0,
      eventCount90d: 0,
      fatalities30d: 0,
      fatalities90d: 0,
      actorCount: 0,
      actorDiversity: 0,
      baselineScore: 0.3, // Score conservateur
      trend: 0,
      volatility: 0.5,
      lastUpdated: new Date(),
      dataSource: "fallback",
    };
  }

  /**
   * Calcule l'index global de conflit
   */
  async computeGlobalIndex(countryCodes: string[]): Promise<GlobalConflictIndex> {
    const baselines = await Promise.all(
      countryCodes.map(c => this.computeBaseline(c))
    );

    // Score global pondéré par population/priorité
    const PRIORITY_WEIGHTS: Record<string, number> = {
      "UA": 2.0, "PS": 1.8, "IL": 1.8, "SY": 1.5, "YE": 1.5,
      "IR": 1.3, "RU": 1.3, "SD": 1.2, "MM": 1.2, "AF": 1.2,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const b of baselines) {
      const weight = PRIORITY_WEIGHTS[b.countryCode] || 1.0;
      weightedSum += b.baselineScore * weight;
      totalWeight += weight;
    }

    const overall = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;

    // Identifier les zones chaudes
    const hotZones = baselines
      .filter(b => b.baselineScore > 0.5)
      .sort((a, b) => b.baselineScore - a.baselineScore)
      .slice(0, 10)
      .map(b => ({
        zoneId: b.countryCode,
        zoneName: b.countryName,
        lat: 0, lng: 0, // À enrichir avec géocodage
        radiusKm: 100,
        eventCount: b.eventCount30d,
        lastEventTime: b.lastUpdated,
        primaryActors: [],
        eventTypes: {},
        intensity: b.baselineScore,
      }));

    // Pays en escalation
    const trending = baselines
      .filter(b => b.trend > 0.3)
      .sort((a, b) => b.trend - a.trend)
      .slice(0, 5)
      .map(b => b.countryCode);

    // Pays en désescalade
    const calmed = baselines
      .filter(b => b.trend < -0.3)
      .sort((a, b) => a.trend - b.trend)
      .slice(0, 5)
      .map(b => b.countryCode);

    return {
      overall: Math.round(overall),
      hotZones,
      trending,
      calmed,
      timestamp: new Date(),
    };
  }

  /**
   * Map ISO code → Country name
   */
  private getCountryName(iso: string): string {
    const names: Record<string, string> = {
      "UA": "Ukraine", "RU": "Russia", "IL": "Israel", "PS": "Palestine",
      "SY": "Syria", "IQ": "Iraq", "IR": "Iran", "YE": "Yemen",
      "LB": "Lebanon", "SD": "Sudan", "MM": "Myanmar", "AF": "Afghanistan",
      "SO": "Somalia", "ML": "Mali", "NG": "Nigeria", "ET": "Ethiopia",
      "PK": "Pakistan", "IN": "India", "CN": "China", "TW": "Taiwan",
      "KP": "North Korea", "KR": "South Korea", "JP": "Japan",
      "US": "United States", "GB": "United Kingdom", "FR": "France",
      "DE": "Germany", "TR": "Turkey", "SA": "Saudi Arabia", "AE": "UAE",
      "EG": "Egypt", "LY": "Libya", "TN": "Tunisia", "DZ": "Algeria",
      "MA": "Morocco", "VE": "Venezuela", "CO": "Colombia", "MX": "Mexico",
      "BR": "Brazil", "AR": "Argentina", "CL": "Chile", "PE": "Peru",
      "SS": "South Sudan", "CF": "Central African Republic", "CD": "DR Congo",
      "CG": "Congo", "AO": "Angola", "ZW": "Zimbabwe", "KE": "Kenya",
    };
    return names[iso] || iso;
  }

  /**
   * Clear cache (pour forcer le recalcul)
   */
  clearCache(): void {
    this.cache.clear();
    this.lastUpdate = null;
  }
}

// ─── Types internes ────────────────────────────────────────────

interface ACLEDEventRaw {
  event_date: string;
  event_type: string;
  actor1: string;
  actor2: string;
  fatalities: string;
  latitude: string;
  longitude: string;
}

interface GDELTRawArticle {
  url: string;
  title: string;
  seendate: string;
  avgtone?: string;
  sourcecountry?: string;
}

// ─── Singleton ──────────────────────────────────────────────────

export const dynamicBaselineEngine = new DynamicBaselineEngine();
