import { EyeOff } from "lucide-react";
import type {
  WorldPlugin, GeoEntity, TimeRange, PluginContext,
  LayerConfig, CesiumEntityOptions, FilterDefinition,
} from "@/core/plugins/PluginTypes";

interface AbsenceZone {
  id: string;
  type: "ADS_B_VOID" | "AIS_DARK" | "SOCIAL_BLACKOUT" | "INTERNET_SHUTDOWN";
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
  country: string;
  detectedAt: Date;
  confidenceScore: number;
  baselineTraffic: number;
  currentTraffic: number;
  dropPercent: number;
  durationMin: number;
  nexusSignalStrength: number;
  militaryContext: boolean;
}


function absenceToEntity(z: AbsenceZone): GeoEntity {
  return {
    id: z.id,
    pluginId: "absence",
    latitude: z.lat,
    longitude: z.lng,
    timestamp: z.detectedAt,
    label: z.label,
    properties: {
      type: z.type,
      country: z.country,
      radiusKm: z.radiusKm,
      confidenceScore: z.confidenceScore,
      dropPercent: z.dropPercent,
      durationMin: z.durationMin,
      militaryContext: z.militaryContext,
      nexusSignalStrength: z.nexusSignalStrength,
      baselineTraffic: z.baselineTraffic,
      currentTraffic: z.currentTraffic,
    },
  };
}

export class AbsencePlugin implements WorldPlugin {
  id = "absence";
  name = "Absence Signals";
  description = "ADS-B voids, dark ships, social blackouts";
  icon = EyeOff;
  category = "custom" as const;
  version = "1.0.0";

  private context: PluginContext | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private currentZones: AbsenceZone[] = [];

  async initialize(ctx: PluginContext): Promise<void> {
    this.context = ctx;
  }

  destroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.context = null;
  }

  async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
    try {
      const [adsbRes] = await Promise.allSettled([
        fetch("/api/absence", { signal: AbortSignal.timeout(5000) }),
      ]);

      if (adsbRes.status === "fulfilled" && adsbRes.value.ok) {
        const data = await adsbRes.value.json();
        if (data.zones?.length) {
          this.currentZones = data.zones;
          return data.zones.map(absenceToEntity);
        }
      }
    } catch {}

    return this.currentZones.map(z => ({
      ...absenceToEntity(z),
      timestamp: new Date(),
    }));
  }

  getPollingInterval(): number {
    return 120000;
  }

  getLayerConfig(): LayerConfig {
    return {
      color: "#64748b",
      clusterEnabled: false,
      clusterDistance: 0,
    };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    const type = entity.properties.type as string;
    const drop = entity.properties.dropPercent as number;
    const military = entity.properties.militaryContext as boolean;

    const color = military
      ? drop > 85 ? "#dc2626" : "#f97316"
      : drop > 80 ? "#f59e0b" : "#64748b";

    return {
      type: "point",
      color,
      size: 10 + Math.min(8, drop / 10),
      outlineColor: color,
      outlineWidth: 2,
      labelText: entity.label || undefined,
      labelFont: "10px JetBrains Mono, monospace",
    };
  }

  getFilterDefinitions(): FilterDefinition[] {
    return [
      {
        id: "absence_type",
        label: "Signal Type",
        type: "select",
        propertyKey: "type",
        options: [
          { value: "ADS_B_VOID", label: "ADS-B Void" },
          { value: "AIS_DARK", label: "AIS Dark Ship" },
          { value: "SOCIAL_BLACKOUT", label: "Social Blackout" },
          { value: "INTERNET_SHUTDOWN", label: "Internet Shutdown" },
        ],
      },
      {
        id: "drop_percent",
        label: "Traffic Drop %",
        type: "range",
        propertyKey: "dropPercent",
        range: { min: 50, max: 100, step: 5 },
      },
    ];
  }
}
