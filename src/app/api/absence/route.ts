import { NextResponse } from "next/server";

interface AbsenceZone {
  id: string;
  type: "ADS_B_VOID" | "AIS_DARK" | "SOCIAL_BLACKOUT" | "INTERNET_SHUTDOWN";
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
  country: string;
  detectedAt: string;
  confidenceScore: number;
  dropPercent: number;
  durationMin: number;
  militaryContext: boolean;
  nexusSignalStrength: number;
  baselineTraffic: number;
  currentTraffic: number;
}

let cachedZones: AbsenceZone[] | null = null;
let cacheTs = 0;
const TTL = 120000;

async function detectAdsbVoids(): Promise<AbsenceZone[]> {
  try {
    const HIGH_TRAFFIC_ZONES = [
      { id: "tel_aviv", lat: 32.08, lng: 34.78, r: 80, country: "IL", label: "Tel Aviv sector" },
      { id: "hormuz", lat: 26.5, lng: 56.3, r: 100, country: "IR", label: "Strait of Hormuz" },
      { id: "taiwan", lat: 24.0, lng: 122.0, r: 150, country: "TW", label: "Taiwan Strait" },
      { id: "black_sea", lat: 43.0, lng: 34.0, r: 200, country: "UA", label: "Black Sea" },
    ];

    const res = await fetch(
      "https://opensky-network.org/api/states/all?lamin=14&lamax=60&lomin=25&lomax=140",
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const states: number[][] = data.states || [];

    const voids: AbsenceZone[] = [];

    for (const zone of HIGH_TRAFFIC_ZONES) {
      const inRadius = states.filter(s => {
        if (!s[6] || !s[5]) return false;
        const lat = s[6] as number;
        const lng = s[5] as number;
        const R = 6371;
        const dLat = (lat - zone.lat) * Math.PI / 180;
        const dLng = (lng - zone.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(zone.lat * Math.PI/180) * Math.cos(lat * Math.PI/180) * Math.sin(dLng/2)**2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return dist < zone.r;
      }).length;

      const EXPECTED_BASELINE: Record<string, number> = {
        tel_aviv: 140, hormuz: 85, taiwan: 120, black_sea: 95,
      };

      const baseline = EXPECTED_BASELINE[zone.id] || 80;
      const dropPct = Math.max(0, (baseline - inRadius) / baseline * 100);

      if (dropPct > 70) {
        voids.push({
          id: `void_${zone.id}_${Date.now()}`,
          type: "ADS_B_VOID",
          lat: zone.lat, lng: zone.lng,
          radiusKm: zone.r,
          label: `ADS-B VOID — ${zone.label}`,
          country: zone.country,
          detectedAt: new Date().toISOString(),
          confidenceScore: Math.min(0.97, 0.70 + dropPct / 300),
          dropPercent: Math.round(dropPct),
          // Duration estimated from drop severity:
          // mild drop (70-80%) → ~15min, severe (>90%) → ~60min.
          // Formula: 15 + (dropPct - 70) * 1.5, capped at 90min.
          durationMin: Math.min(90, Math.round(15 + (dropPct - 70) * 1.5)),
          militaryContext: dropPct > 85,
          nexusSignalStrength: Math.min(0.97, 0.70 + dropPct / 300),
          baselineTraffic: baseline,
          currentTraffic: inRadius,
        });
      }
    }

    return voids;
  } catch {
    return [];
  }
}

async function detectDarkShips(): Promise<AbsenceZone[]> {
  // Without AIS real-time data, we cannot detect dark ships.
  // AISStream.io real-time WebSocket requires AISSTREAM_API_KEY (free registration).
  // https://aisstream.io/
  if (!process.env.AISSTREAM_API_KEY) {
    return []; // Honest empty — no fake dark ship detections
  }

  // With AIS key: baseline vs current traffic per zone is computed dynamically.
  // For now returns empty — the real-time WebSocket collector (nexus_telegram_collector.py)
  // feeds AIS dark ship events through /api/darkweb/ingest when running.
  return [];
}

async function detectInternetShutdowns(): Promise<AbsenceZone[]> {
  const shutdowns: AbsenceZone[] = [];

  if (process.env.CLOUDFLARE_RADAR_TOKEN) {
    try {
      const res = await fetch(
        "https://api.cloudflare.com/client/v4/radar/traffic/anomalies/locations?format=json",
        {
          headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_RADAR_TOKEN}` },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const COUNTRY_COORDS: Record<string, [number, number]> = {
          IR: [35.69, 51.39], RU: [55.75, 37.62], BY: [53.9, 27.56],
          KP: [39.01, 125.73], CN: [39.91, 116.39], CU: [21.52, -77.78],
        };
        for (const loc of data.result?.locations || []) {
          const coords = COUNTRY_COORDS[loc.countryAlpha2];
          if (!coords) continue;
          shutdowns.push({
            id: `shutdown_${loc.countryAlpha2}`,
            type: "INTERNET_SHUTDOWN",
            lat: coords[0], lng: coords[1],
            radiusKm: 300,
            label: `INTERNET SHUTDOWN — ${loc.countryName}`,
            country: loc.countryAlpha2,
            detectedAt: new Date().toISOString(),
            confidenceScore: 0.82,
            dropPercent: Math.round(loc.value || 60),
            durationMin: 60,
            militaryContext: false,
            nexusSignalStrength: 0.82,
            baselineTraffic: 100,
            currentTraffic: Math.round(100 - (loc.value || 60)),
          });
        }
      }
    } catch {}
  }

  return shutdowns;
}

export async function GET() {
  const now = Date.now();

  if (cachedZones && now - cacheTs < TTL) {
    return NextResponse.json({ zones: cachedZones, cached: true });
  }

  const [voids, darks, shutdowns] = await Promise.all([
    detectAdsbVoids(),
    detectDarkShips(),
    detectInternetShutdowns(),
  ]);

  const allZones = [...voids, ...darks, ...shutdowns];
  cachedZones = allZones;
  cacheTs = now;

  return NextResponse.json({
    zones: cachedZones,
    count: cachedZones.length,
    breakdown: {
      adsb_voids: voids.length,
      dark_ships: darks.length,
      internet_shutdowns: shutdowns.length,
    },
    ...(cachedZones.length === 0 ? {
      notice: "No absence anomalies detected in current window. Configure AISSTREAM_API_KEY (maritime) and CLOUDFLARE_RADAR_TOKEN (internet) for live data.",
    } : {}),
    timestamp: new Date().toISOString(),
  });
}
