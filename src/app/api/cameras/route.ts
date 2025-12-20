import { NextResponse } from "next/server";

/**
 * Public Camera Discovery
 *
 * Sources:
 * - EarthCam public API (no key needed): https://api.earthcam.com/oapi/cameras
 * - Windy.com webcam API (free tier): https://api.windy.com/webcams/api/v3
 *   (WINDY_API_KEY — free at windy.com/webcams/developers)
 * - OpenStreetMap Overpass for public CCTV nodes (no key)
 *
 * Camera stream URLs are public. No CV analysis without a separate vision model.
 * CV detection fields are ONLY populated by a separate Python worker.
 */

async function fetchEarthCamPublic() {
  try {
    const res = await fetch(
      "https://api.earthcam.com/oapi/cameras?client_key=xxxx&country=US,IL,TW,SG&limit=20",
      { signal: AbortSignal.timeout(6000), next: { revalidate: 300 } } as RequestInit
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.cameras || []).map((c: Record<string, unknown>) => {
      const gps = c.gps as Record<string, number> | undefined;
      const location = c.location as Record<string, string> | undefined;
      return {
        id:     `earthcam-${c.id}`,
        type:   "webcam",
        name:   c.title,
        lat:    gps?.lat ?? 0,
        lng:    gps?.lng ?? 0,
        city:   location?.city ?? "",
        country:location?.country ?? "",
        isLive: true,
        streamUrl: c.embed_url,
        source: "earthcam.com",
        cvDetections:   [],
        cvConfidence:   0,
        isAlertProximity: false,
        lastUpdate: new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

async function fetchWindyCams(apiKey: string, lat: number, lng: number, radius = 200) {
  try {
    const res = await fetch(
      `https://api.windy.com/webcams/api/v3/webcams?lang=en&limit=10&offset=0&categories=location&nearby=${lat},${lng},${radius}`,
      {
        headers: { "x-windy-api-key": apiKey },
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 300 },
      } as RequestInit
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.webcams || []).map((c: Record<string, unknown>) => ({
      id:     `windy-${c.id}`,
      type:   "webcam",
      name:   c.title,
      lat:    (c.location as Record<string, number>)?.latitude  ?? 0,
      lng:    (c.location as Record<string, number>)?.longitude ?? 0,
      city:   (c.location as Record<string, string>)?.city ?? "",
      country:(c.location as Record<string, string>)?.country ?? "",
      isLive: (c.status as string) === "active",
      streamUrl: ((c.images as Record<string, Record<string, string>>)?.current)?.preview ?? null,
      source: "windy.com",
      cvDetections:   [],
      cvConfidence:   0,
      isAlertProximity: false,
      lastUpdate: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat    = parseFloat(searchParams.get("lat")    ?? "32.08");
  const lng    = parseFloat(searchParams.get("lng")    ?? "34.78");
  const radius = parseInt(searchParams.get("radius")   ?? "300");

  const windyKey = process.env.WINDY_API_KEY;
  const cameras: unknown[] = [];

  if (windyKey) {
    const windyCams = await fetchWindyCams(windyKey, lat, lng, radius);
    cameras.push(...windyCams);
  }

  // EarthCam — try regardless
  const earthCams = await fetchEarthCamPublic();
  cameras.push(...earthCams);

  if (cameras.length === 0) {
    return NextResponse.json({
      cameras: [],
      source: "no_credentials",
      reason: "Configure WINDY_API_KEY (free at windy.com/webcams/developers) for live camera feeds.",
    }, { status: 200 });
  }

  return NextResponse.json({ cameras, source: windyKey ? "windy+earthcam" : "earthcam", count: cameras.length });
}
