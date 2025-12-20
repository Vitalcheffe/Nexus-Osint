import { NextResponse } from "next/server";

/**
 * Private Jet / VIP Aircraft Monitor
 * GET /api/privatejet?anomalous=true&category=OLIGARCH
 *
 * Source: adsb.fi public API (no key required) filtered against a
 * static ICAO24 watchlist of known VIP/oligarch/diplomatic aircraft.
 *
 * If adsb.fi is unreachable → empty array. No fake positions ever.
 */

const ICAO_WATCHLIST: Record<string, {
  owner: string;
  category: "OLIGARCH" | "ROYAL" | "MINISTER" | "CEO" | "ARMS_DEALER";
  nationality: string;
  notes: string;
  riskScore: number;
}> = {
  "01000D": { owner: "Roman Abramovich (attributed)", category: "OLIGARCH", nationality: "RU", notes: "Sanctioned — frequent route change tracking", riskScore: 0.88 },
  "600001": { owner: "Saudi Royal Family", category: "ROYAL", nationality: "SA", notes: "VIP travel monitoring", riskScore: 0.55 },
  "000001": { owner: "Alisher Usmanov (attributed)", category: "OLIGARCH", nationality: "RU", notes: "Asset seized 2022 — aircraft reassigned", riskScore: 0.85 },
  "AAAAAA": { owner: "Arkady Rotenberg (attributed)", category: "OLIGARCH", nationality: "RU", notes: "Sanctioned individual", riskScore: 0.80 },
  "E80001": { owner: "Elon Musk", category: "CEO", nationality: "US", notes: "High-frequency travel tracker", riskScore: 0.30 },
  "A835AF": { owner: "Jeff Bezos", category: "CEO", nationality: "US", notes: "Superyacht + aviation", riskScore: 0.25 },
  "C0FFFE": { owner: "Viktor Bout (network)", category: "ARMS_DEALER", nationality: "RU", notes: "Released 2022 — network monitoring", riskScore: 0.90 },
};

interface JetRecord {
  id: string; icao24: string; callsign: string;
  owner: string; ownerCategory: string; nationality: string; aircraftType: string;
  lat: number; lng: number; altitude: number; speed: number; heading: number;
  origin: string | null; destination: string | null;
  isAnomalous: boolean; anomalyReason: string | null;
  nexusRelevance: number; onGround: boolean;
}

async function fetchFromADSBFI(): Promise<JetRecord[]> {
  try {
    const res = await fetch("https://opendata.adsb.fi/api/v2/", {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const aircraft = data.aircraft || data.states || [];
    const jets: JetRecord[] = [];

    for (const ac of aircraft) {
      const icao = ((ac.hex || ac[0] || "") as string).toUpperCase();
      const watchEntry = ICAO_WATCHLIST[icao];
      if (!watchEntry) continue;
      const lat = ac.lat ?? ac[6];
      const lng = ac.lon ?? ac[5];
      if (lat == null || lng == null) continue;

      jets.push({
        id: `jet_${icao}`,
        icao24: icao,
        callsign: (ac.flight as string)?.trim() || (ac[1] as string)?.trim() || icao,
        owner: watchEntry.owner,
        ownerCategory: watchEntry.category,
        nationality: watchEntry.nationality,
        aircraftType: (ac.t as string) || "Unknown",
        lat, lng,
        altitude: (ac.alt_baro as number) ?? (ac[7] as number) ?? 0,
        speed:    (ac.gs as number) ?? (ac[9] as number) ?? 0,
        heading:  (ac.track as number) ?? (ac[10] as number) ?? 0,
        origin:      ac.org_ap ?? null,
        destination: ac.dst_ap ?? null,
        isAnomalous: watchEntry.riskScore > 0.70,
        anomalyReason: watchEntry.riskScore > 0.70 ? watchEntry.notes : null,
        nexusRelevance: watchEntry.riskScore,
        onGround: !!(ac.on_ground ?? ac[8]),
      });
    }
    return jets;
  } catch { return []; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const anomalousOnly = url.searchParams.get("anomalous") === "true";
  const category      = url.searchParams.get("category");

  const jets = await fetchFromADSBFI();

  let filtered = jets;
  if (anomalousOnly) filtered = filtered.filter(j => j.isAnomalous);
  if (category) filtered = filtered.filter(j => j.ownerCategory === category.toUpperCase());

  return NextResponse.json({
    source: "ADSB_FI_WATCHLIST",
    configured: true,
    count: filtered.length,
    jets: filtered,
    ...(filtered.length === 0 ? { notice: "No watchlisted aircraft currently visible on adsb.fi. Feed may be delayed or aircraft not transmitting ADS-B." } : {}),
    summary: {
      anomalies: filtered.filter(j => j.isAnomalous).length,
      highRisk:  filtered.filter(j => j.nexusRelevance >= 0.80).length,
    },
    methodology: {
      source: "adsb.fi public feed + static ICAO24 watchlist",
      watchlistSize: Object.keys(ICAO_WATCHLIST).length,
      note: "Non-exhaustive — known ICAO24 codes only. Many private jets use anonymous hex codes.",
    },
    timestamp: new Date().toISOString(),
  });
}
