import { NextResponse } from "next/server";

/**
 * GPS Jamming Detection — GPSJam.org
 * https://gpsjam.org/ (no API key required)
 *
 * GPSJam aggregates ADS-B NAC (Navigation Accuracy Category) reports
 * from the ADS-B Exchange network. Low NAC = GPS interference.
 * Data is updated daily around midnight UTC.
 *
 * If GPSJam is unreachable: returns { source: "unavailable" } — no fake data.
 */

const GPSJAM_BASE = "https://gpsjam.org";

async function fetchGPSJamData() {
  // GPSJam publishes daily GeoJSON hex data for the previous day
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const today     = new Date().toISOString().split("T")[0];

  // Try today first, fall back to yesterday (today's data may not be published yet)
  for (const date of [today, yesterday]) {
    try {
      // GPSJam CSV/JSON endpoint — documented at gpsjam.org/faq
      const res = await fetch(
        `${GPSJAM_BASE}/data/${date}.json`,
        { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) } as RequestInit
      );
      if (res.ok) {
        const raw = await res.json();
        // GPSJam returns an array of hex cells with jamming scores
        // Each cell: { h3: string, p: number (0-1 jam score), c: number (aircraft count) }
        return { data: raw, date, source: "gpsjam.org" as const };
      }
    } catch {
      // continue to next date
    }
  }
  return null;
}

export async function GET() {
  const result = await fetchGPSJamData();

  if (result) {
    // Transform H3 hex cells into NEXUS zone objects
    // Only keep cells with jamming score > 0.5 (significant interference)
    const cells = Array.isArray(result.data) ? result.data : [];
    const highIntensity = cells
      .filter((c: { p: number; c: number }) => c.p > 0.5 && c.c >= 3)
      .slice(0, 50); // cap at 50 zones

    return NextResponse.json({
      zones: highIntensity.map((c: { h3: string; p: number; c: number }, i: number) => ({
        id: `gpsjam-${result.date}-${i}`,
        h3Index: c.h3,
        intensity: parseFloat(c.p.toFixed(3)),
        affectedAircraft: c.c,
        date: result.date,
      })),
      totalCells: cells.length,
      date: result.date,
      source: "gpsjam.org",
    });
  }

  // No fake fallback — be honest about missing data
  return NextResponse.json({
    zones: [],
    source: "unavailable",
    reason: "GPSJam data unreachable. Try again after midnight UTC.",
  }, { status: 503 });
}
