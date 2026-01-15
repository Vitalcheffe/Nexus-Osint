import { NextResponse } from "next/server";

/**
 * Mastodon Intelligence Aggregator
 * GET /api/mastodon
 *
 * Aggregates posts from multiple Mastodon instances with OSINT-relevant communities.
 * All endpoints are public — no auth token required for read access.
 *
 * API: GET /api/v1/timelines/tag/{hashtag}?limit=40
 * Rate limit: ~300 requests per 5 minutes per IP (generous).
 *
 * Instances monitored:
 *   mastodon.social   — largest instance, journalists/reporters
 *   infosec.exchange  — cybersecurity and OSINT analysts
 *   kolektiva.social  — field reporters, activist journalism
 *   mastodon.online   — general, has significant news community
 *   sigmoid.social    — researchers and analysts
 *
 * Hashtags monitored per instance — selected for OSINT relevance.
 */

interface MastodonPost {
  id:            string;
  instance:      string;
  author:        string;
  authorHandle:  string;
  text:          string;
  createdAt:     string;
  lat:           number;
  lng:           number;
  country:       string;
  zone:          string;
  urgency:       number;
  boostsCount:   number;
  repliesCount:  number;
  hasMedia:      boolean;
  tags:          string[];
  url:           string;
}

// ─── Instance + hashtag matrix ────────────────────────────────

const INSTANCE_QUERIES: Array<{
  instance: string;
  tags:     string[];
  weight:   number;
}> = [
  {
    instance: "mastodon.social",
    tags:     ["ukraine", "gaza", "osint", "geoint", "breaking", "conflict"],
    weight:   0.85,
  },
  {
    instance: "infosec.exchange",
    tags:     ["osint", "cyber", "infosec", "geoint", "threat"],
    weight:   0.90,
  },
  {
    instance: "kolektiva.social",
    tags:     ["ukraine", "war", "conflict", "gaza", "sahel"],
    weight:   0.78,
  },
  {
    instance: "mastodon.online",
    tags:     ["breaking", "ukraine", "conflict", "israel"],
    weight:   0.75,
  },
];

// ─── Urgency scoring ──────────────────────────────────────────

const URGENCY_TERMS: Array<{ terms: string[]; score: number }> = [
  { terms: ["airstrike", "missile", "bomb", "explosion", "rocket"],   score: 0.88 },
  { terms: ["attack", "offensive", "invasion", "troops"],             score: 0.78 },
  { terms: ["breaking", "urgent", "alert", "developing"],             score: 0.70 },
  { terms: ["killed", "casualties", "wounded", "civilian"],           score: 0.75 },
  { terms: ["military", "navy", "convoy", "warship", "fighter jet"],  score: 0.60 },
  { terms: ["cyber", "hack", "ransomware", "outage"],                 score: 0.65 },
  { terms: ["sanctions", "ceasefire", "peace"],                       score: 0.40 },
];

function scoreUrgency(text: string, weight: number): number {
  const lower = text.toLowerCase();
  let max = 0.15;
  for (const { terms, score } of URGENCY_TERMS) {
    if (terms.some(t => lower.includes(t))) max = Math.max(max, score);
  }
  return max * weight;
}

// ─── Coarse geolocation ───────────────────────────────────────

const GEO: Array<{ terms: string[]; lat: number; lng: number; country: string; zone: string }> = [
  { terms: ["israel", "gaza", "idf", "hamas", "tel aviv", "jerusalem"],
    lat: 32.08, lng: 34.78,  country: "IL", zone: "Israel/Palestine" },
  { terms: ["ukraine", "kyiv", "kharkiv", "odesa", "donbas"],
    lat: 49.00, lng: 32.00,  country: "UA", zone: "Ukraine" },
  { terms: ["russia", "moscow", "kremlin", "russian"],
    lat: 55.75, lng: 37.62,  country: "RU", zone: "Russia" },
  { terms: ["iran", "tehran", "irgc"],
    lat: 35.69, lng: 51.39,  country: "IR", zone: "Iran" },
  { terms: ["taiwan", "taipei", "pla", "strait"],
    lat: 25.03, lng: 121.56, country: "TW", zone: "Taiwan Strait" },
  { terms: ["red sea", "houthi", "yemen", "aden"],
    lat: 15.55, lng: 42.55,  country: "YE", zone: "Red Sea" },
  { terms: ["north korea", "dprk", "pyongyang"],
    lat: 39.01, lng: 125.73, country: "KP", zone: "Korean Peninsula" },
  { terms: ["sahel", "mali", "niger", "burkina", "wagner"],
    lat: 17.57, lng: -3.99,  country: "ML", zone: "Sahel" },
  { terms: ["cyber", "hack", "ransomware", "breach", "infrastructure"],
    lat: 0,    lng: 0,       country: "XX", zone: "Cyber" },
];

function geoFromText(text: string): { lat: number; lng: number; country: string; zone: string } {
  const lower = text.toLowerCase();
  for (const e of GEO) {
    if (e.terms.some(t => lower.includes(t))) return { lat: e.lat, lng: e.lng, country: e.country, zone: e.zone };
  }
  return { lat: 0, lng: 0, country: "XX", zone: "Global" };
}

// ─── Strip HTML from Mastodon content ─────────────────────────

function stripHTML(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .trim();
}

// ─── Mastodon API call ────────────────────────────────────────

interface MastodonStatus {
  id:            string;
  content:       string;
  created_at:    string;
  url:           string;
  reblogs_count: number;
  replies_count: number;
  media_attachments: unknown[];
  account: {
    username:     string;
    display_name: string;
    acct:         string;
  };
  tags: Array<{ name: string }>;
}

async function fetchTagTimeline(instance: string, tag: string, weight: number): Promise<MastodonPost[]> {
  try {
    const url = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=20`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(7000),
      // @ts-ignore — Next.js fetch extension
      next: { revalidate: 180 },
    });
    if (!res.ok) return [];

    const statuses = await res.json() as MastodonStatus[];
    const now = Date.now();

    return statuses
      .filter(s => {
        // Skip older than 3 hours
        return now - new Date(s.created_at).getTime() < 10_800_000;
      })
      .map(s => {
        const text = stripHTML(s.content);
        const geo  = geoFromText(text);
        const tags = s.tags.map(t => t.name);

        return {
          id:            `masto_${instance.split(".")[0]}_${s.id}`,
          instance,
          author:        s.account.display_name || s.account.username,
          authorHandle:  `@${s.account.acct}`,
          text:          text.slice(0, 400),
          createdAt:     s.created_at,
          lat:           geo.lat,
          lng:           geo.lng,
          country:       geo.country,
          zone:          geo.zone,
          urgency:       parseFloat(scoreUrgency(text, weight).toFixed(3)),
          boostsCount:   s.reblogs_count,
          repliesCount:  s.replies_count,
          hasMedia:      s.media_attachments.length > 0,
          tags,
          url:           s.url,
        } satisfies MastodonPost;
      });
  } catch {
    return [];
  }
}

// ─── Handler ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minUrgency = parseFloat(searchParams.get("minUrgency") ?? "0.25");
  const limit      = parseInt(searchParams.get("limit")       ?? "80");

  // Build list of (instance, tag) pairs — rotate to spread load
  const allPairs: Array<{ instance: string; tag: string; weight: number }> = [];
  for (const cfg of INSTANCE_QUERIES) {
    for (const tag of cfg.tags) {
      allPairs.push({ instance: cfg.instance, tag, weight: cfg.weight });
    }
  }

  // Fetch a rotating 8-pair batch every 3 minutes
  const batchSize = 8;
  const offset    = Math.floor(Date.now() / 180_000) % Math.ceil(allPairs.length / batchSize) * batchSize;
  const batch     = allPairs.slice(offset, offset + batchSize);

  const results = await Promise.all(
    batch.map(({ instance, tag, weight }) => fetchTagTimeline(instance, tag, weight))
  );
  const all = results.flat();

  // Deduplicate by id
  const seen  = new Set<string>();
  const dedup = all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

  const filtered = dedup
    .filter(p => p.urgency >= minUrgency)
    .sort((a, b) => b.urgency - a.urgency || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return NextResponse.json({
    posts:      filtered,
    count:      filtered.length,
    instances:  [...new Set(INSTANCE_QUERIES.map(i => i.instance))],
    timestamp:  new Date().toISOString(),
    source:     "mastodon_public_api",
  });
}
