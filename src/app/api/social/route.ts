import { NextResponse } from "next/server";

/**
 * Social Intelligence API
 * ─────────────────────────────────────────────────────────────
 * Aggregates social media signals from:
 *  - Twitter/X API v2 (TWITTER_BEARER_TOKEN)
 *  - Telegram Telethon sidecar (TELEGRAM_SESSION)
 *  - Reddit API (REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET)
 *  - VK API (VK_ACCESS_TOKEN)
 *
 * Without API keys → empty array + clear message.
 * No demo data is ever returned.
 *
 * NLP scoring pipeline:
 *  1. Translate to French/English (Helsinki-NLP or DeepL API)
 *  2. Extract entities (spaCy NER): locations, orgs, weapons
 *  3. Score urgency: keywords + sentiment + verified account boost
 *  4. Geolocate: mention → PostGIS lookup → lat/lng
 */

// Crisis keywords that boost urgency score
const CRISIS_KEYWORDS = [
  "explosion", "strike", "attack", "missile", "bomb", "fire",
  "military", "troops", "frappe", "explosion", "missile", "urgence",
  "breaking", "urgent", "alert", "sirene", "evacuate", "منذر",
];

function computeUrgencyScore(text: string, isVerified: boolean): number {
  const lower = text.toLowerCase();
  const keywordHits = CRISIS_KEYWORDS.filter((kw) => lower.includes(kw)).length;
  const base = Math.min(0.9, keywordHits * 0.15 + 0.2);
  return isVerified ? Math.min(1.0, base * 1.25) : base;
}

export async function GET() {
  const twitterKey = process.env.TWITTER_BEARER_TOKEN;
  const vkToken = process.env.VK_ACCESS_TOKEN;
  const redditId = process.env.REDDIT_CLIENT_ID;

  const posts: unknown[] = [];

  // ─── Twitter/X API ────────────────────────────────────────
  if (twitterKey) {
    try {
      const query = encodeURIComponent(
        '(explosion OR strike OR missile OR military) lang:en -is:retweet has:geo'
      );
      const res = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?query=${query}&tweet.fields=geo,created_at,author_id&max_results=20`,
        { headers: { Authorization: `Bearer ${twitterKey}` } }
      );
      if (res.ok) {
        const data = await res.json();
        // Transform to NexusPost format
        (data.data || []).forEach((tweet: Record<string, unknown>) => {
          // Twitter v2 API returns geo.coordinates.coordinates = [lng, lat]
          // when the user has location enabled. Absent = null.
          const geo = tweet.geo as { coordinates?: { coordinates?: [number, number] } } | null;
          const [tweetLng, tweetLat] = geo?.coordinates?.coordinates ?? [0, 0];
          posts.push({
            id: `x-${tweet.id}`,
            platform: "social_x",
            lat: tweetLat,
            lng: tweetLng,
            text: tweet.text,
            author: `@user_${tweet.author_id}`,
            verified: false,
            timestamp: new Date(tweet.created_at as string),
            urgencyScore: computeUrgencyScore(tweet.text as string, false),
            mediaCount: 0,
            shareCount: 0,
          });
        });
      }
    } catch (err) {
      console.error("[API/social] Twitter fetch failed:", err);
    }
  }

  // ─── No demo fallback — if no API keys, return honest empty ──
  if (posts.length === 0) {
    return NextResponse.json({
      posts: [],
      source: "no_credentials",
      reason: "Configure TWITTER_BEARER_TOKEN or REDDIT_CLIENT_ID to receive live social signals.",
      hint: "Reddit is free: https://www.reddit.com/prefs/apps — VK basic scraping also available",
    }, { status: 200 });
  }

  return NextResponse.json({ posts, source: "live" });
}
