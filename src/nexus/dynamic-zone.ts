/**
 * NEXUS Dynamic Zone Engine
 * ─────────────────────────────────────────────────────────────
 *
 * PRINCIPE: Les zones de conflit sont détectées dynamiquement
 * par clustering spatial-temporel des signaux entrants.
 *
 * PAS DE ZONES HARDCODÉES.
 *
 * ALGORITHME:
 * 1. Collecter les signaux récents (dernières 6h)
 * 2. Appliquer DBSCAN pour identifier les clusters
 * 3. Calculer le centre et rayon de chaque cluster
 * 4. Tracker l'évolution temporelle (émergence, croissance, décroissance)
 *
 * RÉFÉRENCES:
 * - DBSCAN: Ester et al. (1996)
 * - HDBSCAN: Campello et al. (2013)
 * - "Spatio-temporal clustering for conflict detection" (ArXiv 2024)
 */

// ─── Types ────────────────────────────────────────────────────

export interface Signal {
  id: string;
  lat: number;
  lng: number;
  timestamp: Date;
  source: string;
  confidence: number;
  description: string;
  eventType?: string;
}

export interface DetectedZone {
  id: string;
  name: string;                  // Généré dynamiquement (ex: "Zone_31.5_34.2")
  centroid: { lat: number; lng: number };
  radiusKm: number;
  signalCount: number;
  uniqueSources: number;
  avgConfidence: number;
  firstSignal: Date;
  lastSignal: Date;
  trend: "emerging" | "active" | "declining" | "dormant";
  eventTypes: Record<string, number>;
  intensity: number;            // 0-1
  adjacentZones: string[];      // IDs des zones adjacentes
}

export interface ZoneEvolution {
  zoneId: string;
  history: Array<{
    timestamp: Date;
    signalCount: number;
    radiusKm: number;
    intensity: number;
  }>;
  growthRate: number;           // Signaux/heure
  expansionRate: number;        // km/heure
}

// ─── DBSCAN Implementation ─────────────────────────────────────

/**
 * DBSCAN pour clustering spatial-temporel
 * Adapté pour gérer à la fois la distance géographique et temporelle
 */
function dbscan(
  signals: Signal[],
  epsKm: number,
  epsMinutes: number,
  minPts: number
): Signal[][] {
  const n = signals.length;
  const labels = new Array<number>(n).fill(-1);
  const visited = new Set<number>();
  let clusterId = 0;

  // Distance combinée espace-temps normalisée
  const combinedDistance = (a: Signal, b: Signal): number => {
    const spatial = haversine(a.lat, a.lng, b.lat, b.lng);
    const temporal = Math.abs(a.timestamp.getTime() - b.timestamp.getTime()) / 60000;

    // Normalisation: epsKm et epsMinutes définissent l'échelle
    const normalizedSpatial = spatial / epsKm;
    const normalizedTemporal = temporal / epsMinutes;

    // Distance euclidienne dans l'espace normalisé
    return Math.sqrt(normalizedSpatial ** 2 + normalizedTemporal ** 2);
  };

  const rangeQuery = (i: number): number[] => {
    const result: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (combinedDistance(signals[i], signals[j]) <= 1) {
        result.push(j);
      }
    }
    return result;
  };

  const expand = (i: number, neighbors: number[], cid: number): void => {
    labels[i] = cid;
    let k = 0;
    while (k < neighbors.length) {
      const j = neighbors[k];
      if (!visited.has(j)) {
        visited.add(j);
        const jn = rangeQuery(j);
        if (jn.length >= minPts) {
          for (const x of jn) {
            if (!neighbors.includes(x)) neighbors.push(x);
          }
        }
      }
      if (labels[j] === -1) labels[j] = cid;
      k++;
    }
  };

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    visited.add(i);
    const neighbors = rangeQuery(i);
    if (neighbors.length < minPts) {
      labels[i] = -2; // Noise
      continue;
    }
    expand(i, neighbors, clusterId++);
  }

  // Collecter les clusters
  const clusters: Signal[][] = Array.from({ length: clusterId }, () => []);
  for (let i = 0; i < n; i++) {
    if (labels[i] >= 0) clusters[labels[i]].push(signals[i]);
  }

  return clusters.filter(c => c.length >= minPts);
}

// ─── Engine ────────────────────────────────────────────────────

export class DynamicZoneEngine {
  private signals: Signal[] = [];
  private zones: Map<string, DetectedZone> = new Map();
  private zoneHistory: Map<string, ZoneEvolution> = new Map();

  private readonly MAX_SIGNALS = 10000;
  private readonly SIGNAL_WINDOW = 6 * 60 * 60 * 1000; // 6 heures
  private readonly DBSCAN_EPS_KM = 100;
  private readonly DBSCAN_EPS_MIN = 120;
  private readonly DBSCAN_MIN_PTS = 3;

  /**
   * Ingest un nouveau signal
   */
  ingest(signal: Signal): void {
    this.signals.push(signal);
    this.pruneOldSignals();
    this.recluster();
  }

  /**
   * Ingest plusieurs signaux
   */
  ingestBatch(signals: Signal[]): void {
    this.signals.push(...signals);
    this.pruneOldSignals();
    this.recluster();
  }

  /**
   * Supprime les signaux trop anciens
   */
  private pruneOldSignals(): void {
    const cutoff = Date.now() - this.SIGNAL_WINDOW;
    this.signals = this.signals.filter(s => s.timestamp.getTime() > cutoff);
    if (this.signals.length > this.MAX_SIGNALS) {
      this.signals = this.signals.slice(-this.MAX_SIGNALS);
    }
  }

  /**
   * Reclustere les signaux et met à jour les zones
   */
  private recluster(): void {
    const clusters = dbscan(
      this.signals,
      this.DBSCAN_EPS_KM,
      this.DBSCAN_EPS_MIN,
      this.DBSCAN_MIN_PTS
    );

    const newZones = new Map<string, DetectedZone>();
    const now = new Date();

    for (const cluster of clusters) {
      const zone = this.createZoneFromCluster(cluster, now);

      // Essayer de matcher avec une zone existante
      const existingZone = this.findMatchingZone(zone, newZones);
      if (existingZone) {
        // Mettre à jour la zone existante
        this.updateZone(existingZone, zone);
        newZones.set(existingZone.id, existingZone);
      } else {
        // Créer une nouvelle zone
        newZones.set(zone.id, zone);
      }
    }

    // Identifier les zones disparues
    for (const [id, zone] of this.zones) {
      if (!newZones.has(id)) {
        zone.trend = "dormant";
        newZones.set(id, zone);
      }
    }

    this.zones = newZones;
  }

  /**
   * Crée une zone à partir d'un cluster de signaux
   */
  private createZoneFromCluster(cluster: Signal[], now: Date): DetectedZone {
    const centroid = this.computeCentroid(cluster);
    const radius = this.computeRadius(cluster, centroid);
    const timestamps = cluster.map(s => s.timestamp.getTime());

    // Compter les sources uniques
    const sources = new Set(cluster.map(s => s.source));

    // Compter les types d'événements
    const eventTypes: Record<string, number> = {};
    cluster.forEach(s => {
      if (s.eventType) {
        eventTypes[s.eventType] = (eventTypes[s.eventType] || 0) + 1;
      }
    });

    // Calculer l'intensité
    const avgConf = cluster.reduce((s, x) => s + x.confidence, 0) / cluster.length;
    const density = cluster.length / (Math.PI * (radius / 100) ** 2);
    const intensity = Math.min(1, density * 10 * avgConf);

    // Générer un ID basé sur la position
    const latStr = centroid.lat.toFixed(1);
    const lngStr = centroid.lng.toFixed(1);
    const id = `zone_${latStr}_${lngStr}`.replace(/-/g, "m");

    // Déterminer la tendance
    const firstSignal = new Date(Math.min(...timestamps));
    const lastSignal = new Date(Math.max(...timestamps));
    const age = now.getTime() - firstSignal.getTime();
    const recency = now.getTime() - lastSignal.getTime();

    let trend: DetectedZone["trend"] = "active";
    if (recency > 60 * 60 * 1000) trend = "declining";
    else if (age < 30 * 60 * 1000) trend = "emerging";

    return {
      id,
      name: `Zone ${centroid.lat.toFixed(2)}°, ${centroid.lng.toFixed(2)}°`,
      centroid,
      radiusKm: radius,
      signalCount: cluster.length,
      uniqueSources: sources.size,
      avgConfidence: avgConf,
      firstSignal,
      lastSignal,
      trend,
      eventTypes,
      intensity,
      adjacentZones: [],
    };
  }

  /**
   * Calcule le centroïde d'un cluster
   */
  private computeCentroid(cluster: Signal[]): { lat: number; lng: number } {
    // Moyenne pondérée par la confiance
    let totalLat = 0;
    let totalLng = 0;
    let totalWeight = 0;

    for (const s of cluster) {
      const weight = s.confidence;
      totalLat += s.lat * weight;
      totalLng += s.lng * weight;
      totalWeight += weight;
    }

    return {
      lat: totalLat / totalWeight,
      lng: totalLng / totalWeight,
    };
  }

  /**
   * Calcule le rayon d'un cluster (distance max au centroïde)
   */
  private computeRadius(
    cluster: Signal[],
    centroid: { lat: number; lng: number }
  ): number {
    const distances = cluster.map(s =>
      haversine(s.lat, s.lng, centroid.lat, centroid.lng)
    );
    return Math.max(20, Math.min(500, Math.max(...distances) * 1.2));
  }

  /**
   * Trouve une zone existante qui correspond au nouveau cluster
   */
  private findMatchingZone(
    newZone: DetectedZone,
    currentZones: Map<string, DetectedZone>
  ): DetectedZone | null {
    for (const [_, zone] of currentZones) {
      const dist = haversine(
        zone.centroid.lat, zone.centroid.lng,
        newZone.centroid.lat, newZone.centroid.lng
      );
      if (dist < Math.max(zone.radiusKm, newZone.radiusKm) * 0.5) {
        return zone;
      }
    }

    // Vérifier aussi les zones précédentes
    for (const [_, zone] of this.zones) {
      const dist = haversine(
        zone.centroid.lat, zone.centroid.lng,
        newZone.centroid.lat, newZone.centroid.lng
      );
      if (dist < Math.max(zone.radiusKm, newZone.radiusKm) * 0.5) {
        return { ...zone };
      }
    }

    return null;
  }

  /**
   * Met à jour une zone existante avec les nouvelles données
   */
  private updateZone(existing: DetectedZone, update: DetectedZone): void {
    // Mise à jour pondérée du centroïde
    const totalSignals = existing.signalCount + update.signalCount;
    existing.centroid = {
      lat: (existing.centroid.lat * existing.signalCount + update.centroid.lat * update.signalCount) / totalSignals,
      lng: (existing.centroid.lng * existing.signalCount + update.centroid.lng * update.signalCount) / totalSignals,
    };

    existing.signalCount = totalSignals;
    existing.uniqueSources = Math.max(existing.uniqueSources, update.uniqueSources);
    existing.radiusKm = Math.max(existing.radiusKm, update.radiusKm);
    existing.lastSignal = update.lastSignal;
    existing.intensity = Math.max(existing.intensity, update.intensity);

    // Merger les types d'événements
    for (const [type, count] of Object.entries(update.eventTypes)) {
      existing.eventTypes[type] = (existing.eventTypes[type] || 0) + count;
    }

    // Mettre à jour la tendance
    if (update.lastSignal.getTime() > existing.lastSignal.getTime()) {
      existing.trend = "active";
    }
  }

  /**
   * Retourne toutes les zones actives
   */
  getActiveZones(): DetectedZone[] {
    return Array.from(this.zones.values())
      .filter(z => z.trend !== "dormant")
      .sort((a, b) => b.intensity - a.intensity);
  }

  /**
   * Retourne toutes les zones (y compris dormantes)
   */
  getAllZones(): DetectedZone[] {
    return Array.from(this.zones.values())
      .sort((a, b) => b.intensity - a.intensity);
  }

  /**
   * Trouve la zone la plus proche d'un point
   */
  findNearestZone(lat: number, lng: number): DetectedZone | null {
    let nearest: DetectedZone | null = null;
    let minDist = Infinity;

    for (const zone of this.zones.values()) {
      const dist = haversine(lat, lng, zone.centroid.lat, zone.centroid.lng);
      if (dist < zone.radiusKm && dist < minDist) {
        minDist = dist;
        nearest = zone;
      }
    }

    return nearest;
  }

  /**
   * Calcule les zones adjacentes
   */
  computeAdjacency(): void {
    const zones = Array.from(this.zones.values());

    for (const zone of zones) {
      zone.adjacentZones = [];

      for (const other of zones) {
        if (zone.id === other.id) continue;

        const dist = haversine(
          zone.centroid.lat, zone.centroid.lng,
          other.centroid.lat, other.centroid.lng
        );

        // Deux zones sont adjacentes si leurs rayons se chevauchent légèrement
        if (dist < zone.radiusKm + other.radiusKm + 100) {
          zone.adjacentZones.push(other.id);
        }
      }
    }
  }

  /**
   * Obtient l'historique d'une zone
   */
  getZoneEvolution(zoneId: string): ZoneEvolution | null {
    return this.zoneHistory.get(zoneId) || null;
  }

  /**
   * Nettoie toutes les données
   */
  clear(): void {
    this.signals = [];
    this.zones.clear();
    this.zoneHistory.clear();
  }
}

// ─── Utilitaires ────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Singleton ──────────────────────────────────────────────────

export const dynamicZoneEngine = new DynamicZoneEngine();
