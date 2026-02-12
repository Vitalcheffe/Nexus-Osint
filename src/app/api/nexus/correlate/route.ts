import { NextResponse } from "next/server";
import { nexusEngine } from "@/nexus/engine";

/**
 * NEXUS Correlation API
 * GET /api/nexus/correlate
 *
 * Returns current engine events and source health.
 * All data comes directly from the live NexusEngine singleton —
 * no hardcoded events, no invented confidence scores.
 *
 * If no signals have been ingested yet (no API keys configured,
 * platform just started), events will be [].
 */
export async function GET() {
  const events = nexusEngine.getEvents().slice(0, 50).map(ev => ({
    id:          ev.id,
    level:       ev.level,
    category:    ev.category,
    lat:         ev.lat,
    lng:         ev.lng,
    radiusKm:    ev.radiusKm,
    zone:        ev.zone,
    country:     ev.country,
    signalCount: ev.signals.length,
    confidence:  parseFloat(ev.correlation.total.toFixed(3)),
    explanation: ev.explanation,
    detectedAt:  ev.detectedAt.toISOString(),
    updatedAt:   ev.updatedAt.toISOString(),
    status:      ev.status,
  }));

  const health = nexusEngine.getSourceHealth();
  const activeSources = health.filter(s => s.active).length;

  return NextResponse.json({
    events,
    count:         events.length,
    activeSources,
    totalSources:  health.length,
    engineStatus:  activeSources > 0 ? "nominal" : "awaiting_signals",
    timestamp:     new Date().toISOString(),
  });
}
