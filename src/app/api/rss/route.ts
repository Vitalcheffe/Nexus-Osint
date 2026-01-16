import { NextResponse } from "next/server";

/**
 * RSS Intelligence Aggregator
 * GET /api/rss
 *
 * Aggregates RSS/Atom feeds from major wire services and OSINT-relevant outlets.
 * All feeds are public, no authentication required.
 *
 * Sources:
 *   AP News          — https://apnews.com/rss (world, politics, top news)
 *   Reuters          — https://feeds.reuters.com/reuters/worldNews
 *   Al Jazeera EN    — https://www.aljazeera.com/xml/rss/all.xml
 *   Kyiv Independent — https://kyivindependent.com/feed
 *   Times of Israel  — https://www.timesofisrael.com/feed
 *   AFP (via Google) — https://news.google.com/rss/search?q=AFP+breaking
 *   OCHA ReliefWeb   — https://reliefweb.int/updates/rss.xml
 *   The Guardian     — https://www.theguardian.com/world/rss
 *
 * Deduplication: items within 6 hours with Jaccard title similarity > 0.7 are merged.
 * Geolocation: coarse — matches article text against country/city name dictionary.
 */

interface RSSItem {
  id:          string;
  source:      string;
  sourceName:  string;
  title:       string;
  description: string;
  url:         string;
  pubDate:     string;
  lat:         number;
  lng:         number;
  country:     string;
  zone:        string;
  urgency:     number;  // 0-1
  tags:        string[];
}

// ─── Feed definitions ──────────────────────────────────────────

const FEEDS: Array<{
  url: string;
  name: string;
  id: string;
  weight: number;
}> = [
  { url: "https://apnews.com/rss",                                  name: "AP News",          id: "ap",        weight: 0.92 },
  { url: "https://feeds.reuters.com/reuters/worldNews",             name: "Reuters",           id: "reuters",   weight: 0.91 },
  { url: "https://www.aljazeera.com/xml/rss/all.xml",               name: "Al Jazeera",        id: "aljazeera", weight: 0.85 },
  { url: "https://kyivindependent.com/feed",                        name: "Kyiv Independent",  id: "kyivindep", weight: 0.82 },
  { url: "https://www.timesofisrael.com/feed",                      name: "Times of Israel",   id: "toi",       weight: 0.80 },
  { url: "https://reliefweb.int/updates/rss.xml",                   name: "OCHA ReliefWeb",    id: "reliefweb", weight: 0.88 },
  { url: "https://www.theguardian.com/world/rss",                   name: "The Guardian",      id: "guardian",  weight: 0.80 },
  { url: "https://www.bbc.com/news/world/rss.xml",                  name: "BBC World",         id: "bbc",       weight: 0.83 },
];

// ─── Urgency keywords (scored by severity) ────────────────────

const URGENCY_TERMS: Array<{ terms: string[]; score: number }> = [
  { terms: ["nuclear", "chemical weapon", "biological weapon", "dirty bomb"],      score: 0.95 },
  { terms: ["explosion", "airstrike", "missile", "rocket", "bomb"],               score: 0.88 },
  { terms: ["attack", "strike", "frappe", "assault", "offensive", "invasion"],     score: 0.82 },
  { terms: ["killed", "casualties", "dead", "wounded", "fatalities"],              score: 0.78 },
  { terms: ["breaking", "urgent", "alert", "emergency", "crisis"],                 score: 0.75 },
  { terms: ["military", "troops", "forces", "navy", "air force", "army"],          score: 0.62 },
  { terms: ["evacuation", "withdraw", "retreat", "ceasefire", "negotiation"],      score: 0.55 },
  { terms: ["sanction", "embargo", "diplomat", "summit", "agreement"],             score: 0.40 },
];

function computeUrgency(title: string, description: string): number {
  const text = `${title} ${description}`.toLowerCase();
  let max = 0.10;
  for (const { terms, score } of URGENCY_TERMS) {
    if (terms.some(t => text.includes(t))) max = Math.max(max, score);
  }
  return max;
}

// ─── Coarse geolocation from article text ────────────────────

const GEO_INDEX: Array<{
  terms: string[];
  lat: number;
  lng: number;
  country: string;
  zone: string;
}> = [
  { terms: ["israel", "tel aviv", "jerusalem", "haifa", "idf", "gaza", "rafah", "hamas", "hezbollah"],
    lat: 32.08, lng: 34.78, country: "IL", zone: "Israel/Palestine" },
  { terms: ["ukraine", "kyiv", "kharkiv", "odesa", "zaporizhzhia", "kherson", "donetsk", "donbas"],
    lat: 49.0, lng: 32.0, country: "UA", zone: "Ukraine" },
  { terms: ["russia", "moscow", "kremlin", "putin", "russian"],
    lat: 55.75, lng: 37.62, country: "RU", zone: "Russia" },
  { terms: ["iran", "tehran", "isfahan", "irgc", "iranian"],
    lat: 35.69, lng: 51.39, country: "IR", zone: "Iran" },
  { terms: ["taiwan", "taipei", "taiwan strait", "pla", "tsai"],
    lat: 25.03, lng: 121.56, country: "TW", zone: "Taiwan Strait" },
  { terms: ["north korea", "pyongyang", "dprk", "kim jong"],
    lat: 39.01, lng: 125.73, country: "KP", zone: "Korean Peninsula" },
  { terms: ["red sea", "houthi", "yemen", "aden", "bab el-mandeb"],
    lat: 15.55, lng: 42.55, country: "YE", zone: "Red Sea" },
  { terms: ["hormuz", "oman", "persian gulf", "gulf"],
    lat: 26.50, lng: 56.50, country: "AE", zone: "Strait of Hormuz" },
  { terms: ["sahel", "mali", "niger", "burkina", "wagner", "timbuktu"],
    lat: 17.57, lng: -3.99, country: "ML", zone: "Sahel" },
  { terms: ["sudan", "khartoum", "rsf", "saf", "darfur"],
    lat: 15.60, lng: 32.50, country: "SD", zone: "Sudan" },
  { terms: ["china", "beijing", "xi jinping", "pla", "south china sea"],
    lat: 39.91, lng: 116.39, country: "CN", zone: "China" },
  { terms: ["lebanon", "beirut", "hezbollah"],
    lat: 33.89, lng: 35.50, country: "LB", zone: "Lebanon" },
  { terms: ["syria", "damascus", "aleppo", "idlib"],
    lat: 33.51, lng: 36.29, country: "SY", zone: "Syria" },
  { terms: ["nato", "alliance", "brussels", "europe"],
    lat: 50.85, lng: 4.35, country: "BE", zone: "Europe/NATO" },
];

function geolocate(text: string): { lat: number; lng: number; country: string; zone: string } {
  const lower = text.toLowerCase();
  for (const entry of GEO_INDEX) {
    if (entry.terms.some(t => lower.includes(t))) {
      return { lat: entry.lat, lng: entry.lng, country: entry.country, zone: entry.zone };
    }
  }
  return { lat: 0, lng: 0, country: "XX", zone: "Global" };
}

// ─── RSS XML parser (no external library) ────────────────────

function extractXMLTag(xml: string, tag: string): string {
  // Handle CDATA and plain content
  const cdataPattern = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i");
  const cdataMatch = cdataPattern.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainPattern = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const plainMatch = plainPattern.exec(xml);
  if (plainMatch) return plainMatch[1].trim();

  return "";
}

function decodeHTML(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, " ")  // strip remaining HTML tags
    .replace(/\s+/g, " ")
    .trim();
}

function parseRSSItems(xml: string, feedId: string, feedName: string, weight: number): RSSItem[] {
  const items: RSSItem[] = [];

  // Split on <item> or <entry> (Atom)
  const itemPattern = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];

    const title       = decodeHTML(extractXMLTag(block, "title"));
    const description = decodeHTML(extractXMLTag(block, "description") || extractXMLTag(block, "summary") || extractXMLTag(block, "content"));
    const link        = extractXMLTag(block, "link") || extractXMLTag(block, "guid");
    const pubDateRaw  = extractXMLTag(block, "pubDate") || extractXMLTag(block, "published") || extractXMLTag(block, "updated");

    if (!title || title.length < 10) continue;

    const pubDate = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString();
    const combined = `${title} ${description}`;
    const geo      = geolocate(combined);
    const urgency  = computeUrgency(title, description) * weight;

    // Skip items older than 6 hours
    const age = Date.now() - new Date(pubDate).getTime();
    if (age > 21_600_000) continue;

    // Tags from title keywords
    const tags: string[] = [];
    if (/strike|missile|bomb|explosion/i.test(combined)) tags.push("military");
    if (/sanction|diplomat|summit|agreement/i.test(combined)) tags.push("geopolitics");
    if (/earthquake|flood|fire|typhoon/i.test(combined)) tags.push("natural");
    if (/hack|cyber|ransomware|breach/i.test(combined)) tags.push("cyber");

    const id = `rss_${feedId}_${Buffer.from(link || title).toString("base64").slice(0, 12)}`;

    items.push({
      id,
      source:     feedId,
      sourceName: feedName,
      title,
      description: description.slice(0, 400),
      url:        link,
      pubDate,
      lat:         geo.lat,
      lng:         geo.lng,
      country:     geo.country,
      zone:        geo.zone,
      urgency:     parseFloat(urgency.toFixed(3)),
      tags,
    });
  }

  return items;
}

// ─── Feed fetcher ──────────────────────────────────────────────

async function fetchFeed(feed: typeof FEEDS[0]): Promise<RSSItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NEXUS-OSINT/1.0; +https://github.com/Vitalcheffe/nexus-platform)",
        "Accept": "application/rss+xml, application/atom+xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8000),
      // @ts-ignore — Next.js fetch extension
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseRSSItems(text, feed.id, feed.name, feed.weight);
  } catch {
    return [];
  }
}

// ─── Deduplication ────────────────────────────────────────────

function titleJaccard(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const inter = [...tokA].filter(x => tokB.has(x)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return union === 0 ? 0 : inter / union;
}

function deduplicate(items: RSSItem[]): RSSItem[] {
  const kept: RSSItem[] = [];
  for (const item of items) {
    // Check if already represented by a kept item within 6h
    const isDupe = kept.some(k => {
      const timeDiff = Math.abs(new Date(item.pubDate).getTime() - new Date(k.pubDate).getTime());
      return timeDiff < 21_600_000 && titleJaccard(item.title, k.title) > 0.65;
    });
    if (!isDupe) kept.push(item);
  }
  return kept;
}

// ─── Handler ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minUrgency = parseFloat(searchParams.get("minUrgency") ?? "0.3");
  const limit      = parseInt(searchParams.get("limit")       ?? "100");

  // Fetch all feeds in parallel
  const feedResults = await Promise.all(FEEDS.map(fetchFeed));
  const allItems = feedResults.flat();

  // Sort by urgency desc, then by recency
  allItems.sort((a, b) => b.urgency - a.urgency || new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  const filtered   = allItems.filter(i => i.urgency >= minUrgency);
  const deduplicated = deduplicate(filtered).slice(0, limit);

  return NextResponse.json({
    items:      deduplicated,
    count:      deduplicated.length,
    raw:        allItems.length,
    feeds:      FEEDS.map(f => f.id),
    timestamp:  new Date().toISOString(),
    source:     "rss_aggregator",
  });
}
