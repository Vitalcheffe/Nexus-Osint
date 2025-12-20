import { NextResponse } from "next/server";

interface NOTAM {
  id: string;
  type: "PROHIBIT" | "RESTRICT" | "DANGER" | "WARNING" | "TFR";
  lat: number;
  lng: number;
  radiusNm: number;
  country: string;
  region: string;
  flightLevels: string;
  effectiveFrom: string;
  effectiveTo: string;
  purpose: string;
  nexusRelevance: number;
  issuingAuthority: string;
  rawText?: string;
}

const NOTAM_DEMO: NOTAM[] = [
  {
    id: "NOTAM-IL-001",
    type: "PROHIBIT", lat: 32.0, lng: 34.75, radiusNm: 60,
    country: "IL", region: "LLLL",
    flightLevels: "SFC to UNL",
    effectiveFrom: new Date(Date.now() - 86400000 * 30).toISOString(),
    effectiveTo: new Date(Date.now() + 86400000 * 60).toISOString(),
    purpose: "ARMED CONFLICT OPS — IDF aerial operations active airspace",
    nexusRelevance: 0.95,
    issuingAuthority: "Israel Airports Authority / IAF",
  },
  {
    id: "NOTAM-UA-001",
    type: "PROHIBIT", lat: 50.0, lng: 30.5, radiusNm: 999,
    country: "UA", region: "UKOO",
    flightLevels: "SFC to FL600",
    effectiveFrom: "2022-02-24T00:00:00Z",
    effectiveTo: "PERM",
    purpose: "WARTIME — Complete Ukrainian airspace closure",
    nexusRelevance: 0.98,
    issuingAuthority: "Ukraine State Aviation Service",
  },
  {
    id: "NOTAM-IR-001",
    type: "RESTRICT", lat: 30.0, lng: 57.0, radiusNm: 200,
    country: "IR", region: "OIIX",
    flightLevels: "FL100 to FL350",
    effectiveFrom: new Date(Date.now() - 3600000).toISOString(),
    effectiveTo: new Date(Date.now() + 86400000).toISOString(),
    purpose: "MILITARY EXERCISE — IRGC air defense exercise",
    nexusRelevance: 0.82,
    issuingAuthority: "CAO Iran",
  },
  {
    id: "NOTAM-KP-001",
    type: "WARNING", lat: 40.5, lng: 129.0, radiusNm: 80,
    country: "KP", region: "ZKPY",
    flightLevels: "SFC to UNL",
    effectiveFrom: new Date(Date.now() - 7200000).toISOString(),
    effectiveTo: new Date(Date.now() + 43200000).toISOString(),
    purpose: "MISSILE TEST — DPRK ballistic missile launch warning area",
    nexusRelevance: 0.90,
    issuingAuthority: "DPRK Maritime Administration",
  },
  {
    id: "NOTAM-RU-001",
    type: "PROHIBIT", lat: 55.5, lng: 37.0, radiusNm: 999,
    country: "RU", region: "URWW",
    flightLevels: "SFC to FL600",
    effectiveFrom: "2022-03-01T00:00:00Z",
    effectiveTo: "PERM",
    purpose: "WARTIME — Russia airspace closed to western operators",
    nexusRelevance: 0.95,
    issuingAuthority: "FAVT Russia",
  },
  {
    id: "NOTAM-YE-001",
    type: "DANGER", lat: 15.35, lng: 44.0, radiusNm: 150,
    country: "YE", region: "OYSC",
    flightLevels: "SFC to FL250",
    effectiveFrom: new Date(Date.now() - 86400000 * 90).toISOString(),
    effectiveTo: "PERM",
    purpose: "HOUTHI CONFLICT — active missile/drone launch area",
    nexusRelevance: 0.88,
    issuingAuthority: "ICAO MIDANPIRG",
  },
  {
    id: "NOTAM-TW-001",
    type: "RESTRICT", lat: 24.0, lng: 122.0, radiusNm: 50,
    country: "TW", region: "RCTP",
    flightLevels: "SFC to FL350",
    effectiveFrom: new Date(Date.now() - 1800000).toISOString(),
    effectiveTo: new Date(Date.now() + 7200000).toISOString(),
    purpose: "MILITARY EXERCISE — Taiwan Air Defense exercises",
    nexusRelevance: 0.80,
    issuingAuthority: "CAA Taiwan",
  },
];

async function fetchFAANotams(): Promise<NOTAM[]> {
  try {
    const res = await fetch(
      "https://external-api.faa.gov/notamapi/v1/notams?icaoLocation=KLAX&pageSize=50",
      {
        headers: {
          "client_id": process.env.FAA_API_CLIENT_ID || "",
          "client_secret": process.env.FAA_API_CLIENT_SECRET || "",
        },
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const notams: NOTAM[] = [];

    for (const item of data.items || []) {
      const prop = item.properties || {};
      if (!prop.coreNOTAMData?.notam) continue;
      const n = prop.coreNOTAMData.notam;

      if (n.type === "N" || n.type === "R") {
        notams.push({
          id: `faa_${n.id}`,
          type: n.classification?.toLowerCase().includes("tfrp") ? "TFR" : "RESTRICT",
          lat: parseFloat(n.coordinates?.lat || "0"),
          lng: parseFloat(n.coordinates?.lon || "0"),
          radiusNm: parseFloat(n.radius || "10"),
          country: "US",
          region: n.icaoLocation || "",
          flightLevels: `${n.lowerLimit} to ${n.upperLimit}`,
          effectiveFrom: n.effectiveStart || new Date().toISOString(),
          effectiveTo: n.effectiveEnd || new Date(Date.now() + 86400000).toISOString(),
          purpose: n.text?.slice(0, 200) || "FAA NOTAM",
          nexusRelevance: n.classification?.includes("TFR") ? 0.70 : 0.30,
          issuingAuthority: "FAA",
          rawText: n.text,
        });
      }
    }

    return notams;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const minRelevance = parseFloat(url.searchParams.get("min_relevance") || "0.3");
  const country = url.searchParams.get("country");

  const [faaNotams] = await Promise.all([
    process.env.FAA_API_CLIENT_ID ? fetchFAANotams() : Promise.resolve([]),
  ]);

  const allNotams = faaNotams.length > 0 ? [...faaNotams, ...NOTAM_DEMO] : NOTAM_DEMO;

  let filtered = allNotams.filter(n => n.nexusRelevance >= minRelevance);
  if (type) filtered = filtered.filter(n => n.type === type);
  if (country) filtered = filtered.filter(n => n.country === country.toUpperCase());

  const highAlertCount = filtered.filter(n => n.nexusRelevance >= 0.80).length;

  return NextResponse.json({
    source: faaNotams.length > 0 ? "FAA_LIVE" : "ICAO_DEMO",
    count: filtered.length,
    notams: filtered,
    summary: {
      highAlert: highAlertCount,
      byType: {
        PROHIBIT: filtered.filter(n => n.type === "PROHIBIT").length,
        RESTRICT: filtered.filter(n => n.type === "RESTRICT").length,
        DANGER: filtered.filter(n => n.type === "DANGER").length,
        WARNING: filtered.filter(n => n.type === "WARNING").length,
        TFR: filtered.filter(n => n.type === "TFR").length,
      },
    },
    note: "Set FAA_API_CLIENT_ID + FAA_API_CLIENT_SECRET for live FAA data (free account at external-api.faa.gov)",
    timestamp: new Date().toISOString(),
  });
}
