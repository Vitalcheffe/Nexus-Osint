import { NextResponse } from "next/server";

/**
 * Ransomwatch Threat Intelligence Feed
 * GET /api/ransomwatch
 *
 * Source: github.com/joshhighet/ransomwatch
 * A community-maintained aggregator of ransomware group leak sites.
 * Updated continuously. No authentication required.
 *
 * JSON feed: https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json
 * Groups:    https://raw.githubusercontent.com/joshhighet/ransomwatch/main/groups.json
 *
 * NEXUS relevance:
 *   - Infrastructure attacks on critical sectors (energy, government, defense, health)
 *   - Geopolitical targeting patterns (ransomware groups often correlate with nation-state activity)
 *   - Early warning: ransomware listings often precede public disclosure by days/weeks
 *
 * Filtering: we surface only posts from the last 72 hours targeting
 * high-value sectors. Low-value targets (small businesses, etc.) are excluded.
 */

interface RansomPost {
  id:           string;
  group:        string;
  title:        string;
  discovered:   string;
  description:  string | null;
  website:      string | null;
  sector:       string;
  country:      string;
  lat:          number;
  lng:          number;
  zone:         string;
  nexusScore:   number;   // 0-1 intelligence relevance
  tags:         string[];
}

// ─── High-value sector detection ─────────────────────────────

const SECTOR_PATTERNS: Array<{ terms: string[]; sector: string; score: number }> = [
  { terms: ["government", "ministry", "federal", "defense", "military", "nato", "army"],
    sector: "GOVERNMENT/DEFENSE", score: 0.90 },
  { terms: ["energy", "oil", "gas", "pipeline", "power", "electric", "nuclear", "refinery"],
    sector: "ENERGY/CRITICAL",    score: 0.88 },
  { terms: ["finance", "bank", "swift", "insurance", "stock", "exchange", "treasury"],
    sector: "FINANCE",            score: 0.82 },
  { terms: ["hospital", "health", "medical", "pharma", "clinic", "healthcare"],
    sector: "HEALTHCARE",         score: 0.75 },
  { terms: ["telecom", "isp", "internet", "carrier", "network provider", "broadband"],
    sector: "TELECOM",            score: 0.78 },
  { terms: ["transport", "airline", "airport", "railway", "port", "logistics", "shipping"],
    sector: "TRANSPORT",          score: 0.72 },
  { terms: ["water", "wastewater", "dam", "utility"],
    sector: "WATER/UTILITY",      score: 0.80 },
  { terms: ["university", "research", "institute", "laboratory"],
    sector: "RESEARCH",           score: 0.60 },
];

function classifySector(title: string, desc: string | null): { sector: string; score: number } {
  const text = `${title} ${desc ?? ""}`.toLowerCase();
  for (const { terms, sector, score } of SECTOR_PATTERNS) {
    if (terms.some(t => text.includes(t))) return { sector, score };
  }
  return { sector: "CORPORATE", score: 0.25 };
}

// ─── Country → geo lookup ─────────────────────────────────────

const COUNTRY_GEO: Record<string, { lat: number; lng: number; zone: string }> = {
  US: { lat: 38.90,  lng: -77.04,  zone: "United States" },
  GB: { lat: 51.50,  lng: -0.13,   zone: "United Kingdom" },
  DE: { lat: 52.52,  lng: 13.40,   zone: "Germany" },
  FR: { lat: 48.86,  lng: 2.35,    zone: "France" },
  UA: { lat: 49.00,  lng: 32.00,   zone: "Ukraine" },
  IL: { lat: 32.08,  lng: 34.78,   zone: "Israel" },
  RU: { lat: 55.75,  lng: 37.62,   zone: "Russia" },
  CN: { lat: 39.91,  lng: 116.39,  zone: "China" },
  KR: { lat: 37.57,  lng: 126.98,  zone: "South Korea" },
  JP: { lat: 35.69,  lng: 139.69,  zone: "Japan" },
  AU: { lat: -33.87, lng: 151.21,  zone: "Australia" },
  CA: { lat: 45.42,  lng: -75.69,  zone: "Canada" },
  IN: { lat: 28.61,  lng: 77.21,   zone: "India" },
  SA: { lat: 24.69,  lng: 46.72,   zone: "Saudi Arabia" },
  AE: { lat: 24.45,  lng: 54.38,   zone: "UAE" },
  PL: { lat: 52.23,  lng: 21.01,   zone: "Poland" },
  TR: { lat: 39.92,  lng: 32.85,   zone: "Turkey" },
  IR: { lat: 35.69,  lng: 51.39,   zone: "Iran" },
};

function getGeo(country: string): { lat: number; lng: number; zone: string } {
  return COUNTRY_GEO[country] ?? { lat: 0, lng: 0, zone: "Global" };
}

// ─── Known high-profile ransomware groups (geopolitical relevance) ─

const NATION_STATE_ADJACENT = new Set([
  "lockbit", "blackcat", "clop", "hive", "darkside", "revil", "conti",
  "ryuk", "maze", "evilcorp", "lazarus", "apt41", "sandworm", "cozy bear",
  "fancy bear", "black basta", "akira", "play", "alphv", "rhysida",
]);

// ─── RansomWatch data types ───────────────────────────────────

interface RWPost {
  post_title:  string;
  group_name:  string;
  discovered:  string;
  description: string | null;
  website:     string | null;
  country?:    string;
}

// ─── Fetcher ──────────────────────────────────────────────────

async function fetchRansomwatchPosts(): Promise<RWPost[]> {
  const res = await fetch(
    "https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json",
    {
      signal: AbortSignal.timeout(10_000),
      // @ts-ignore — Next.js fetch extension
      next: { revalidate: 1800 },  // cache 30min — data updates ~hourly
    }
  );
  if (!res.ok) throw new Error(`ransomwatch fetch failed: ${res.status}`);
  return await res.json() as RWPost[];
}

// ─── Handler ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minScore  = parseFloat(searchParams.get("minScore") ?? "0.50");
  const hoursBack = parseInt(searchParams.get("hours")     ?? "72");
  const limit     = parseInt(searchParams.get("limit")     ?? "50");

  let rawPosts: RWPost[];
  try {
    rawPosts = await fetchRansomwatchPosts();
  } catch (e) {
    return NextResponse.json({
      posts:   [],
      source:  "ransomwatch",
      error:   String(e),
      reason:  "GitHub raw content unreachable.",
    }, { status: 503 });
  }

  const cutoff = Date.now() - hoursBack * 3_600_000;

  const posts: RansomPost[] = rawPosts
    .filter(p => {
      if (!p.discovered) return false;
      const ts = new Date(p.discovered).getTime();
      return ts >= cutoff && !isNaN(ts);
    })
    .map((p, i) => {
      const { sector, score } = classifySector(p.post_title, p.description);
      const country = (p.country ?? "XX").toUpperCase();
      const geo     = getGeo(country);
      const groupLower = p.group_name.toLowerCase();

      // Boost score if group is nation-state adjacent
      const nsBoost = NATION_STATE_ADJACENT.has(groupLower) ? 0.10 : 0;
      const finalScore = Math.min(1, score + nsBoost);

      const tags: string[] = [sector.toLowerCase().replace("/", "_"), p.group_name];
      if (nsBoost > 0) tags.push("nation_state_adjacent");

      return {
        id:          `rw_${p.group_name}_${i}_${new Date(p.discovered).getTime()}`,
        group:       p.group_name,
        title:       p.post_title,
        discovered:  new Date(p.discovered).toISOString(),
        description: p.description ? p.description.slice(0, 300) : null,
        website:     p.website,
        sector,
        country,
        lat:         geo.lat,
        lng:         geo.lng,
        zone:        geo.zone,
        nexusScore:  parseFloat(finalScore.toFixed(3)),
        tags,
      } satisfies RansomPost;
    })
    .filter(p => p.nexusScore >= minScore)
    .sort((a, b) => b.nexusScore - a.nexusScore || new Date(b.discovered).getTime() - new Date(a.discovered).getTime())
    .slice(0, limit);

  return NextResponse.json({
    posts,
    count:      posts.length,
    rawCount:   rawPosts.length,
    cutoffHours: hoursBack,
    source:     "ransomwatch_github",
    url:        "https://github.com/joshhighet/ransomwatch",
    timestamp:  new Date().toISOString(),
  });
}
