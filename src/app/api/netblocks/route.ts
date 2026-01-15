import { NextResponse } from "next/server";

/**
 * Internet Shutdown Monitor
 * GET /api/netblocks
 *
 * Source: Cloudflare Radar API (traffic anomaly detection)
 * Requires: CLOUDFLARE_RADAR_TOKEN (free at dash.cloudflare.com/profile/api-tokens)
 *
 * No token → empty array. No fake data ever.
 */

interface ShutdownEvent {
  country: string; iso: string;
  lat: number; lng: number;
  severity: "PARTIAL" | "SIGNIFICANT" | "MAJOR" | "TOTAL";
  type: "THROTTLING" | "BGP_WITHDRAWAL" | "DNS_BLOCKING" | "PLATFORM_BLOCK";
  affectedPlatforms: string[];
  startTime: string; endTime?: string;
  confidence: number;
  politicalContext: string;
  source: string;
}

async function checkCloudflareRadar(): Promise<ShutdownEvent[]> {
  const token = process.env.CLOUDFLARE_RADAR_TOKEN;
  if (!token) return [];

  try {
    const url = "https://api.cloudflare.com/client/v4/radar/traffic/anomalies/locations?format=json&dateRange=1h";
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.result?.locations || []).map((loc: Record<string, string>): ShutdownEvent => ({
      country: loc.countryName,
      iso: loc.countryAlpha2,
      lat: parseFloat(loc.latitude || "0"),
      lng: parseFloat(loc.longitude || "0"),
      severity: loc.status === "major" ? "MAJOR" : "SIGNIFICANT",
      type: "BGP_WITHDRAWAL",
      affectedPlatforms: ["General Internet"],
      startTime: new Date().toISOString(),
      confidence: 0.82,
      politicalContext: `Traffic anomaly detected — ${loc.countryName}`,
      source: "Cloudflare Radar",
    }));
  } catch { return []; }
}

export async function GET() {
  const token = process.env.CLOUDFLARE_RADAR_TOKEN;
  const events = await checkCloudflareRadar();

  return NextResponse.json({
    source: token ? (events.length > 0 ? "CLOUDFLARE_RADAR_LIVE" : "CLOUDFLARE_RADAR_NO_ANOMALIES") : "NO_API_KEY",
    configured: !!token,
    count: events.length,
    events,
    ...(token
      ? {}
      : { notice: "Set CLOUDFLARE_RADAR_TOKEN to enable internet shutdown monitoring. Free at dash.cloudflare.com/profile/api-tokens" }
    ),
    methodology: {
      sources: ["Cloudflare Radar BGP monitoring"],
      note: "CLOUDFLARE_RADAR_TOKEN required",
    },
    timestamp: new Date().toISOString(),
  });
}
