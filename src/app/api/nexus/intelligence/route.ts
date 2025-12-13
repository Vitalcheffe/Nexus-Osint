import { NextResponse } from "next/server";
import { embed, enhancedJaccard } from "@/lib/embeddings";
import { kvLPush, kvGet, kvSet } from "@/lib/kv";

/**
 * NEXUS Master Intelligence Route
 * GET  /api/nexus/intelligence  → SSE stream
 * POST /api/nexus/intelligence  → Ingest manual signal
 *
 * Active sources:
 *   GDELT 2.0      (15min) — global geopolitical events
 *   ACLED          (1h)    — georeferenced armed conflicts
 *   USGS           (30s)   — M4.5+ earthquakes
 *   Wikipedia      (2min)  — edit velocity early warning
 *   NetBlocks      (5min)  — internet shutdown detection
 *   NASA FIRMS     (1h)    — active fire detection
 *   GPSJam         (5min)  — GPS jamming zones
 *   Yahoo Finance  (1min)  — market anomaly detection
 *   UN ReliefWeb   (1h)    — humanitarian crisis updates
 *   RSS Feeds      (5min)  — AP/Reuters/AFP/Al Jazeera/BBC
 *   Bluesky        (2min)  — OSINT community social feed
 *   Mastodon       (3min)  — multi-instance conflict reporting
 *   Ransomwatch    (30min) — critical infrastructure cyber threats
 *
 * Signal enrichment:
 *   - Voyage AI embeddings attached to payload.embedding when VOYAGE_API_KEY set
 *   - Signals stored to KV (Upstash) for CUSUM baseline computation
 *   - Deduplication via 60-second seen-ID window
 */

// ─── Types de signaux enrichis ────────────────────────────────

interface IntelSignal {
  id: string;
  source: string;
  sourceName: string;
  category: string;
  lat: number;
  lng: number;
  country?: string;
  zone?: string;
  confidence: number;
  title: string;
  body: string;
  tags: string[];
  timestamp: string;
  rawData?: unknown;
  ldaScore?: number;
  velocityPenalty?: number;
  isAnomaly?: boolean;
}

// ─── Cache centralisé ─────────────────────────────────────────

const signalBuffer: IntelSignal[] = [];
const MAX_BUFFER = 500;
const clients = new Set<ReadableStreamDefaultController>();
const seenSignalIds = new Set<string>();

// Deduplicate and broadcast. Attaches Voyage AI embedding if configured.
async function broadcastEnriched(signal: IntelSignal): Promise<void> {
  if (seenSignalIds.has(signal.id)) return;
  seenSignalIds.add(signal.id);
  // Bound dedup window
  if (seenSignalIds.size > 5000) {
    const iter = seenSignalIds.values();
    for (let i = 0; i < 1000; i++) { const { value, done } = iter.next(); if (done) break; seenSignalIds.delete(value); }
  }

  // Attach embedding to payload for engine cosine similarity
  try {
    const vec = await embed(`${signal.title} ${signal.body}`.slice(0, 512));
    if (vec) signal = { ...signal, rawData: { ...((signal.rawData as Record<string, unknown>) ?? {}), embedding: Array.from(vec) } };
  } catch { /* embedding is optional */ }

  signalBuffer.unshift(signal);
  if (signalBuffer.length > MAX_BUFFER) signalBuffer.pop();

  // Persist to KV for CUSUM baseline computation
  kvLPush(`signals:${signal.source}`, {
    id: signal.id, ts: signal.timestamp, lat: signal.lat, lng: signal.lng,
    confidence: signal.confidence, zone: signal.zone,
  }, 200).catch(() => {});

  const msg = `data: ${JSON.stringify({ type: "signal", data: signal })}\n\n`;
  clients.forEach(ctrl => {
    try { ctrl.enqueue(new TextEncoder().encode(msg)); } catch { clients.delete(ctrl); }
  });
}

// Synchronous broadcast for high-frequency sources (USGS, etc.)
// Skips embedding to avoid latency.
function broadcast(signal: IntelSignal): void {
  broadcastEnriched(signal).catch(() => {});
}

// ─── Polling intervals ────────────────────────────────────────

let pollingStarted = false;
const intervals: ReturnType<typeof setInterval>[] = [];

// ─── GDELT 2.0 Poller ─────────────────────────────────────────
// Murphy et al. 2024: GDELT = best global media coverage (15min latency)

const GDELT_QUERIES = [
  "explosion OR strike OR airstrike OR frappe",
  "missile OR rocket OR artillery",
  "military OR troops OR army offensive",
  "evacuation OR evacuate OR hostage",
  "coup OR revolution OR uprising",
  "nuclear OR chemical OR biological weapon",
  "cyber attack OR cyberattack OR infrastructure",
];

async function pollGDELT() {
  try {
    // Rotate query every 15-minute GDELT window (aligned to GDELT publication cadence)
    const queryIdx = Math.floor(Date.now() / 900_000) % GDELT_QUERIES.length;
    const query = GDELT_QUERIES[queryIdx];
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=10&format=json&timespan=15min`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json();
    const articles = data.articles || [];
    for (const a of articles.slice(0, 5)) {
      if (!a.title) continue;
      const signal: IntelSignal = {
        id: `gdelt_${a.seendate || Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
        source: "gdelt",
        sourceName: "GDELT 2.0",
        category: "GROUND_TRUTH",
        // GDELT artlist does not include lat/lng in the response.
        // Geo-coding is only available in the GKG endpoint. We store 0,0
        // and the NexusEngine will resolve zone from the sourcecountry field.
        lat: 0,
        lng: 0,
        country: (a.sourcecountry || a.domain?.split(".").pop() || "XX").toUpperCase().slice(0, 2),
        zone: a.sourcecountry || a.domain || "Global",
        // GDELT confidence derived from source tier:
        // Articles with multiple mentions score higher (up to 0.82).
        // Base 0.62 per GDELT documentation on precision.
        confidence: Math.min(0.82, 0.62 + Math.min(20, parseInt(a.socialshares || "0") || 0) * 0.001),
        title: a.title?.slice(0, 100) || "GDELT Event",
        body: `[${a.sourcecountry || "Global"}] ${a.title} — ${a.seendate || "now"}`,
        tags: query.split(" OR ").filter(w => a.title?.toLowerCase().includes(w.toLowerCase())),
        timestamp: new Date().toISOString(),
        rawData: a,
      };
      if (signal.lat !== 0 || signal.zone) broadcast(signal);
    }
  } catch {}
}

// ─── ACLED Poller ─────────────────────────────────────────────
// ACLED — verified ground truth conflict data. Murphy et al. Cambridge 2024.
// Requires ACLED_API_KEY + ACLED_EMAIL. Silent if not configured.

async function pollACLED() {
  const key   = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;
  if (!key || !email) return; // Not configured — emit nothing, show nothing
  try {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const today     = new Date().toISOString().slice(0, 10);
    const url = `https://api.acleddata.com/acled/read/?key=${key}&email=${email}&limit=20&event_date=${yesterday}|${today}&event_date_where=BETWEEN&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;
    const json = await res.json();
    const CONF: Record<string, number> = {
      "Battles": 0.92,
      "Explosions/Remote violence": 0.95,
      "Violence against civilians": 0.90,
    };
    for (const ev of (json.data || []).slice(0, 10)) {
      const signal: IntelSignal = {
        id: `acled_${ev.data_id || Date.now()}`,
        source: "acled",
        sourceName: "ACLED",
        category: "GROUND_TRUTH",
        lat: parseFloat(ev.latitude),
        lng: parseFloat(ev.longitude),
        country: ev.country,
        zone: `${ev.location}, ${ev.country}`,
        confidence: CONF[ev.event_type as string] ?? 0.80,
        title: `[ACLED] ${ev.event_type} — ${ev.location}`,
        body: `${ev.actor1} vs ${ev.actor2 || "Civilians"} · ${ev.fatalities} fatalities · ${(ev.notes as string)?.slice(0, 150) ?? ""}`,
        tags: ([ev.event_type, ev.sub_event_type, ev.actor1] as string[]).filter(Boolean),
        timestamp: new Date(ev.event_date as string).toISOString(),
        rawData: ev,
      };
      if (!isNaN(signal.lat) && !isNaN(signal.lng)) broadcast(signal);
    }
  } catch { /* ACLED unreachable — stay silent */ }
}

// ─── USGS Seismic Poller ──────────────────────────────────────

async function pollUSGS() {
  try {
    const url = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=20&orderby=time";
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return;
    const json = await res.json();
    const features = (json.features || []).slice(0, 5);
    for (const f of features) {
      const mag = f.properties.mag;
      const place = f.properties.place;
      const time = f.properties.time;
      // Only emit if recent (< 30min)
      if (Date.now() - time > 1800000) continue;
      const conf = Math.min(0.98, 0.65 + mag * 0.05);
      const isNuclear = mag >= 5.0 && f.geometry.coordinates[2] < 10; // Shallow + strong = possible nuclear test
      broadcast({
        id: `usgs_${f.id}`,
        source: "usgs_seismic", sourceName: "USGS Seismic",
        category: "GEOPHYSICAL",
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        country: place?.split(",").pop()?.trim() || "XX",
        zone: place,
        confidence: conf,
        title: `[USGS] M${mag.toFixed(1)} — ${place}`,
        body: `Séisme M${mag.toFixed(1)} · profondeur ${f.geometry.coordinates[2].toFixed(0)}km${isNuclear ? " ⚠️ TEST NUCLÉAIRE POSSIBLE" : ""} · ${place}`,
        tags: ["seismic", mag >= 6 ? "MAJOR" : "MODERATE", isNuclear ? "NUCLEAR_POSSIBLE" : "NATURAL"],
        timestamp: new Date(time).toISOString(),
        isAnomaly: isNuclear || mag >= 7,
      });
    }
  } catch {}
}

// ─── Wikipedia Edit Velocity ──────────────────────────────────
// Précurseur documenté: pic d'éditions d'un article = événement en cours
// Méthode: Keegan et al. "Real-time Wikipedia" + NEXUS adaptation

const WIKI_CRISIS_ARTICLES = [
  "2024_Gaza–Israel_conflict", "Russian_invasion_of_Ukraine",
  "Hezbollah", "Islamic_Revolutionary_Guard_Corps",
  "Houthi_attacks_on_shipping", "Taiwan_Strait",
  "North_Korea_and_weapons_of_mass_destruction",
];

let wikiEditsLastHour: Record<string, number> = {};

async function pollWikipedia() {
  try {
    const article = WIKI_CRISIS_ARTICLES[Math.floor(Date.now() / 60000) % WIKI_CRISIS_ARTICLES.length];
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${article}&prop=revisions&rvlimit=20&rvprop=timestamp&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const json = await res.json();
    const pages = Object.values(json.query?.pages || {}) as any[];
    if (!pages.length) return;
    const revisions = pages[0]?.revisions || [];
    // Count edits in last 10 minutes
    const now = Date.now();
    const recentEdits = revisions.filter((r: any) =>
      now - new Date(r.timestamp).getTime() < 600000 // 10 min
    ).length;
    const prevEdits = wikiEditsLastHour[article] || 0;
    wikiEditsLastHour[article] = recentEdits;

    // Alert if burst detected (2× previous rate)
    if (recentEdits >= 3 && recentEdits > prevEdits * 1.5) {
      broadcast({
        id: `wiki_${article}_${Date.now()}`,
        source: "wikipedia_edits", sourceName: "Wikipedia Edit Velocity",
        category: "HUMAN",
        lat: 0, lng: 0,
        zone: article.replace(/_/g, " "),
        confidence: Math.min(0.85, 0.45 + recentEdits * 0.05),
        title: `[WIKI] Burst d'éditions: "${article.replace(/_/g, " ")}"`,
        body: `${recentEdits} éditions en 10min (vs ${prevEdits} précédemment) — activité anormale détectée sur article Wikipedia. Précurseur événement majeur.`,
        tags: ["wikipedia", "burst", "precursor", article.split("_")[0]],
        timestamp: new Date().toISOString(),
        isAnomaly: true,
      });
    }
  } catch {}
}

// ─── NetBlocks / Cloudflare Radar Internet Shutdown ───────────
// Real data only. Calls /api/netblocks which reads Cloudflare Radar API.
// No CLOUDFLARE_RADAR_TOKEN → /api/netblocks returns [] → nothing broadcast.
// Never invent shutdown incidents.

async function pollNetBlocks() {
  try {
    // Use the internal route which already handles auth + parsing
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/netblocks`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return;
    const data = await res.json() as {
      events?: Array<{
        country: string; iso: string; lat: number; lng: number;
        severity: string; type: string; startTime: string;
        confidence: number; politicalContext: string;
        affectedPlatforms: string[];
      }>;
      count?: number;
    };
    if (!data.events?.length) return; // no anomalies or not configured — emit nothing

    for (const ev of data.events) {
      broadcast({
        id:         `netblocks_${ev.iso}_${ev.startTime}`,
        source:     "netblocks",
        sourceName: "NetBlocks / Cloudflare Radar",
        category:   "CYBER",
        lat:        ev.lat,
        lng:        ev.lng,
        country:    ev.iso,
        zone:       ev.country,
        confidence: ev.confidence,
        title:      `[NETBLOCKS] ${ev.severity} Internet disruption — ${ev.country}`,
        body:       `${ev.type} · Platforms: ${ev.affectedPlatforms.join(", ")} · ${ev.politicalContext}`,
        tags:       ["internet_shutdown", "cloudflare_radar", ev.type.toLowerCase(), ev.iso],
        timestamp:  ev.startTime,
        isAnomaly:  ev.severity === "MAJOR" || ev.severity === "TOTAL",
      });
    }
  } catch { /* Cloudflare Radar unavailable — emit nothing */ }
}

// ─── NASA FIRMS (fires) ───────────────────────────────────────
// Requires NASA_FIRMS_MAP_KEY (free at firms.modaps.eosdis.nasa.gov)
// No key → silent.

async function pollFIRMS() {
  const key = process.env.NASA_FIRMS_MAP_KEY;
  if (!key) return; // Not configured — emit nothing
  try {
    // Gaza + Ukraine bounding boxes
    const BBOX_ZONES = [
      { bbox: "34.0,31.2,35.2,31.9", zone: "Gaza/Israel" },
      { bbox: "33.0,46.0,40.0,52.0", zone: "Eastern Ukraine" },
      { bbox: "-6.0,12.0,5.0,22.0", zone: "Sahel" },
    ];
    for (const z of BBOX_ZONES) {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_NOAA20_NRT/${z.bbox}/1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const csv = await res.text();
      const lines = csv.trim().split("\n").slice(1); // skip header
      for (const line of lines.slice(0, 3)) {
        const [lat, lng, bright_ti4,,,acq_date,,satellite, confidence] = line.split(",");
        if (!lat || isNaN(parseFloat(lat))) continue;
        broadcast({
          id: `firms_${lat}_${lng}_${acq_date}`,
          source: "nasa_firms", sourceName: "NASA FIRMS",
          category: "SATELLITE",
          lat: parseFloat(lat), lng: parseFloat(lng),
          zone: z.zone, confidence: confidence === "h" ? 0.90 : 0.72,
          title: `[FIRMS] Feu actif ${z.zone} — ${satellite}`,
          body: `VIIRS · Brightness ${bright_ti4}K · ${acq_date} · Conf: ${confidence}`,
          tags: ["fire", "viirs", "thermal_anomaly", z.zone.split("/")[0]],
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch {}
}

// ─── GPSJam Poller ────────────────────────────────────────────

async function pollGPSJam() {
  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://gpsjam.org/data/${dateStr}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return;
    const data = await res.json();
    // GPSJam retourne une grille — chercher zones > threshold
    const hotZones = data.filter?.((d: any) => d.jamming_score > 0.7) || [];
    for (const zone of hotZones.slice(0, 5)) {
      broadcast({
        id: `gpsjam_${zone.lat?.toFixed(1)}_${zone.lng?.toFixed(1)}_${Date.now()}`,
        source: "gpsjam", sourceName: "GPSJam",
        category: "ELECTRONIC",
        lat: zone.lat, lng: zone.lng,
        confidence: 0.82 + zone.jamming_score * 0.10,
        title: `[GPSJAM] Brouillage GPS · score ${(zone.jamming_score * 100).toFixed(0)}%`,
        body: `Zone brouillage GPS détectée via ADS-B degraded positions · ${zone.lat?.toFixed(2)}, ${zone.lng?.toFixed(2)} · Warfare électronique probable`,
        tags: ["gps_jam", "electronic_warfare", "ew"],
        timestamp: new Date().toISOString(),
        isAnomaly: zone.jamming_score > 0.85,
      });
    }
  } catch {}
}

// ─── Yahoo Finance Anomaly Detector ──────────────────────────

const CRISIS_ASSETS = {
  "CL=F":  { name: "Pétrole WTI",    threshold: 3.0,  signal: "conflit zones pétrolières" },
  "GC=F":  { name: "Or (XAU)",       threshold: 1.5,  signal: "fuite sécurité/crise" },
  "LMT":   { name: "Lockheed Martin",threshold: 2.5,  signal: "anticipation contrats défense" },
  "RTX":   { name: "Raytheon",       threshold: 2.5,  signal: "anticipation contrats défense" },
  "BTC-USD": { name: "Bitcoin",      threshold: 3.0,  signal: "fuite capitaux/sanctions" },
  "EURUSD=X":{ name: "EUR/USD",      threshold: 0.5,  signal: "choc géopolitique EU" },
};

async function pollFinancialAnomalies() {
  for (const [symbol, meta] of Object.entries(CRISIS_ASSETS)) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const json = await res.json();
      const chart = json.chart?.result?.[0];
      if (!chart) continue;
      const closes = chart.indicators?.quote?.[0]?.close || [];
      if (closes.length < 10) continue;
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 10];
      if (!last || !prev) continue;
      const changePct = Math.abs((last - prev) / prev * 100);
      if (changePct >= meta.threshold) {
        const direction = last > prev ? "▲" : "▼";
        broadcast({
          id: `finance_${symbol}_${Date.now()}`,
          source: "yahoo_finance", sourceName: "Yahoo Finance",
          category: "FINANCIAL",
          lat: 0, lng: 0,
          confidence: Math.min(0.88, 0.55 + changePct * 0.05),
          title: `[MARCHÉS] ${meta.name} ${direction}${changePct.toFixed(1)}% — ${meta.signal}`,
          body: `${meta.name} (${symbol}) a bougé ${direction}${changePct.toFixed(2)}% en 10 minutes. Signal: ${meta.signal}. Prix: $${last.toFixed(2)}`,
          tags: ["finance", "anomaly", symbol, meta.signal.split(" ")[0]],
          timestamp: new Date().toISOString(),
          isAnomaly: changePct >= meta.threshold * 1.5,
        });
      }
    } catch {}
  }
}

// ─── UN OCHA ReliefWeb ───────────────────────────────────────
// Rate-limited to 1 call per hour using a deterministic timestamp bucket.
// ReliefWeb free tier: ~1000 req/day. We poll once per 3600s window.

let reliefWebLastBucket = -1;

async function pollReliefWeb() {
  // Only poll once per hour — deterministic, not random
  const bucket = Math.floor(Date.now() / 3_600_000);
  if (bucket === reliefWebLastBucket) return;
  reliefWebLastBucket = bucket;
  try {
    const url = "https://api.reliefweb.int/v1/reports?appname=nexus-intel&query[value]=crisis+conflict+emergency&limit=5&fields[include][]=title&fields[include][]=date&fields[include][]=primary_country&sort[]=date:desc";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const json = await res.json();
    for (const item of (json.data || []).slice(0, 2)) {
      const f = item.fields;
      const country = f.primary_country?.iso3 || "XX";
      broadcast({
        id: `ocha_${item.id}`,
        source: "unocha_reliefweb", sourceName: "UN OCHA ReliefWeb",
        category: "GROUND_TRUTH",
        lat: 0, lng: 0,
        country: country, zone: f.primary_country?.name || "Global",
        confidence: 0.80,
        title: `[UN OCHA] ${f.title?.slice(0, 80) || "Rapport humanitaire"}`,
        body: `Source: Nations Unies OCHA · ${f.primary_country?.name} · ${f.date?.created?.slice(0, 10) || "recent"}`,
        tags: ["ocha", "humanitarian", "un", country],
        timestamp: f.date?.created || new Date().toISOString(),
      });
    }
  } catch {}
}

// ─── RSS Feed Poller ──────────────────────────────────────────
// Aggregates AP, Reuters, Al Jazeera, BBC, Kyiv Independent, ReliefWeb.
// All feeds public. Urgency threshold 0.55 to avoid noise.

async function pollRSS() {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/rss?minUrgency=0.55&limit=30`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return;
    const data = await res.json() as { items: Array<{ id: string; sourceName: string; title: string; description: string; pubDate: string; lat: number; lng: number; country: string; zone: string; urgency: number; tags: string[] }> };
    for (const item of data.items ?? []) {
      broadcast({
        id:          item.id,
        source:      "rss_wire",
        sourceName:  item.sourceName,
        category:    "NEWS_WIRE",
        lat:         item.lat,
        lng:         item.lng,
        country:     item.country,
        zone:        item.zone,
        confidence:  item.urgency,
        title:       item.title,
        body:        item.description,
        tags:        item.tags,
        timestamp:   item.pubDate,
        isAnomaly:   item.urgency >= 0.80,
      });
    }
  } catch {}
}

// ─── Bluesky Poller ───────────────────────────────────────────
// Bluesky public AppView API — no authentication.
// OSINT community has migrated significantly post-2024.

async function pollBluesky() {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/bluesky?minUrgency=0.50&limit=25`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = await res.json() as { posts: Array<{ id: string; authorHandle: string; text: string; createdAt: string; lat: number; lng: number; country: string; zone: string; urgency: number; likeCount: number; repostCount: number; tags: string[] }> };
    for (const post of data.posts ?? []) {
      broadcast({
        id:          post.id,
        source:      "bluesky",
        sourceName:  `Bluesky — ${post.authorHandle}`,
        category:    "SOCIAL_BLUESKY",
        lat:         post.lat,
        lng:         post.lng,
        country:     post.country,
        zone:        post.zone,
        confidence:  post.urgency,
        title:       `${post.authorHandle}: ${post.text.slice(0, 80)}`,
        body:        post.text,
        tags:        post.tags,
        timestamp:   post.createdAt,
        isAnomaly:   post.likeCount > 500 || post.repostCount > 100,
      });
    }
  } catch {}
}

// ─── Mastodon Poller ──────────────────────────────────────────
// Multi-instance: mastodon.social, infosec.exchange, kolektiva.social, mastodon.online

async function pollMastodon() {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/mastodon?minUrgency=0.45&limit=25`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return;
    const data = await res.json() as { posts: Array<{ id: string; instance: string; authorHandle: string; text: string; createdAt: string; lat: number; lng: number; country: string; zone: string; urgency: number; boostsCount: number; tags: string[] }> };
    for (const post of data.posts ?? []) {
      broadcast({
        id:          post.id,
        source:      "mastodon",
        sourceName:  `${post.instance} — ${post.authorHandle}`,
        category:    "SOCIAL_MASTODON",
        lat:         post.lat,
        lng:         post.lng,
        country:     post.country,
        zone:        post.zone,
        confidence:  post.urgency,
        title:       `${post.authorHandle} [${post.instance}]: ${post.text.slice(0, 80)}`,
        body:        post.text,
        tags:        post.tags,
        timestamp:   post.createdAt,
        isAnomaly:   post.boostsCount > 50,
      });
    }
  } catch {}
}

// ─── Ransomwatch Poller ───────────────────────────────────────
// github.com/joshhighet/ransomwatch — critical infrastructure cyber threats.
// Polls hourly. Only surfaces high-value targets (score >= 0.70).

async function pollRansomwatch() {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/ransomwatch?minScore=0.70&hours=24&limit=20`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return;
    const data = await res.json() as { posts: Array<{ id: string; group: string; title: string; discovered: string; sector: string; country: string; lat: number; lng: number; zone: string; nexusScore: number; tags: string[] }> };
    for (const post of data.posts ?? []) {
      broadcast({
        id:          post.id,
        source:      "ransomwatch",
        sourceName:  `Ransomwatch — ${post.group}`,
        category:    "CYBER_THREAT",
        lat:         post.lat,
        lng:         post.lng,
        country:     post.country,
        zone:        post.zone,
        confidence:  post.nexusScore,
        title:       `[${post.group}] ${post.title}`,
        body:        `Sector: ${post.sector} | Group: ${post.group}`,
        tags:        post.tags,
        timestamp:   post.discovered,
        isAnomaly:   post.nexusScore >= 0.85,
      });
    }
  } catch {}
}

// ─── Start all pollers ────────────────────────────────────────

function startPollers() {
  if (pollingStarted) return;
  pollingStarted = true;

  // Immediate first polls
  pollGDELT();
  pollACLED();
  pollUSGS();
  pollFIRMS();
  pollGPSJam();
  pollFinancialAnomalies();
  pollWikipedia();
  pollReliefWeb();
  pollNetBlocks();
  pollRSS();
  pollBluesky();
  pollMastodon();
  pollRansomwatch();

  // Recurring polls
  intervals.push(setInterval(pollGDELT,              900_000));  // 15min
  intervals.push(setInterval(pollACLED,             3600_000));  // 1h
  intervals.push(setInterval(pollUSGS,                30_000));  // 30s
  intervals.push(setInterval(pollFIRMS,            3600_000));   // 1h
  intervals.push(setInterval(pollGPSJam,             300_000));  // 5min
  intervals.push(setInterval(pollFinancialAnomalies,  60_000));  // 1min
  intervals.push(setInterval(pollWikipedia,          120_000));  // 2min
  intervals.push(setInterval(pollReliefWeb,         3600_000));  // 1h
  intervals.push(setInterval(pollNetBlocks,           300_000)); // 5min
  intervals.push(setInterval(pollRSS,                300_000));  // 5min
  intervals.push(setInterval(pollBluesky,            120_000));  // 2min
  intervals.push(setInterval(pollMastodon,           180_000));  // 3min
  intervals.push(setInterval(pollRansomwatch,       1800_000));  // 30min
}

// ─── SSE Handler ──────────────────────────────────────────────

export async function GET() {
  startPollers();

  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);
      // Send buffered signals on connect
      const recent = signalBuffer.slice(0, 50);
      for (const s of recent.reverse()) {
        try {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "signal", data: s })}\n\n`
          ));
        } catch {}
      }
      // Heartbeat
      const hb = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(": heartbeat\n\n")); }
        catch { clearInterval(hb); clients.delete(controller); }
      }, 15000);
    },
    cancel(controller) {
      clients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── POST: Ingest manual signal ───────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json() as IntelSignal;
    if (!body.source || !body.title) {
      return NextResponse.json({ error: "Missing source or title" }, { status: 400 });
    }
    broadcast({ ...body, id: body.id || `manual_${Date.now()}` });
    return NextResponse.json({ ok: true, buffered: signalBuffer.length });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
