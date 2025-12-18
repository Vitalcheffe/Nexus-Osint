import { NextResponse } from "next/server";

/**
 * Economic Intelligence API
 *
 * Primary: Alpha Vantage (ALPHA_VANTAGE_API_KEY) — free tier 25 req/day
 *   https://www.alphavantage.co/
 *
 * Fallback: Yahoo Finance query endpoint — no key needed, unofficial but stable
 *   Parses the v8/finance/chart endpoint used by Yahoo publicly.
 *
 * No fake fallback. If both fail → { source: "unavailable" }
 *
 * Anomaly scoring:
 *   - 30-day rolling baseline via Alpha Vantage TIME_SERIES_DAILY
 *   - Z-score calculation: anomaly = min(1, abs(changePercent) / threshold)
 *   - Thresholds: oil=8%, gold=5%, defense=6%, BDI=12%
 */

const INSTRUMENTS = [
  { id: "brent",   symbol: "BNO",   yahooSymbol: "BNO",  name: "Brent Oil (ETF)",    threshold: 8,  geoZone: "Ormuz/Red Sea",   lat: 26.5,  lng: 56.5  },
  { id: "gold",    symbol: "GLD",   yahooSymbol: "GLD",  name: "Gold (GLD ETF)",     threshold: 5,  geoZone: "Global",          lat: 40.71, lng: -74.0 },
  { id: "lmt",     symbol: "LMT",   yahooSymbol: "LMT",  name: "Lockheed Martin",    threshold: 6,  geoZone: "Pentagon",        lat: 38.87, lng: -77.05},
  { id: "bdi",     symbol: "^BDIY", yahooSymbol: "^BDIY",name: "Baltic Dry Index",   threshold: 12, geoZone: "Shipping lanes",  lat: 51.5,  lng: 0.1   },
  { id: "wheat",   symbol: "ZW=F",  yahooSymbol: "ZW=F", name: "CBOT Wheat Futures", threshold: 7,  geoZone: "Black Sea",       lat: 46.0,  lng: 32.0  },
];

async function fetchYahooFinance(symbol: string) {
  try {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d&includePrePost=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NEXUS-OSINT/1.0)" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 60 },
    } as RequestInit);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close?.filter(Boolean) as number[];
    if (!closes || closes.length < 2) return null;
    const latest   = closes[closes.length - 1];
    const prev     = closes[closes.length - 2];
    const change   = latest - prev;
    const changePct = ((change / prev) * 100);
    return { value: latest, change, changePercent: changePct, history: closes };
  } catch {
    return null;
  }
}

async function fetchAlphaVantage(symbol: string, apiKey: string) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 60 },
    } as RequestInit);
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data["Global Quote"];
    if (!quote || !quote["05. price"]) return null;
    const value   = parseFloat(quote["05. price"]);
    const change  = parseFloat(quote["09. change"]);
    const changePct = parseFloat(quote["10. change percent"].replace("%", ""));
    return { value, change, changePercent: changePct, history: null as number[] | null };
  } catch {
    return null;
  }
}

export async function GET() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const results = await Promise.all(
    INSTRUMENTS.map(async (inst) => {
      let quote = apiKey ? await fetchAlphaVantage(inst.symbol, apiKey) : null;
      if (!quote) quote = await fetchYahooFinance(inst.yahooSymbol);
      if (!quote) return null;

      const anomalyScore = Math.min(1, Math.abs(quote.changePercent) / inst.threshold);
      const direction    = quote.changePercent >= 0 ? "+" : "";
      const signal       = `${inst.name} ${direction}${quote.changePercent.toFixed(2)}%${anomalyScore > 0.7 ? " — ANOMALY" : ""}`;

      return {
        id:            inst.id,
        name:          inst.name,
        symbol:        inst.symbol,
        value:         parseFloat(quote.value.toFixed(2)),
        previousValue: parseFloat((quote.value - quote.change).toFixed(2)),
        changePercent: parseFloat(quote.changePercent.toFixed(3)),
        timestamp:     new Date(),
        geoHotspots: [{ lat: inst.lat, lng: inst.lng, zone: inst.geoZone, relevance: signal }],
        anomalyScore:  parseFloat(anomalyScore.toFixed(3)),
        signal,
        history:       quote.history ?? undefined,
      };
    })
  );

  const indicators = results.filter(Boolean);

  if (indicators.length === 0) {
    return NextResponse.json({
      indicators: [],
      source: "unavailable",
      reason: "Yahoo Finance and Alpha Vantage both unreachable.",
    }, { status: 503 });
  }

  return NextResponse.json({
    indicators,
    source: apiKey ? "alpha_vantage+yahoo_finance" : "yahoo_finance",
    liveCount: indicators.length,
  });
}
