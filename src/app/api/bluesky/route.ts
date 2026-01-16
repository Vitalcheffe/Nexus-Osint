import { NextResponse } from "next/server";

/**
 * Bluesky Intelligence Feed
 * GET /api/bluesky
 *
 * Uses the Bluesky public AppView API (no authentication required for search).
 * Endpoint: https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
 *
 * The OSINT and conflict-reporting community has significantly migrated to Bluesky
 * following Twitter API access changes in 2023-2024.
 *
 * Key accounts monitored (via search queries):
 *   - Conflict reporters: @bellingcat.bsky.social, @christopherm.bsky.social
 *   - OSINT analysts: multiple accounts with #OSINT #geoint tags
 *   - Real-time event reports with geo-tags or location mentions
 *
 * Rate limits: ~3000 requests/5 min per IP on public API.
 * We batch queries and cache for 2 minutes to stay well within limits.
 */

interface BlueskyPost {
  id:          string;
  author:      string;
  authorHandle:string;
  text:        string;
  createdAt:   string;
  lat:         number;
  lng:         number;
  country:     string;
  zone:        string;
  urgency:     number;
  likeCount:   number;
  repostCount: number;
  hasMedia:    boolean;
  tags:        string[];
}

// ─── Urgency keywords ─────────────────────────────────────────

const URGENCY_MAP: Array<{ terms: string[]; score: number }> = [
  { terms: ["airstrike", "missile", "explosion", "rocket launch", "bomb"],        score: 0.90 },
  { terms: ["attack", "strike", "offensive", "invasion", "frappe", "military"],   score: 0.80 },
  { terms: ["breaking", "urgent", "developing", "alert", "emergency"],            score: 0.72 },
  { terms: ["killed", "casualties", "dead", "wounded", "civilian"],               score: 0.75 },
  { terms: ["troops", "military movement", "convoy", "naval", "warship"],         score: 0.65 },
  { terms: ["sanction", "ceasefire", "negotiation", "peace deal"],                score: 0.45 },
];

function scoreUrgency(text: string): number {
  const lower = text.toLowerCase();
  let max = 0.15;
  for (const { terms, score } of URGENCY_MAP) {
    if (terms.some(t => lower.includes(t))) max = Math.max(max, score);
  }
  return max;
}

// ─── Coarse geo lookup ────────────────────────────────────────

const GEO: Array<{ terms: string[]; lat: number; lng: number; country: string; zone: string }> = [
  { terms: ["israel", "gaza", "idf", "hamas", "tel aviv", "jerusalem"],
    lat: 32.08,  lng: 34.78,  country: "IL", zone: "Israel/Palestine" },
  { terms: ["ukraine", "kyiv", "kharkiv", "odesa", "zaporizhzhia"],
    lat: 49.00,  lng: 32.00,  country: "UA", zone: "Ukraine" },
  { terms: ["russia", "moscow", "putin", "russian"],
    lat: 55.75,  lng: 37.62,  country: "RU", zone: "Russia" },
  { terms: ["iran", "tehran", "irgc", "iranian"],
    lat: 35.69,  lng: 51.39,  country: "IR", zone: "Iran" },
  { terms: ["taiwan", "taipei", "taiwan strait", "pla"],
    lat: 25.03,  lng: 121.56, country: "TW", zone: "Taiwan Strait" },
  { terms: ["red sea", "houthi", "yemen"],
    lat: 15.55,  lng: 42.55,  country: "YE", zone: "Red Sea" },
  { terms: ["north korea", "dprk", "pyongyang"],
    lat: 39.01,  lng: 125.73, country: "KP", zone: "Korean Peninsula" },
  { terms: ["sahel", "mali", "niger", "burkina"],
    lat: 17.57,  lng: -3.99,  country: "ML", zone: "Sahel" },
  { terms: ["china", "beijing", "south china sea"],
    lat: 39.91,  lng: 116.39, country: "CN", zone: "China" },
  { terms: ["lebanon", "beirut", "hezbollah"],
    lat: 33.89,  lng: 35.50,  country: "LB", zone: "Lebanon" },
];

function geoFromText(text: string): { lat: number; lng: number; country: string; zone: string } {
  const lower = text.toLowerCase();
  for (const entry of GEO) {
    if (entry.terms.some(t => lower.includes(t))) {
      return { lat: entry.lat, lng: entry.lng, country: entry.country, zone: entry.zone };
    }
  }
  return { lat: 0, lng: 0, country: "XX", zone: "Global" };
}

// ─── Bluesky search queries ───────────────────────────────────

const QUERIES = [
  "airstrike OR missile OR explosion breaking",
  "OSINT military conflict geopolitics",
  "ukraine russia frontline",
  "israel gaza hamas hezbollah",
  "iran nuclear taiwan strait",
  "red sea houthi shipping attack",
  "coup military takeover emergency",
  "cyber attack infrastructure breach",
];

// ─── Bluesky API call ─────────────────────────────────────────

interface BskySearchResult {
  posts: Array<{
    uri:   string;
    cid:   string;
    author: { handle: string; displayName?: string };
    record: {
      text:      string;
      createdAt: string;
      embed?:    unknown;
    };
    likeCount:   number;
    repostCount: number;
    indexedAt:   string;
  }>;
}

async function searchBluesky(query: string, limit = 25): Promise<BlueskyPost[]> {
  try {
    const params = new URLSearchParams({
      q:     query,
      limit: String(Math.min(limit, 25)),
      sort:  "latest",
    });

    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`,
      {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(6000),
        // @ts-ignore — Next.js fetch extension
        next: { revalidate: 120 },
      }
    );

    if (!res.ok) return [];
    const data = await res.json() as BskySearchResult;

    return (data.posts ?? []).map(post => {
      const text    = post.record.text;
      const created = post.record.createdAt || post.indexedAt;
      const geo     = geoFromText(text);
      const urgency = scoreUrgency(text);

      // Skip older than 4 hours
      if (Date.now() - new Date(created).getTime() > 14_400_000) return null;

      const tags: string[] = [];
      const hashtagPattern = /#(\w+)/g;
      let m: RegExpExecArray | null;
      while ((m = hashtagPattern.exec(text)) !== null) {
        tags.push(m[1].toLowerCase());
      }

      return {
        id:           `bsky_${post.cid.slice(0, 12)}`,
        author:       post.author.displayName || post.author.handle,
        authorHandle: `@${post.author.handle}`,
        text:         text.slice(0, 400),
        createdAt:    created,
        lat:          geo.lat,
        lng:          geo.lng,
        country:      geo.country,
        zone:         geo.zone,
        urgency:      parseFloat(urgency.toFixed(3)),
        likeCount:    post.likeCount   ?? 0,
        repostCount:  post.repostCount ?? 0,
        hasMedia:     !!post.record.embed,
        tags,
      } satisfies BlueskyPost;
    }).filter((p): p is BlueskyPost => p !== null);
  } catch {
    return [];
  }
}

// ─── Handler ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minUrgency = parseFloat(searchParams.get("minUrgency") ?? "0.3");
  const limit      = parseInt(searchParams.get("limit")       ?? "80");

  // Fetch a rotating subset of queries to spread API usage
  const batchSize = 3;
  const offset    = Math.floor(Date.now() / 120_000) % Math.ceil(QUERIES.length / batchSize) * batchSize;
  const batch     = QUERIES.slice(offset, offset + batchSize);

  const results = await Promise.all(batch.map(q => searchBluesky(q, 20)));
  const all     = results.flat();

  // Deduplicate by CID fragment
  const seen  = new Set<string>();
  const dedup = all.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

  const filtered = dedup
    .filter(p => p.urgency >= minUrgency)
    .sort((a, b) => b.urgency - a.urgency || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return NextResponse.json({
    posts:     filtered,
    count:     filtered.length,
    queries:   batch,
    timestamp: new Date().toISOString(),
    source:    "bluesky_public_api",
  });
}
