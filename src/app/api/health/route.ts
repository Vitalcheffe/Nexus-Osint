import { NextResponse } from "next/server";

const START_TIME = Date.now();

export async function GET() {
  const configured = {
    acled:         !!(process.env.ACLED_API_KEY && process.env.ACLED_EMAIL),
    nasa_firms:    !!process.env.NASA_FIRMS_MAP_KEY,
    cloudflare:    !!process.env.CLOUDFLARE_RADAR_TOKEN,
    aisstream:     !!process.env.AISSTREAM_API_KEY,
    telegram:      !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH),
    sentinel_hub:  !!(process.env.SENTINEL_HUB_INSTANCE_ID && process.env.SENTINEL_HUB_CLIENT_ID),
    anthropic:     !!process.env.ANTHROPIC_API_KEY,
    alpha_vantage: !!process.env.ALPHA_VANTAGE_API_KEY,
    nexus_bot:     !!(process.env.NEXUS_BOT_TOKEN && process.env.NEXUS_CHANNEL_ID),
  };

  // Sources that are always active (no key needed)
  const alwaysActive = ["gdelt", "usgs", "wikipedia", "reliefweb", "rss", "bluesky", "mastodon", "ransomwatch", "gpsjam", "notam", "yahoo_finance"];

  return NextResponse.json({
    status:  "OK",
    service: "NEXUS Intelligence Platform",
    version: "16.0",
    uptime:  Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
    sources: {
      always_active: alwaysActive,
      configured,
      configured_count: Object.values(configured).filter(Boolean).length,
      total_configured: Object.keys(configured).length,
    },
  });
}
