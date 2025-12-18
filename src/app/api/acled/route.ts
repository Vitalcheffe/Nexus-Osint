import { NextResponse } from "next/server";

/**
 * ACLED Live Events
 * GET /api/acled?days=7&country=PS&event_type=Explosions
 *
 * Requires: ACLED_API_KEY + ACLED_EMAIL (free at acleddata.com)
 * No credentials → empty array. No invented events ever.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country    = url.searchParams.get("country");
  const days       = parseInt(url.searchParams.get("days") || "7");
  const event_type = url.searchParams.get("event_type");

  const key   = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;

  if (!key || !email) {
    return NextResponse.json({
      source: "NO_API_KEY",
      configured: false,
      count: 0,
      events: [],
      notice: "Set ACLED_API_KEY + ACLED_EMAIL to enable live conflict data. Free registration at acleddata.com",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    let apiUrl = `https://api.acleddata.com/acled/read/?key=${key}&email=${email}&limit=100&format=json`
      + `&event_date=${since}|${today}&event_date_where=BETWEEN`
      + `&fields=data_id|date|event_type|sub_event_type|actor1|actor2|admin1|country|latitude|longitude|fatalities|notes|source|geo_precision`;

    if (country)    apiUrl += `&iso=${country}`;
    if (event_type) apiUrl += `&event_type=${encodeURIComponent(event_type)}`;

    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return NextResponse.json({
        source: "ACLED_ERROR",
        configured: true,
        count: 0,
        events: [],
        error: `ACLED API returned ${res.status}`,
        timestamp: new Date().toISOString(),
      }, { status: 502 });
    }

    const json = await res.json();
    return NextResponse.json({
      source: "ACLED_LIVE",
      configured: true,
      count: json.count,
      events: json.data,
      methodology: "Murphy et al. Cambridge Data & Policy 2024",
      doi: "10.1017/dap.2024.27",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({
      source: "ACLED_ERROR",
      configured: true,
      count: 0,
      events: [],
      error: String(e),
      timestamp: new Date().toISOString(),
    }, { status: 502 });
  }
}
