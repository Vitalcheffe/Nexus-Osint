import { Radio } from "lucide-react";
import type {
  WorldPlugin, GeoEntity, TimeRange, PluginContext,
  LayerConfig, CesiumEntityOptions, FilterDefinition,
} from "@/core/plugins/PluginTypes";
import { NEXUS_CHANNELS } from "@/nexus/telegram-intel";

interface TelegramSignalEntity {
  id: string;
  channelHandle: string;
  channelName: string;
  lat: number;
  lng: number;
  zone: string;
  country: string;
  credibilityScore: number;
  bias: string;
  messageCount: number;
  latestText: string;
  isFirst: boolean;
  urgencyScore: number;
  timestamp: Date;
}

const ZONE_COORDS: Record<string, [number, number]> = {
  "Gaza":        [31.5,   34.45],  "Israel":       [32.08, 34.78],
  "West Bank":   [31.9,   35.2 ],  "Lebanon":      [33.89, 35.5 ],
  "Syria":       [33.51,  36.29],  "Iran":         [35.69, 51.39],
  "Iraq":        [33.34,  44.40],  "Yemen":        [15.35, 44.20],
  "Red Sea":     [15.0,   43.0 ],  "Ukraine":      [49.0,  32.0 ],
  "Russia":      [55.75,  37.62],  "Belarus":      [53.9,  27.56],
  "Taiwan":      [25.0,  121.5 ],  "China":        [39.91, 116.39],
  "North Korea": [39.01, 125.73],  "Mali":         [17.57, -3.99],
  "Sudan":       [15.6,   32.5 ],  "Ethiopia":     [9.1,   40.5 ],
  "Pakistan":    [30.4,   69.3 ],  "Afghanistan":  [33.9,  67.7 ],
  "Middle East": [29.0,   40.0 ],  "Global":       [20.0,  10.0 ],
};

function getCoords(regions: string[]): [number, number] {
  for (const z of regions) {
    const key = Object.keys(ZONE_COORDS).find(k =>
      z.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(z.toLowerCase())
    );
    if (key) return ZONE_COORDS[key];
  }
  // Fallback: unknown region defaults to geographic centroid of active conflict zones
  return [27.0, 42.0]; // Arabian Peninsula / Horn of Africa midpoint
}

// Globe entities are built from real channel metadata (handle, credibility, specialties, region).
// latestText shows the channel's documented specialties — NOT invented message content.
// Live message text comes exclusively from /api/telegram-intel (Telethon collector).

function generateEntities(): TelegramSignalEntity[] {
  const channels = NEXUS_CHANNELS.filter(ch => ch.credibilityScore >= 60);
  return channels.map(ch => {
    const coords = getCoords(ch.regions);
    // Display channel's real documented specialties — not invented messages
    const specialtyText = `${ch.handle} · cred ${ch.credibilityScore} · ${ch.specialties.slice(0, 2).join(", ")}`;
    const zone = ch.regions[0] ?? "Global";

    return {
      id: `tg-${ch.handle}`,
      channelHandle: ch.handle,
      channelName: ch.name,
      lat: coords[0],
      lng: coords[1],
      zone,
      country: ch.regions[0] ?? "XX",
      credibilityScore: ch.credibilityScore,
      bias: ch.bias,
      messageCount: 0, // 0 = no live feed. Live counts come from /api/telegram-intel
      latestText: specialtyText,
      isFirst: ch.firstMoverScore >= 80,
      urgencyScore: ch.credibilityScore / 100,
      timestamp: new Date(),
    };
  });
}

function toGeo(e: TelegramSignalEntity): GeoEntity {
  return {
    id: e.id,
    pluginId: "telegram",
    latitude: e.lat,
    longitude: e.lng,
    timestamp: e.timestamp,
    label: `${e.channelHandle} (${e.credibilityScore})`,
    properties: {
      channelHandle: e.channelHandle,
      channelName: e.channelName,
      zone: e.zone,
      country: e.country,
      credibilityScore: e.credibilityScore,
      bias: e.bias,
      messageCount: e.messageCount,
      latestText: e.latestText,
      isFirst: e.isFirst,
      urgencyScore: e.urgencyScore,
    },
  };
}

export class TelegramPlugin implements WorldPlugin {
  id = "telegram";
  name = "Telegram Intel";
  description = "92+ OSINT channels — geolocated signals on globe";
  icon = Radio;
  category = "custom" as const;
  version = "2.0.0";

  private context: PluginContext | null = null;
  private cache: GeoEntity[] = [];
  private lastFetch = 0;

  async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
  destroy(): void { this.context = null; }

  async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
    if (Date.now() - this.lastFetch < 60000 && this.cache.length > 0) {
      // Return cache as-is. messageCount must only increment from real
      // messages received via /api/telegram-intel POST (Telethon).
      // Never simulate activity without real data.
      return this.cache;
    }
    try {
      const res = await fetch("/api/telegram-intel", { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (data.signals?.length) {
          this.cache = data.signals.map(toGeo);
          this.lastFetch = Date.now();
          return this.cache;
        }
      }
    } catch { /* API unavailable — fall through to channel metadata */ }
    this.cache = generateEntities().map(toGeo);
    this.lastFetch = Date.now();
    return this.cache;
  }

  getPollingInterval(): number { return 120000; }

  getLayerConfig(): LayerConfig {
    return { color: "#3b82f6", clusterEnabled: true, clusterDistance: 60 };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    const score = entity.properties.credibilityScore as number;
    const isFirst = entity.properties.isFirst as boolean;
    const urgency = entity.properties.urgencyScore as number;
    const color = isFirst ? "#f59e0b" : score >= 80 ? "#22d3ee" : score >= 65 ? "#3b82f6" : "#64748b";
    return {
      type: "point",
      color,
      size: 5 + Math.round(urgency * 6),
      outlineColor: isFirst ? "#f59e0b" : color,
      outlineWidth: isFirst ? 2 : 1,
      labelText: isFirst ? `★ ${entity.label}` : entity.label ?? undefined,
      labelFont: "9px JetBrains Mono, monospace",
    };
  }

  getFilterDefinitions(): FilterDefinition[] {
    return [
      { id: "credibility", label: "Credibility Score", type: "range", propertyKey: "credibilityScore", range: { min: 0, max: 100, step: 5 } },
      {
        id: "bias", label: "Editorial Bias", type: "select", propertyKey: "bias",
        options: [
          { value: "NEUTRAL",           label: "Neutral"           },
          { value: "PRO_UKRAINE",       label: "Pro-Ukraine"       },
          { value: "PRO_RUSSIA",        label: "Pro-Russia"        },
          { value: "PRO_ISRAEL",        label: "Pro-Israel"        },
          { value: "PRO_IRAN",          label: "Pro-Iran"          },
          { value: "WESTERN_ANALYTICS", label: "Western Analytics" },
        ],
      },
      {
        id: "first_mover", label: "First Mover Only", type: "select", propertyKey: "isFirst",
        options: [{ value: "true", label: "First Movers Only" }, { value: "false", label: "All Channels" }],
      },
    ];
  }
}
