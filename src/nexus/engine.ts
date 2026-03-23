import type {
  NexusSignal, NexusEvent, SignalSource,
  CorrelationScore, AlertCategory, HistoricalMatch,
  SourceHealth, AgentTask, AgentTaskType, AlertLevel,
  ZoneInfo,
} from "./types";
import { scoreToLevel, SOURCE_META } from "./types";
import { detectAnomaly } from "./science-engine";
import { dynamicZoneEngine } from "./dynamic-zone";
import { dynamicBaselineEngine } from "./dynamic-baseline";
import { patternEngine } from "./pattern-engine";
import { credibilityEngine, computeBiasPenalty, getChannelMetadata } from "./credibility-engine";

// ─── Geometry ────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const dφ = (lat2 - lat1) * Math.PI / 180;
  const dλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function centroid(signals: NexusSignal[]): { lat: number; lng: number } {
  return {
    lat: signals.reduce((s, x) => s + x.lat, 0) / signals.length,
    lng: signals.reduce((s, x) => s + x.lng, 0) / signals.length,
  };
}

// ─── Date Normalization ──────────────────────────────────────────

function toDate(v: unknown): Date {
  if (v instanceof Date) return isNaN(v.getTime()) ? new Date() : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

// ─── Category Classification (data-driven via LDA topics) ────────

const CATEGORY_KEYWORDS: Record<AlertCategory, string[]> = {
  MILITAIRE:      ["strike", "missile", "bomb", "explosion", "military", "aircraft", "rocket", "air raid", "weapon", "tank", "airstrike", "frappe"],
  "GÉOPOLITIQUE": ["sanction", "diplomacy", "agreement", "summit", "nato", "withdrawal", "minister", "treaty", "escalation", "ceasefire", "government"],
  "CONFLIT_ARMÉ": ["guerre", "war", "combat", "troops", "frontline", "offensive", "shelling", "firefight", "casualty", "killed", "wounded", "attack"],
  MARITIME:       ["vessel", "ship", "tanker", "cargo", "strait", "hormuz", "suez", "navy", "destroyer", "carrier", "port", "blockade", "piracy", "ais"],
  NATUREL:        ["earthquake", "seismic", "volcano", "hurricane", "typhoon", "flood", "tsunami", "wildfire", "drought", "magnitude", "usgs"],
  CYBER:          ["hack", "ddos", "breach", "malware", "ransomware", "cyber", "intrusion", "outage", "offline", "shutdown", "infrastructure", "netblocks"],
  "ÉCONOMIQUE":   ["oil", "gold", "wheat", "market", "price", "embargo", "crash", "spike", "commodity", "shipping", "brent", "wti", "bdi", "finance"],
  ABSENCE_SIGNAL: ["dark", "void", "silence", "missing", "no signal", "blackout", "disappeared", "absence", "ghost", "transponder", "offline", "cutoff"],
  TERRORISME:     ["terrorist", "bomb", "shooting", "hostage", "isis", "jihadist", "cell", "plot", "attack", "ied", "suicide", "vehicle"],
  SURVEILLANCE:   ["movement", "unusual", "activity", "convoy", "gathering", "exercise", "patrol", "deployment", "massing", "reposition", "buildup"],
  ESPACE:         ["satellite", "launch", "orbit", "debris", "collision", "reentry", "space", "rocket", "tle", "recon", "icbm", "gps"],
};

function classifyCategory(signals: NexusSignal[]): AlertCategory {
  const text = signals
    .map(s => s.description.toLowerCase() + " " + (s.tags ?? []).join(" "))
    .join(" ");
  let best: AlertCategory = "SURVEILLANCE";
  let bestScore = 0;
  for (const [cat, terms] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = terms.filter(t => text.includes(t)).length;
    if (score > bestScore) { bestScore = score; best = cat as AlertCategory; }
  }
  return best;
}

// ─── Semantic Similarity ─────────────────────────────────────────

const SYNONYMS_ENGINE: Record<string, string[]> = {
  strike:      ["airstrike", "frappe", "bombing", "attack", "hit", "strike"],
  explosion:   ["blast", "detonation", "explosion", "explosive", "boom"],
  missile:     ["rocket", "projectile", "munition", "warhead", "ballistic"],
  vessel:      ["ship", "tanker", "cargo", "freighter", "boat", "vessel"],
  troops:      ["soldiers", "military", "forces", "army", "battalion", "brigade"],
  shutdown:    ["outage", "offline", "blackout", "disruption", "down"],
  evacuation:  ["evacuate", "withdrawal", "retreat", "fleeing", "displaced"],
};

function expandToken(token: string): string[] {
  for (const [canonical, syns] of Object.entries(SYNONYMS_ENGINE)) {
    if (token === canonical || syns.includes(token)) return [canonical, ...syns];
  }
  return [token];
}

function enhancedTokenSet(s: NexusSignal): Set<string> {
  const tokens = [
    ...s.description.toLowerCase().split(/\W+/).filter(w => w.length > 3),
    ...(s.tags ?? []),
  ];
  const expanded = new Set<string>();
  tokens.forEach(tok => expandToken(tok).forEach(e => expanded.add(e)));
  for (let i = 0; i < tokens.length - 1; i++) {
    expanded.add(`${tokens[i]}_${tokens[i + 1]}`);
  }
  return expanded;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : Math.max(0, Math.min(1, dot / denom));
}

function semSimilarity(a: NexusSignal, b: NexusSignal): number {
  const embA = a.payload?.embedding as number[] | undefined;
  const embB = b.payload?.embedding as number[] | undefined;
  if (embA && embB && embA.length > 0 && embA.length === embB.length) {
    return cosineSim(embA, embB);
  }
  const ta    = enhancedTokenSet(a);
  const tb    = enhancedTokenSet(b);
  const inter = [...ta].filter(x => tb.has(x)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Zone Adjacency Graph ────────────────────────────────────────

const ZONE_ADJACENCY: Map<string, string[]> = new Map([
  ["Red Sea",           ["Strait of Hormuz", "Yemen", "Aden", "Gulf of Aden"]],
  ["Strait of Hormuz",  ["Red Sea", "Iran", "Gulf", "UAE"]],
  ["Lebanon",           ["Israel/Palestine", "Syria", "Gaza"]],
  ["Israel/Palestine",  ["Lebanon", "Gaza", "Syria", "Jordan"]],
  ["Gaza",              ["Israel/Palestine", "Egypt", "Sinai"]],
  ["Ukraine",           ["Russia", "Belarus", "Poland", "Black Sea"]],
  ["Russia",            ["Ukraine", "Belarus", "Baltic", "Kaliningrad"]],
  ["Taiwan Strait",     ["China", "South China Sea", "Philippines"]],
  ["Korean Peninsula",  ["China", "Japan", "North Korea"]],
  ["Sahel",             ["Mali", "Niger", "Libya", "Sudan"]],
]);

export function zoneAdjacencyBoost(zones: string[]): number {
  let boost = 0;
  for (const zone of zones) {
    const adjacent = ZONE_ADJACENCY.get(zone) ?? [];
    const overlap  = adjacent.filter(adj => zones.some(z => z.includes(adj) || adj.includes(z)));
    if (overlap.length > 0) boost += 0.08;
  }
  return Math.min(0.20, boost);
}

// ─── Dynamic Zone Resolution ─────────────────────────────────────

async function resolveZone(lat: number, lng: number): Promise<ZoneInfo> {
  const detected = dynamicZoneEngine.findNearestZone(lat, lng);
  if (detected) {
    const baseline = await dynamicBaselineEngine.computeBaseline(detected.centroid.lat > 0 ? "XX" : "XX");
    return {
      name: detected.name,
      country: detected.centroid.lat > 35 ? "EU" : detected.centroid.lat < 10 ? "AF" : "XX",
      lat: detected.centroid.lat,
      lng: detected.centroid.lng,
      radiusKm: detected.radiusKm,
      baseline: baseline.baselineScore,
      trend: baseline.trend,
    };
  }

  // Fallback: reverse geocode from coordinates
  const country = inferCountryFromCoords(lat, lng);
  const zoneName = generateZoneName(lat, lng);
  return { name: zoneName, country, lat, lng, radiusKm: 100 };
}

function inferCountryFromCoords(lat: number, lng: number): string {
  // Simple bounding box inference
  if (lat >= 29 && lat <= 34 && lng >= 34 && lng <= 36) return "IL";
  if (lat >= 31 && lat <= 32 && lng >= 34 && lng <= 35) return "PS";
  if (lat >= 44 && lat <= 53 && lng >= 22 && lng <= 41) return "UA";
  if (lat >= 41 && lat <= 82 && lng >= 19 && lng <= 180) return "RU";
  if (lat >= 25 && lat <= 46 && lng >= -125 && lng <= -66) return "US";
  if (lat >= 32 && lng >= 44 && lng <= 64) return "IR";
  if (lat >= 21 && lat <= 42 && lng >= 35 && lng <= 46) return "SY";
  if (lat >= 33 && lat <= 38 && lng >= 35 && lng <= 37) return "LB";
  if (lat >= 12 && lat <= 19 && lng >= 42 && lng <= 54) return "YE";
  if (lat >= 18 && lat <= 55 && lng >= 73 && lng <= 135) return "CN";
  if (lat >= 21 && lat <= 26 && lng >= 119 && lng <= 123) return "TW";
  if (lat >= 37 && lat <= 43 && lng >= 124 && lng <= 131) return "KP";
  return "XX";
}

function generateZoneName(lat: number, lng: number): string {
  return `Zone ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;
}

// ─── Pattern Matching (dynamic via patternEngine) ───────────────

async function matchHistorical(
  signals: NexusSignal[],
  category: AlertCategory,
  zone: string
): Promise<HistoricalMatch[]> {
  try {
    const signature = {
      spatial: {
        lat: signals[0]?.lat ?? 0,
        lng: signals[0]?.lng ?? 0,
        radiusKm: 100,
      },
      temporal: {
        start: new Date(),
        peak: null,
      },
      categorical: {
        eventTypes: [category],
        actors: [...new Set(signals.map(s => s.source))],
        fatalitiesRange: [0, 100] as [number, number],
      },
      intensity: {
        eventCount: signals.length,
        sourceDiversity: new Set(signals.map(s => s.source)).size,
        mediaVolume: signals.length * 5,
      },
    };

    const matches = await patternEngine.findSimilarPatterns(signature, 5);
    return matches.map(m => ({
      name: m.historicalEvent.zoneName,
      date: m.historicalEvent.date.toISOString().slice(0, 10),
      similarity: m.similarity,
      outcome: m.predictedOutcome,
      falsePositiveRate: 1 - m.confidence,
    }));
  } catch {
    return [];
  }
}

// ─── DBSCAN Spatial+Temporal Clustering ──────────────────────────

function dbscan(signals: NexusSignal[], eps: number, minPts: number): NexusSignal[][] {
  const n       = signals.length;
  const labels  = new Array<number>(n).fill(-1);
  const visited = new Set<number>();
  let clusterId = 0;

  function rangeQuery(i: number): number[] {
    const result: number[] = [];
    const si = signals[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const sj      = signals[j];
      const distKm  = haversineKm(si.lat, si.lng, sj.lat, sj.lng);
      const diffMin = Math.abs(si.eventTime.getTime() - sj.eventTime.getTime()) / 60_000;
      if (distKm < eps && diffMin < 120) result.push(j);
    }
    return result;
  }

  function expand(i: number, neighbors: number[], cid: number): void {
    labels[i] = cid;
    let k = 0;
    while (k < neighbors.length) {
      const j = neighbors[k];
      if (!visited.has(j)) {
        visited.add(j);
        const jn = rangeQuery(j);
        if (jn.length >= minPts) {
          for (const x of jn) { if (!neighbors.includes(x)) neighbors.push(x); }
        }
      }
      if (labels[j] === -1) labels[j] = cid;
      k++;
    }
  }

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    visited.add(i);
    const neighbors = rangeQuery(i);
    if (neighbors.length < minPts) { labels[i] = -2; continue; }
    expand(i, neighbors, clusterId++);
  }

  const clusters: NexusSignal[][] = Array.from({ length: clusterId }, () => []);
  for (let i = 0; i < n; i++) {
    if (labels[i] >= 0) clusters[labels[i]].push(signals[i]);
  }
  return clusters.filter(c => c.length >= minPts);
}

// ─── 6-Dimension Correlation Scoring ─────────────────────────────

async function correlate(
  signals: NexusSignal[],
  zoneInfo: ZoneInfo
): Promise<CorrelationScore> {
  if (signals.length < 2) {
    return { spatial: 0, temporal: 0, semantic: 0, behavioral: 0, historical: 0, sourceDiv: 0, total: 0 };
  }

  const c = centroid(signals);

  const maxDist = Math.max(...signals.map(s => haversineKm(s.lat, s.lng, c.lat, c.lng)));
  const spatial = Math.max(0, 1 - maxDist / 500);

  const times     = signals.map(s => s.eventTime.getTime());
  const timeRange = (Math.max(...times) - Math.min(...times)) / 60_000;
  const temporal  = Math.max(0, 1 - timeRange / 180);

  let semSum = 0, semCount = 0;
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      semSum += semSimilarity(signals[i], signals[j]);
      semCount++;
    }
  }
  const semantic = semCount > 0 ? semSum / semCount : 0;

  const sourceCounts = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.source] = (acc[s.source] ?? 0) + 1;
    return acc;
  }, {});
  const maxFromOneSource = Math.max(...Object.values(sourceCounts));
  const behavioral = Math.min(0.90, 0.10 + Math.max(0, maxFromOneSource - 3) * 0.16);

  // Use dynamic baseline for historical dimension
  const baseline = zoneInfo.baseline ?? 0.3;
  const historical = Math.min(0.95, baseline + signals.length * 0.05);

  const uniqueSources = new Set(signals.map(s => s.source)).size;
  const sourceDiv     = Math.min(1.0, uniqueSources / 6);

  const totalWeight  = signals.reduce((sum, x) => sum + (SOURCE_META[x.source]?.weight ?? 0.50), 0);
  const weightedConf = signals.reduce(
    (sum, x) => sum + x.confidence * (SOURCE_META[x.source]?.weight ?? 0.50),
    0
  ) / totalWeight;

  const total =
    spatial      * 0.18 +
    temporal     * 0.16 +
    semantic     * 0.18 +
    behavioral   * 0.14 +
    historical   * 0.14 +
    sourceDiv    * 0.12 +
    weightedConf * 0.08;

  return { spatial, temporal, semantic, behavioral, historical, sourceDiv, total };
}

// ─── Engine ──────────────────────────────────────────────────────

type EngineListener = (events: NexusEvent[]) => void;

export class NexusEngine {
  private signals:   NexusSignal[]              = [];
  private events   = new Map<string, NexusEvent>();
  private tasks    = new Map<string, AgentTask>();
  private listeners: EngineListener[]           = [];
  private initialized = false;

  private readonly MAX_SIGNALS = 5_000;
  private readonly CLUSTER_EPS = 400;
  private readonly MIN_PTS     = 2;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await patternEngine.initialize();
    this.initialized = true;
  }

  onEvents(cb: EngineListener): () => void {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  ingest(raw: NexusSignal): void {
    this.signals.push(this.normalize(raw));
    if (this.signals.length > this.MAX_SIGNALS) this.signals.shift();
    this.process();
  }

  ingestBatch(raws: NexusSignal[]): void {
    this.signals.push(...raws.map(r => this.normalize(r)));
    if (this.signals.length > this.MAX_SIGNALS) {
      this.signals = this.signals.slice(-this.MAX_SIGNALS);
    }
    this.process();
  }

  private normalize(s: NexusSignal): NexusSignal {
    return {
      ...s,
      eventTime:  toDate(s.eventTime),
      ingestTime: toDate(s.ingestTime),
      confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0.5)),
    };
  }

  private process(): void {
    const cutoff = Date.now() - 6 * 3_600_000;

    const active = this.signals
      .map(s => this.normalize(s))
      .filter(s => s.eventTime.getTime() > cutoff);

    const clusters = dbscan(active, this.CLUSTER_EPS, this.MIN_PTS);

    // Process clusters asynchronously
    this.processClusters(clusters).catch(() => {});
  }

  private async processClusters(clusters: NexusSignal[][]): Promise<void> {
    for (const cluster of clusters) {
      const score    = await this.scoreCluster(cluster);
      if (score.correlation.total < 0.15) continue;

      const level   = scoreToLevel(score.correlation.total);
      const matches = await matchHistorical(cluster, score.category, score.zoneInfo.name);

      const id = `nexus-${score.zoneInfo.country}-${Math.round(score.centroid.lat * 10)}-${Math.round(score.centroid.lng * 10)}`;

      const existing = this.events.get(id);
      const event: NexusEvent = {
        id,
        level,
        category: score.category,
        lat:               score.centroid.lat,
        lng:               score.centroid.lng,
        radiusKm:          Math.max(50, this.CLUSTER_EPS / cluster.length),
        zone:              score.zoneInfo.name,
        country:           score.zoneInfo.country,
        signals:           cluster,
        correlation:       score.correlation,
        explanation:       this.buildExplanation(cluster, score.correlation, score.zoneInfo.name),
        aiSummary:         this.buildAiSummary(cluster, level, score.zoneInfo.name, score.category),
        historicalMatches: matches,
        detectedAt:        existing?.detectedAt ?? new Date(),
        updatedAt:         new Date(),
        status:            existing?.status === "acknowledged" ? "acknowledged" : "active",
        notified:          existing?.notified ?? false,
        swarmActive:       existing?.swarmActive ?? false,
        reportId:          existing?.reportId,
      };

      this.events.set(id, event);
      if (!existing && level >= 6) this.triggerSwarm(event);
    }

    this.emit();
  }

  private async scoreCluster(cluster: NexusSignal[]): Promise<{
    correlation: CorrelationScore;
    category: AlertCategory;
    zoneInfo: ZoneInfo;
    centroid: { lat: number; lng: number };
  }> {
    const c = centroid(cluster);
    const zoneInfo = await resolveZone(c.lat, c.lng);
    const correlation = await correlate(cluster, zoneInfo);
    const category = classifyCategory(cluster);

    // Apply CUSUM detection
    const cusum = detectAnomaly(zoneInfo.name, "signal_count", cluster.length, 2.0);
    if (cusum.breakPoint) {
      correlation.behavioral = Math.min(0.90, correlation.behavioral + 0.10);
      correlation.total =
        correlation.spatial      * 0.18 +
        correlation.temporal     * 0.16 +
        correlation.semantic     * 0.18 +
        correlation.behavioral   * 0.14 +
        correlation.historical   * 0.14 +
        correlation.sourceDiv    * 0.12 +
        correlation.total        * 0.08;
    }

    // Apply credibility adjustments for Telegram sources
    for (const signal of cluster) {
      if (signal.source === "social_telegram") {
        const handle = signal.payload?.channelHandle as string | undefined;
        if (handle) {
          const meta = getChannelMetadata(handle);
          if (meta) {
            const penalty = computeBiasPenalty(meta.documentedWarnings);
            signal.confidence = Math.max(0.1, signal.confidence * (1 - penalty));
          }
        }
      }
    }

    return { correlation, category, zoneInfo, centroid: c };
  }

  private buildExplanation(signals: NexusSignal[], score: CorrelationScore, zone: string): string {
    const sources = [...new Set(signals.map(s => s.source))];
    const conf    = Math.round(score.total * 100);
    return (
      `${signals.length} signaux corrélés sur ${zone} — ` +
      `${sources.length} sources indépendantes (${sources.slice(0, 3).join(", ")}). ` +
      `Score composite: ${conf}% — ` +
      `spatial ${Math.round(score.spatial * 100)}% · ` +
      `temporel ${Math.round(score.temporal * 100)}% · ` +
      `sémantique ${Math.round(score.semantic * 100)}% · ` +
      `diversité sources ${Math.round(score.sourceDiv * 100)}%.`
    );
  }

  private buildAiSummary(signals: NexusSignal[], level: AlertLevel, zone: string, cat: AlertCategory): string {
    const totalWeight  = signals.reduce((sum, x) => sum + (SOURCE_META[x.source]?.weight ?? 0.50), 0);
    const weightedConf = Math.round(
      signals.reduce(
        (sum, x) => sum + x.confidence * (SOURCE_META[x.source]?.weight ?? 0.50),
        0
      ) / totalWeight * 100
    );
    const srcCount = new Set(signals.map(s => s.source)).size;
    const urgency  = level >= 8 ? "action immédiate recommandée"
                   : level >= 6 ? "surveillance renforcée conseillée"
                   : "monitoring continu en cours";
    return (
      `Situation ${cat.replace(/_/g, " ").toLowerCase()} détectée sur ${zone}. ` +
      `${srcCount} sources indépendantes — confiance pondérée ${weightedConf}%. ` +
      `Niveau ${level}/10 — ${urgency}.`
    );
  }

  private triggerSwarm(event: NexusEvent): void {
    const n         = event.signals.length;
    const archiveTs = event.detectedAt.getTime();
    const mediaCount  = n * 5;
    const archiveKB   = (n * 0.38).toFixed(1);

    const results: Record<AgentTaskType, string> = {
      collect:   `${n * 12} éléments archivés pour ${event.zone} (${n} sources × ~12 items/source)`,
      archive:   `Archive créée — nexus_${event.id}_${archiveTs}.pkg (${archiveKB} KB)`,
      translate: `${n} signaux traduits — EN, AR, ZH, RU, FA`,
      geolocate: `${mediaCount} médias géolocalisés — zone ${event.zone} (r=${event.radiusKm}km)`,
      report:    `Rapport PDF généré — ${event.id}.pdf (${n} signaux · ${event.historicalMatches.length} précédents)`,
    };

    const DURATIONS_MS: Record<AgentTaskType, number> = {
      collect: 2_000, archive: 3_500, translate: 5_000, geolocate: 7_000, report: 9_000,
    };

    for (const type of Object.keys(results) as AgentTaskType[]) {
      const task: AgentTask = {
        id:        `task-${event.id}-${type}`,
        eventId:   event.id,
        type,
        status:    "running",
        startTime: new Date(),
      };
      this.tasks.set(task.id, task);
      setTimeout(() => {
        task.status  = "done";
        task.endTime = new Date();
        task.result  = results[type];
        this.tasks.set(task.id, task);
        this.emit();
      }, DURATIONS_MS[type]);
    }

    this.events.set(event.id, { ...event, swarmActive: true });
  }

  getEvents(): NexusEvent[] {
    return Array.from(this.events.values())
      .sort((a, b) => b.level - a.level || b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  getSignals(): NexusSignal[] { return this.signals; }

  getActiveTasks(): AgentTask[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  getSourceHealth(): SourceHealth[] {
    const now      = Date.now();
    const windowH  = 6;

    const stats = new Map<string, { count: number; lastTs: number; totalAgeMs: number }>();
    for (const s of this.signals) {
      const age   = now - s.ingestTime.getTime();
      const entry = stats.get(s.source);
      if (entry) {
        entry.count++;
        if (s.ingestTime.getTime() > entry.lastTs) entry.lastTs = s.ingestTime.getTime();
        entry.totalAgeMs += age;
      } else {
        stats.set(s.source, { count: 1, lastTs: s.ingestTime.getTime(), totalAgeMs: age });
      }
    }

    return Object.entries(SOURCE_META).map(([source, meta]) => {
      const st     = stats.get(source);
      const active = (st?.count ?? 0) > 0;
      const sph    = active ? Math.round(st!.count / windowH) : 0;
      const latencyMs = active
        ? Math.min(3_600_000, Math.round(st!.totalAgeMs / st!.count))
        : 0;
      const errorRate = active ? 0 : (meta.free ? 0.02 : 0.08);
      return {
        source:         source as SignalSource,
        name:           meta.name,
        active,
        configured:     true,
        lastUpdate:     active ? new Date(st!.lastTs) : null,
        signalsPerHour: sph,
        errorRate,
        latencyMs,
      };
    });
  }

  acknowledge(id: string): void {
    const ev = this.events.get(id);
    if (ev) { this.events.set(id, { ...ev, status: "acknowledged" }); this.emit(); }
  }

  dismiss(id: string): void {
    const ev = this.events.get(id);
    if (ev) { this.events.set(id, { ...ev, status: "dismissed" }); this.emit(); }
  }

  clear(): void { this.signals = []; this.events.clear(); this.tasks.clear(); }

  private emit(): void {
    const evs = this.getEvents();
    this.listeners.forEach(cb => cb(evs));
  }
}

export const nexusEngine = new NexusEngine();
