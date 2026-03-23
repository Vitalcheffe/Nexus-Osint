export type SearchSource = 
  | "gdelt" | "acled" | "usgs" | "opensky" | "firms"
  | "gpsjam" | "maritime" | "telegram" | "twitter"
  | "web" | "news" | "social" | "darkweb";

export interface SearchQuery {
  text: string;
  filters?: {
    dateStart?: Date;
    dateEnd?: Date;
    location?: { lat: number; lng: number; radiusKm: number };
    countries?: string[];
    eventTypes?: string[];
    sources?: SearchSource[];
    minConfidence?: number;
  };
  options?: {
    maxResults?: number;
    timeout?: number;
    freshness?: "realtime" | "hourly" | "daily";
  };
}

export interface SearchResult {
  id: string;
  source: SearchSource;
  type: "event" | "entity" | "document" | "signal" | "alert";
  title: string;
  description: string;
  timestamp: Date;
  location?: { lat: number; lng: number; label?: string };
  confidence: number;
  relevanceScore: number;
  raw: Record<string, unknown>;
  url?: string;
}

export interface SearchResponse {
  query: SearchQuery;
  results: SearchResult[];
  aggregations: {
    bySource: Record<SearchSource, number>;
    byType: Record<string, number>;
    byCountry: Record<string, number>;
    timeline: { date: string; count: number }[];
  };
  metadata: {
    totalResults: number;
    searchTime: number;
    sourcesQueried: SearchSource[];
    sourcesFailed: SearchSource[];
    cacheHit: boolean;
  };
}

export interface SourceConnector {
  name: SearchSource;
  search(query: SearchQuery): Promise<SearchResult[]>;
  isAvailable(): boolean;
  getRateLimit(): { remaining: number; resetAt: Date };
}

class GDELTConnector implements SourceConnector {
  name: SearchSource = "gdelt";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const maxResults = query.options?.maxResults ?? 50;

    try {
      const params = new URLSearchParams({
        query: query.text,
        mode: "artlist",
        format: "json",
        maxrecords: String(maxResults),
        timespan: "7d",
      });

      const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!res.ok) return results;

      const data = await res.json() as { articles?: Record<string, unknown>[] };
      const articles = data.articles ?? [];

      for (const article of articles.slice(0, maxResults)) {
        const dateStr = String(article.seendate ?? "");
        const timestamp = this.parseGDELTDate(dateStr);

        results.push({
          id: `gdelt-${dateStr}-${Math.random().toString(36).slice(2)}`,
          source: "gdelt",
          type: "event",
          title: String(article.title ?? "Untitled"),
          description: String(article.url ?? ""),
          timestamp,
          location: article.sourcecountry ? {
            lat: 0, lng: 0, label: String(article.sourcecountry)
          } : undefined,
          confidence: 0.7,
          relevanceScore: 1,
          raw: article,
          url: String(article.url ?? ""),
        });
      }
    } catch {}

    return results;
  }

  isAvailable(): boolean { return true; }

  getRateLimit(): { remaining: number; resetAt: Date } {
    return { remaining: Infinity, resetAt: new Date(Date.now() + 60000) };
  }

  private parseGDELTDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const y = parseInt(dateStr.slice(0, 4));
    const m = parseInt(dateStr.slice(4, 6)) - 1;
    const d = parseInt(dateStr.slice(6, 8));
    const h = parseInt(dateStr.slice(8, 10)) || 0;
    return new Date(y, m, d, h);
  }
}

class ACLEDConnector implements SourceConnector {
  name: SearchSource = "acled";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const apiKey = process.env.ACLED_API_KEY;
    const email = process.env.ACLED_EMAIL;

    if (!apiKey || !email) return results;

    try {
      const params = new URLSearchParams({
        key: apiKey,
        email: email,
        limit: String(query.options?.maxResults ?? 50),
        format: "json",
      });

      if (query.filters?.countries?.length) {
        params.set("country", query.filters.countries.join(";"));
      }

      if (query.filters?.dateStart) {
        params.set("event_date", query.filters.dateStart.toISOString().slice(0, 10));
      }

      const url = `https://api.acleddata.com/acled/read/?${params}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

      if (!res.ok) return results;

      const data = await res.json() as { data?: Record<string, unknown>[] };
      const events = data.data ?? [];

      for (const event of events) {
        results.push({
          id: `acled-${event.event_id_cnty ?? Math.random().toString(36).slice(2)}`,
          source: "acled",
          type: "event",
          title: String(event.event_type ?? "Unknown Event"),
          description: String(event.notes ?? ""),
          timestamp: new Date(String(event.event_date ?? "")),
          location: {
            lat: parseFloat(String(event.latitude ?? 0)),
            lng: parseFloat(String(event.longitude ?? 0)),
            label: String(event.admin1 ?? event.country ?? ""),
          },
          confidence: 0.95,
          relevanceScore: 1,
          raw: event,
        });
      }
    } catch {}

    return results;
  }

  isAvailable(): boolean {
    return !!(process.env.ACLED_API_KEY && process.env.ACLED_EMAIL);
  }

  getRateLimit(): { remaining: number; resetAt: Date } {
    return { remaining: 100, resetAt: new Date(Date.now() + 3600000) };
  }
}

class USGSConnector implements SourceConnector {
  name: SearchSource = "usgs";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const maxResults = query.options?.maxResults ?? 50;

    try {
      const params = new URLSearchParams({
        format: "geojson",
        limit: String(maxResults),
        minmagnitude: "2.5",
      });

      if (query.filters?.dateStart) {
        params.set("starttime", query.filters.dateStart.toISOString());
      }
      if (query.filters?.dateEnd) {
        params.set("endtime", query.filters.dateEnd.toISOString());
      }

      const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!res.ok) return results;

      const data = await res.json() as { features?: Array<{
        id: string;
        properties: Record<string, unknown>;
        geometry: { coordinates: [number, number, number] };
      }> };

      const features = data.features ?? [];

      for (const feature of features) {
        const props = feature.properties;
        const coords = feature.geometry.coordinates;

        results.push({
          id: `usgs-${feature.id}`,
          source: "usgs",
          type: "event",
          title: String(props.title ?? "Earthquake"),
          description: `Magnitude ${props.mag} - ${props.place}`,
          timestamp: new Date(Number(props.time)),
          location: {
            lat: coords[1],
            lng: coords[0],
            label: String(props.place ?? ""),
          },
          confidence: 0.99,
          relevanceScore: 1,
          raw: props,
          url: String(props.url ?? ""),
        });
      }
    } catch {}

    return results;
  }

  isAvailable(): boolean { return true; }

  getRateLimit(): { remaining: number; resetAt: Date } {
    return { remaining: Infinity, resetAt: new Date(Date.now() + 60000) };
  }
}

class OpenSkyConnector implements SourceConnector {
  name: SearchSource = "opensky";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    if (!query.filters?.location) return results;

    try {
      const { lat, lng, radiusKm } = query.filters.location;
      const delta = radiusKm / 111;

      const url = `https://opensky-network.org/api/states/all?` +
        `lamin=${lat - delta}&lomin=${lng - delta}&lamax=${lat + delta}&lomax=${lng + delta}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!res.ok) return results;

      const data = await res.json() as { states?: Array<unknown[]> };
      const states = data.states ?? [];

      for (const state of states.slice(0, query.options?.maxResults ?? 100)) {
        results.push({
          id: `opensky-${state[0] as string}`,
          source: "opensky",
          type: "signal",
          title: `Aircraft ${state[1] ?? "Unknown"}`,
          description: `Callsign: ${state[1] ?? "N/A"}, Alt: ${state[7] ?? 0}m`,
          timestamp: new Date(),
          location: {
            lat: state[6] as number ?? 0,
            lng: state[5] as number ?? 0,
          },
          confidence: 0.9,
          relevanceScore: 1,
          raw: { icao24: state[0], callsign: state[1], altitude: state[7] },
        });
      }
    } catch {}

    return results;
  }

  isAvailable(): boolean { return true; }

  getRateLimit(): { remaining: number; resetAt: Date } {
    return { remaining: Infinity, resetAt: new Date(Date.now() + 10000) };
  }
}

class FIRMSConnector implements SourceConnector {
  name: SearchSource = "firms";

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    if (!query.filters?.location) return results;

    const apiKey = process.env.NASA_API_KEY;
    if (!apiKey) return results;

    try {
      const { lat, lng, radiusKm } = query.filters.location;
      const delta = radiusKm / 111;

      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/MODIS_NRT/${lng - delta},${lat - delta},${lng + delta},${lat + delta}/1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

      if (!res.ok) return results;

      const text = await res.text();
      const lines = text.split("\n").slice(1);

      for (const line of lines.slice(0, query.options?.maxResults ?? 50)) {
        const parts = line.split(",");
        if (parts.length < 3) continue;

        results.push({
          id: `firms-${parts[0]}-${parts[1]}`,
          source: "firms",
          type: "signal",
          title: "Fire Detection",
          description: `Brightness: ${parts[2]}`,
          timestamp: new Date(),
          location: {
            lat: parseFloat(parts[0]),
            lng: parseFloat(parts[1]),
          },
          confidence: 0.85,
          relevanceScore: 1,
          raw: { latitude: parts[0], longitude: parts[1], brightness: parts[2] },
        });
      }
    } catch {}

    return results;
  }

  isAvailable(): boolean { return !!process.env.NASA_API_KEY; }

  getRateLimit(): { remaining: number; resetAt: Date } {
    return { remaining: 1000, resetAt: new Date(Date.now() + 3600000) };
  }
}

export class FederatedSearchEngine {
  private connectors: Map<SearchSource, SourceConnector> = new Map();
  private cache: Map<string, { results: SearchResult[]; timestamp: number }> = new Map();
  private cacheTTL = 300000;

  constructor() {
    this.registerConnector(new GDELTConnector());
    this.registerConnector(new ACLEDConnector());
    this.registerConnector(new USGSConnector());
    this.registerConnector(new OpenSkyConnector());
    this.registerConnector(new FIRMSConnector());
  }

  registerConnector(connector: SourceConnector): void {
    this.connectors.set(connector.name, connector);
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    const sources = query.filters?.sources ?? Array.from(this.connectors.keys());
    const cacheKey = this.getCacheKey(query);

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return this.buildResponse(query, cached.results, startTime, sources, [], true);
    }

    const results: SearchResult[] = [];
    const sourcesFailed: SearchSource[] = [];

    const activeConnectors = sources
      .map(s => this.connectors.get(s))
      .filter((c): c is SourceConnector => c !== undefined && c.isAvailable());

    const searchPromises = activeConnectors.map(async connector => {
      try {
        return await connector.search(query);
      } catch {
        sourcesFailed.push(connector.name);
        return [];
      }
    });

    const searchResults = await Promise.allSettled(searchPromises);

    for (const result of searchResults) {
      if (result.status === "fulfilled") {
        results.push(...result.value);
      }
    }

    const deduped = this.deduplicateResults(results);
    const scored = this.scoreResults(deduped, query);
    const sorted = scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    const limited = sorted.slice(0, query.options?.maxResults ?? 100);

    this.cache.set(cacheKey, { results: limited, timestamp: Date.now() });

    const sourcesQueried = activeConnectors.map(c => c.name);
    return this.buildResponse(query, limited, startTime, sourcesQueried, sourcesFailed, false);
  }

  async searchSource(source: SearchSource, query: SearchQuery): Promise<SearchResult[]> {
    const connector = this.connectors.get(source);
    if (!connector || !connector.isAvailable()) return [];
    try {
      return await connector.search(query);
    } catch {
      return [];
    }
  }

  getAvailableSources(): SearchSource[] {
    return Array.from(this.connectors.entries())
      .filter(([_, connector]) => connector.isAvailable())
      .map(([name]) => name);
  }

  getSourceStatus(): Record<SearchSource, { available: boolean; rateLimit: { remaining: number; resetAt: Date } }> {
    const status: Record<string, { available: boolean; rateLimit: { remaining: number; resetAt: Date } }> = {};
    for (const [name, connector] of this.connectors) {
      status[name] = {
        available: connector.isAvailable(),
        rateLimit: connector.getRateLimit(),
      };
    }
    return status;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      text: query.text,
      filters: query.filters,
      maxResults: query.options?.maxResults,
    });
  }

  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Map<string, SearchResult>();
    for (const result of results) {
      const key = `${result.source}-${result.title.toLowerCase().slice(0, 50)}`;
      const existing = seen.get(key);
      if (!existing || result.confidence > existing.confidence) {
        seen.set(key, result);
      }
    }
    return Array.from(seen.values());
  }

  private scoreResults(results: SearchResult[], query: SearchQuery): SearchResult[] {
    const queryTokens = new Set(query.text.toLowerCase().split(/\s+/).filter(t => t.length > 2));

    for (const result of results) {
      const titleTokens = new Set(result.title.toLowerCase().split(/\s+/));
      const descTokens = new Set(result.description.toLowerCase().split(/\s+/));
      const allTokens = new Set([...titleTokens, ...descTokens]);

      const overlap = [...queryTokens].filter(t => allTokens.has(t)).length;
      const textScore = queryTokens.size > 0 ? overlap / queryTokens.size : 0.5;
      const confidenceScore = result.confidence;
      const recencyScore = this.computeRecencyScore(result.timestamp);

      result.relevanceScore = textScore * 0.4 + confidenceScore * 0.3 + recencyScore * 0.3;
    }

    return results;
  }

  private computeRecencyScore(timestamp: Date): number {
    const ageHours = (Date.now() - timestamp.getTime()) / 3600000;
    if (ageHours < 1) return 1;
    if (ageHours < 6) return 0.9;
    if (ageHours < 24) return 0.8;
    if (ageHours < 72) return 0.6;
    if (ageHours < 168) return 0.4;
    return 0.2;
  }

  private buildResponse(
    query: SearchQuery,
    results: SearchResult[],
    startTime: number,
    sourcesQueried: SearchSource[],
    sourcesFailed: SearchSource[],
    cacheHit: boolean
  ): SearchResponse {
    const bySource: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    const timeline: Map<string, number> = new Map();

    for (const result of results) {
      bySource[result.source] = (bySource[result.source] ?? 0) + 1;
      byType[result.type] = (byType[result.type] ?? 0) + 1;

      if (result.location?.label) {
        const country = result.location.label.split(",").pop()?.trim() ?? "Unknown";
        byCountry[country] = (byCountry[country] ?? 0) + 1;
      }

      const dateKey = result.timestamp.toISOString().slice(0, 10);
      timeline.set(dateKey, (timeline.get(dateKey) ?? 0) + 1);
    }

    return {
      query,
      results,
      aggregations: {
        bySource: bySource as Record<SearchSource, number>,
        byType,
        byCountry,
        timeline: Array.from(timeline.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
      metadata: {
        totalResults: results.length,
        searchTime: Date.now() - startTime,
        sourcesQueried,
        sourcesFailed,
        cacheHit,
      },
    };
  }
}

export const federatedSearch = new FederatedSearchEngine();
