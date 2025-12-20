import { Moon } from "lucide-react";
import type {
  WorldPlugin, GeoEntity, TimeRange, PluginContext,
  LayerConfig, CesiumEntityOptions, FilterDefinition,
} from "@/core/plugins/PluginTypes";

interface NightlightAnomaly {
  id: string;
  lat: number;
  lng: number;
  zone: string;
  country: string;
  type: "BLACKOUT" | "SURGE" | "GRADUAL_DECLINE" | "RECOVERY";
  delta: number;
  baseline: number;
  current: number;
  radiusKm: number;
  affectedPopulation: number;
  confidence: number;
  possibleCause: string;
  nexusSignal: number;
  detectedAt: Date;
  durationDays: number;
}


function anomalyToEntity(a: NightlightAnomaly): GeoEntity {
  return {
    id: a.id,
    pluginId: "nightlights",
    latitude: a.lat,
    longitude: a.lng,
    timestamp: a.detectedAt,
    label: a.zone,
    properties: {
      zone: a.zone,
      country: a.country,
      type: a.type,
      delta: a.delta,
      baseline: a.baseline,
      current: a.current,
      radiusKm: a.radiusKm,
      affectedPopulation: a.affectedPopulation,
      confidence: a.confidence,
      possibleCause: a.possibleCause,
      nexusSignal: a.nexusSignal,
      durationDays: a.durationDays,
    },
  };
}

const TYPE_COLORS: Record<NightlightAnomaly["type"], string> = {
  BLACKOUT:        "#dc2626",
  SURGE:           "#f59e0b",
  GRADUAL_DECLINE: "#f97316",
  RECOVERY:        "#4ade80",
};

export class NightlightsPlugin implements WorldPlugin {
  id = "nightlights";
  name = "Night Lights";
  description = "NASA Black Marble VIIRS delta anomalies — blackouts & surges";
  icon = Moon;
  category = "custom" as const;
  version = "1.0.0";

  private context: PluginContext | null = null;

  async initialize(ctx: PluginContext): Promise<void> {
    this.context = ctx;
  }

  destroy(): void {
    this.context = null;
  }

  async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
    try {
      const res = await fetch("/api/nightlights", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.anomalies?.length) return data.anomalies.map(anomalyToEntity);
      }
    } catch {}

    // API unavailable — show nothing rather than stale local data
    return [];
  }

  getPollingInterval(): number {
    return 86400000;
  }

  getLayerConfig(): LayerConfig {
    return {
      color: "#1e3a5f",
      clusterEnabled: false,
      clusterDistance: 0,
    };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    const type = entity.properties.type as NightlightAnomaly["type"];
    const delta = Math.abs(entity.properties.delta as number);
    const color = TYPE_COLORS[type] || "#64748b";

    return {
      type: "point",
      color,
      size: 8 + Math.min(10, delta * 12),
      outlineColor: color,
      outlineWidth: 1,
      labelText: entity.label || undefined,
      labelFont: "10px JetBrains Mono, monospace",
    };
  }

  getFilterDefinitions(): FilterDefinition[] {
    return [
      {
        id: "anomaly_type",
        label: "Anomaly Type",
        type: "select",
        propertyKey: "type",
        options: [
          { value: "BLACKOUT", label: "Blackout" },
          { value: "SURGE", label: "Surge" },
          { value: "GRADUAL_DECLINE", label: "Gradual Decline" },
          { value: "RECOVERY", label: "Recovery" },
        ],
      },
      {
        id: "confidence",
        label: "Confidence",
        type: "range",
        propertyKey: "confidence",
        range: { min: 0.5, max: 1.0, step: 0.05 },
      },
    ];
  }
}
