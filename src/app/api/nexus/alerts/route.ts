import { NextResponse } from "next/server";
import { nexusEngine } from "@/nexus/engine";

/**
 * REST endpoint — active intelligence alerts for external polling.
 *
 * GET /api/nexus/alerts?minLevel=7&limit=20
 *
 * Consumed by scripts/nexus_alert_bot.py every 20 seconds.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minLevel = parseInt(searchParams.get("minLevel") ?? "1",  10);
  const limit    = parseInt(searchParams.get("limit")    ?? "50", 10);

  const allEvents = nexusEngine.getEvents();

  const filtered = allEvents
    .filter(ev =>
      ev.level >= minLevel &&
      ev.status !== "acknowledged" &&
      ev.status !== "dismissed"
    )
    .sort((a, b) =>
      b.level - a.level || b.detectedAt.getTime() - a.detectedAt.getTime()
    )
    .slice(0, limit);

  const alerts = filtered.map(ev => ({
    id:         ev.id,
    level:      ev.level,
    zone:       ev.zone,
    country:    ev.country,
    category:   ev.category,
    lat:        ev.lat,
    lng:        ev.lng,
    confidence: Math.round(ev.correlation.total * 100),

    signals: ev.signals.map(s => ({
      source:     s.source,
      text:       s.description,
      confidence: parseFloat(s.confidence.toFixed(3)),
      timestamp:  (s.eventTime instanceof Date ? s.eventTime : new Date(s.eventTime as string)).toISOString(),
    })),

    correlation: {
      total:      parseFloat(ev.correlation.total.toFixed(3)),
      spatial:    parseFloat(ev.correlation.spatial.toFixed(3)),
      temporal:   parseFloat(ev.correlation.temporal.toFixed(3)),
      semantic:   parseFloat(ev.correlation.semantic.toFixed(3)),
      behavioral: parseFloat(ev.correlation.behavioral.toFixed(3)),
      historical: parseFloat(ev.correlation.historical.toFixed(3)),
      sourceDiv:  parseFloat(ev.correlation.sourceDiv.toFixed(3)),
    },

    historicalMatches: ev.historicalMatches.map(m => ({
      name:              m.name,
      date:              m.date,
      similarity:        parseFloat(m.similarity.toFixed(3)),
      outcome:           m.outcome,
      falsePositiveRate: m.falsePositiveRate,
    })),

    aiSummary: ev.aiSummary,
    timestamp: ev.detectedAt.toISOString(),
    updatedAt: ev.updatedAt.toISOString(),
    status:    ev.status,

    telegramChannels: ev.signals
      .filter(s => s.source === "social_telegram")
      .flatMap(s => {
        const matches = s.description.match(/@(\w+)/g) ?? [];
        return matches.map(m => m.slice(1));
      }),
  }));

  return NextResponse.json({
    alerts,
    count:     alerts.length,
    total:     allEvents.length,
    minLevel,
    timestamp: new Date().toISOString(),
  });
}
