import { NextResponse } from "next/server";
import { getCachedVessels, startAisStream } from "@/lib/ais-stream";

export const dynamic = 'force-dynamic';

/**
 * AIS vessel type labels per ITU-R M.1371-5 Appendix 2.
 * Maps the numeric type code to a human-readable category.
 */
function aisTypeLabel(code: number): string {
  if (code >= 20 && code <= 29) return "Wing-in-Ground";
  if (code === 30) return "Fishing";
  if (code === 31 || code === 32) return "Towing";
  if (code === 33) return "Dredging/Underwater ops";
  if (code === 34) return "Diving ops";
  if (code === 35) return "Military";
  if (code === 36) return "Sailing";
  if (code === 37) return "Pleasure craft";
  if (code >= 40 && code <= 49) return "High-speed craft";
  if (code === 51) return "SAR";
  if (code === 52) return "Tug";
  if (code === 53) return "Port tender";
  if (code === 55) return "Law enforcement";
  if (code >= 60 && code <= 69) return "Passenger";
  if (code >= 70 && code <= 79) return "Cargo";
  if (code >= 80 && code <= 89) return "Tanker";
  return "Other";
}
export async function GET() {
    startAisStream(); // Ensure stream is initialized

    const vessels = getCachedVessels();

    // Cache is empty: AIS WebSocket is still initialising or AISSTREAM_API_KEY not set.
    // Return null so the plugin keeps the previous cache rather than wiping it.
    // No demo data is ever returned — empty state is honest.
    if (vessels.length === 0) {
        return NextResponse.json({ vessels: null });
    }

    // Format the cached data into GeoEntities
    const geoEntities = vessels.map((v) => ({
        id: `maritime-${v.mmsi}`,
        pluginId: "maritime",
        latitude: v.lat,
        longitude: v.lon,
        heading: v.heading,
        speed: v.speed,
        timestamp: v.timestamp ? new Date(v.timestamp) : new Date(),
        label: v.name,
        properties: {
            mmsi: v.mmsi,
            vesselName: v.name,
            // AIS type codes per ITU-R M.1371-5 Appendix 2
            // 20-29: WIG, 30: fishing, 31-32: towing, 35: military, 36: sailing,
            // 37: pleasure, 60-69: passenger, 70-79: cargo, 80-89: tanker
            vesselType: aisTypeLabel(v.type),
            aisTypeCode: v.type,
            speed_knots: v.speed,
            heading: v.heading,
        },
    }));

    return NextResponse.json({ vessels: geoEntities });
}
