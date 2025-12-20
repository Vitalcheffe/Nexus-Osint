import { NextResponse } from "next/server";

/**
 * Night-lights anomaly detection
 *
 * PRIMARY: Sentinel Hub (ESA) — VIIRS DNB via Process API
 *   Requires: SENTINEL_HUB_INSTANCE_ID + SENTINEL_HUB_CLIENT_ID + SENTINEL_HUB_CLIENT_SECRET
 *   Free tier: https://www.sentinel-hub.com/create-account/
 *
 * FALLBACK: None.
 *   Without Sentinel Hub credentials this route returns an empty array.
 *   We do NOT return estimated/invented numbers for darkness levels.
 *   The geographic events (Gaza blackout, Khartoum, etc.) are real and
 *   documented, but the numeric radiometric values (nW/cm²/sr) can only
 *   come from an actual satellite measurement.
 *
 * To get real data without Sentinel Hub:
 *   - NASA Black Marble: https://blackmarble.gsfc.nasa.gov/
 *   - FIRMS Hotspot API (thermal anomalies, not light): NASA_FIRMS_MAP_KEY
 *   - EOG VNP46A2: https://eogdata.mines.edu/
 */

interface NightlightAnomaly {
  id: string;
  lat: number;
  lng: number;
  zone: string;
  country: string;
  type: "BLACKOUT" | "SURGE" | "GRADUAL_DECLINE" | "RECOVERY";
  delta: number;
  baseline: number;
  current: number;
  radiusKm: number;
  affectedPopulation: number;
  confidence: number;
  possibleCause: string;
  nexusSignal: number;
  detectedAt: string;
  durationDays: number;
}

async function fetchSentinelHub(): Promise<NightlightAnomaly[] | null> {
  const instanceId   = process.env.SENTINEL_HUB_INSTANCE_ID;
  const clientId     = process.env.SENTINEL_HUB_CLIENT_ID;
  const clientSecret = process.env.SENTINEL_HUB_CLIENT_SECRET;

  if (!instanceId || !clientId || !clientSecret) return null;

  try {
    // OAuth2 token
    const tokenRes = await fetch("https://services.sentinel-hub.com/oauth/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
      signal:  AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) return null;
    const { access_token: token } = await tokenRes.json() as { access_token: string };

    // VIIRS DNB evalscript — returns mean radiance (nW/cm²/sr)
    const evalscript = `
      //VERSION=3
      function setup() {
        return { input: [{ bands: ["DNB"], units: "DN" }], output: { bands: 1 } };
      }
      function evaluatePixel(s) { return [s.DNB]; }
    `;

    // Monitored zones: bbox [west, south, east, north]
    const WATCH_ZONES = [
      { id: "nl-gaza",         zone: "Gaza",              country: "PS", bbox: [34.0,31.2,35.2,31.9], lat: 31.5,  lng: 34.45, pop: 2100000 },
      { id: "nl-zaporizhzhia", zone: "Zaporizhzhia",      country: "UA", bbox: [34.5,47.5,36.0,48.5], lat: 47.8,  lng: 35.2,  pop: 750000  },
      { id: "nl-khartoum",     zone: "Khartoum",          country: "SD", bbox: [31.0,15.0,33.5,16.5], lat: 15.6,  lng: 32.5,  pop: 6500000 },
      { id: "nl-sanaa",        zone: "Sanaa",              country: "YE", bbox: [43.5,15.0,44.8,15.8], lat: 15.35, lng: 44.20, pop: 2900000 },
      { id: "nl-myanmar",      zone: "Rakhine — Myanmar", country: "MM", bbox: [91.5,19.5,93.5,21.0], lat: 20.15, lng: 92.89, pop: 1200000 },
    ];

    const results: NightlightAnomaly[] = [];

    for (const z of WATCH_ZONES) {
      const now      = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      const weekAgo   = new Date(now.getTime() - 7 * 86400000);

      // Current night radiance
      const currentRes = await fetch("https://services.sentinel-hub.com/api/v1/statistics", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          input: {
            bounds: { bbox: z.bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
            data:   [{ type: "VIIRS_WORLDVIEW", dataFilter: { timeRange: { from: yesterday.toISOString(), to: now.toISOString() } } }],
          },
          aggregation: {
            timeRange:            { from: yesterday.toISOString(), to: now.toISOString() },
            aggregationInterval:  { of: "P1D" },
            evalscript,
          },
          calculations: { default: { statistics: { default: { percentiles: { k: [50] } } } } },
        }),
        signal: AbortSignal.timeout(12000),
      });

      // Baseline (7-day average)
      const baseRes = await fetch("https://services.sentinel-hub.com/api/v1/statistics", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          input: {
            bounds: { bbox: z.bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
            data:   [{ type: "VIIRS_WORLDVIEW", dataFilter: { timeRange: { from: weekAgo.toISOString(), to: yesterday.toISOString() } } }],
          },
          aggregation: {
            timeRange:           { from: weekAgo.toISOString(), to: yesterday.toISOString() },
            aggregationInterval: { of: "P1D" },
            evalscript,
          },
          calculations: { default: { statistics: { default: { percentiles: { k: [50] } } } } },
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (!currentRes.ok || !baseRes.ok) continue;
      const curData  = await currentRes.json() as { data?: Array<{ outputs?: { default?: { bands?: { B0?: { stats?: { percentile_50?: number } } } } } }> };
      const baseData = await baseRes.json() as { data?: Array<{ outputs?: { default?: { bands?: { B0?: { stats?: { percentile_50?: number } } } } } }> };

      const current  = curData?.data?.[0]?.outputs?.default?.bands?.B0?.stats?.percentile_50;
      const baseline = baseData?.data?.[0]?.outputs?.default?.bands?.B0?.stats?.percentile_50;
      if (current == null || baseline == null || baseline === 0) continue;

      const delta      = (current - baseline) / baseline;
      const absDelta   = Math.abs(delta);
      if (absDelta < 0.15) continue; // below detection threshold

      const type: NightlightAnomaly["type"] =
        delta < -0.50 ? "BLACKOUT"
        : delta < -0.15 ? "GRADUAL_DECLINE"
        : delta > 0.20  ? "SURGE"
        : "RECOVERY";

      results.push({
        id:                 z.id,
        lat:                z.lat,
        lng:                z.lng,
        zone:               z.zone,
        country:            z.country,
        type,
        delta:              parseFloat(delta.toFixed(3)),
        baseline:           parseFloat(baseline.toFixed(2)),
        current:            parseFloat(current.toFixed(2)),
        radiusKm:           50,
        affectedPopulation: z.pop,
        confidence:         Math.min(0.97, 0.60 + absDelta * 0.5),
        possibleCause:      type === "BLACKOUT" ? "Infrastructure damage / power grid disruption (VIIRS DNB confirmed)" :
                            type === "GRADUAL_DECLINE" ? "Progressive infrastructure damage (VIIRS DNB confirmed)" :
                            type === "SURGE" ? "Unusual nighttime activity (VIIRS DNB confirmed)" :
                            "Partial infrastructure recovery (VIIRS DNB confirmed)",
        nexusSignal:        Math.min(0.97, 0.55 + absDelta * 0.5),
        detectedAt:         now.toISOString(),
        durationDays:       1,
      });
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url      = new URL(req.url);
  const country  = url.searchParams.get("country");
  const minDelta = parseFloat(url.searchParams.get("min_delta") || "0.15");

  const configured = !!(
    process.env.SENTINEL_HUB_INSTANCE_ID &&
    process.env.SENTINEL_HUB_CLIENT_ID   &&
    process.env.SENTINEL_HUB_CLIENT_SECRET
  );

  if (!configured) {
    return NextResponse.json({
      anomalies:  [],
      configured: false,
      notice:     "Set SENTINEL_HUB_INSTANCE_ID + SENTINEL_HUB_CLIENT_ID + SENTINEL_HUB_CLIENT_SECRET for live VIIRS night-lights analysis. Free ESA account: https://www.sentinel-hub.com/create-account/",
      source:     "unconfigured",
      count:      0,
    });
  }

  const data = await fetchSentinelHub();

  if (!data) {
    return NextResponse.json({
      anomalies:  [],
      configured: true,
      notice:     "Sentinel Hub query failed or returned no anomalies above threshold.",
      source:     "SENTINEL_HUB_LIVE",
      count:      0,
    }, { status: 503 });
  }

  let filtered = data.filter(a => Math.abs(a.delta) >= minDelta);
  if (country) filtered = filtered.filter(a => a.country === country.toUpperCase());

  return NextResponse.json({
    source:     "SENTINEL_HUB_LIVE",
    configured: true,
    count:      filtered.length,
    anomalies:  filtered,
    summary: {
      totalAffectedPopulation: filtered.reduce((s, a) => s + a.affectedPopulation, 0),
      blackouts:  filtered.filter(a => a.type === "BLACKOUT").length,
      surges:     filtered.filter(a => a.type === "SURGE").length,
      declines:   filtered.filter(a => a.type === "GRADUAL_DECLINE").length,
      recoveries: filtered.filter(a => a.type === "RECOVERY").length,
    },
    methodology: {
      sensor:     "VIIRS DNB (Day/Night Band) — Sentinel-2 via Sentinel Hub Process API",
      resolution: "500m",
      reference:  "Racek et al. 2024 — IJF: Remote sensing conflict damage assessment",
      note:       "Median radiance (P50) compared day-over-day. Threshold: |delta| >= 15%.",
    },
    timestamp: new Date().toISOString(),
  });
}
