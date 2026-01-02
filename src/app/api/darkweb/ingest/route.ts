import { NextResponse } from "next/server";

export interface DarkWebSignal {
  id: string;
  source: string;
  sourceName: string;
  category: "SOCIAL" | "CYBER" | "GROUND_TRUTH" | "ABSENCE";
  lat: number;
  lng: number;
  country: string;
  zone: string;
  confidence: number;
  title: string;
  body: string;
  tags: string[];
  timestamp: string;
  isAnomaly: boolean;
  onion: boolean;
  url: string;
  rawData?: unknown;
}

const signalBuffer: DarkWebSignal[] = [];
const MAX_BUFFER = 500;
const clients = new Set<ReadableStreamDefaultController>();
const seenIds = new Set<string>();

function broadcast(signal: DarkWebSignal) {
  if (seenIds.has(signal.id)) return;
  seenIds.add(signal.id);
  if (seenIds.size > 10000) {
    const iter = seenIds.values();
    for (let i = 0; i < 2000; i++) {
      const { value, done } = iter.next();
      if (done) break;
      seenIds.delete(value);
    }
  }

  signalBuffer.unshift(signal);
  if (signalBuffer.length > MAX_BUFFER) signalBuffer.pop();

  const msg = `data: ${JSON.stringify({ type: "darkweb_signal", data: signal })}\n\n`;
  clients.forEach(ctrl => {
    try { ctrl.enqueue(new TextEncoder().encode(msg)); } catch { clients.delete(ctrl); }
  });
}

// No demo signals. Data comes exclusively from the Python collector:
//   scripts/nexus_darkweb_collector.py → POST /api/darkweb/ingest
// If collector is not running, this endpoint streams nothing. That is correct.

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);

      // Replay buffered real signals to new subscriber
      const recent = signalBuffer.slice(0, 80);
      for (const s of [...recent].reverse()) {
        try {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({ type: "darkweb_signal", data: s })}\n\n`
          ));
        } catch {}
      }

      // Heartbeat
      const hb = setInterval(() => {
        try { controller.enqueue(new TextEncoder().encode(": hb\n\n")); }
        catch { clearInterval(hb); clients.delete(controller); }
      }, 20000);
    },
    cancel(controller) {
      clients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as DarkWebSignal;
    if (!body.source || !body.title) {
      return NextResponse.json({ error: "Missing source or title" }, { status: 400 });
    }

    const signal: DarkWebSignal = {
      ...body,
      id: body.id || `ingest_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: body.timestamp || new Date().toISOString(),
    };

    broadcast(signal);

    return NextResponse.json({
      ok: true,
      id: signal.id,
      buffered: signalBuffer.length,
      clients: clients.size,
    });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function DELETE() {
  signalBuffer.length = 0;
  seenIds.clear();
  return NextResponse.json({ ok: true, message: "Buffer cleared" });
}
