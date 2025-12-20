import { Plane } from "lucide-react";
import type {
  WorldPlugin, GeoEntity, TimeRange, PluginContext,
  LayerConfig, CesiumEntityOptions, FilterDefinition,
} from "@/core/plugins/PluginTypes";

interface PrivateJet {
  id: string;
  icao24: string;
  callsign: string;
  owner: string;
  ownerCategory: "OLIGARCH" | "ROYAL" | "MINISTER" | "CEO" | "ARMS_DEALER" | "UNKNOWN";
  nationality: string;
  aircraftType: string;
  lat: number;
  lng: number;
  altitude: number;
  speed: number;
  heading: number;
  origin?: string;
  destination?: string;
  isAnomalous: boolean;
  anomalyReason?: string;
  nexusRelevance: number;
  lastSeen: Date;
}


function jetToEntity(jet: PrivateJet): GeoEntity {
  return {
    id: jet.id,
    pluginId: "privatejet",
    latitude: jet.lat,
    longitude: jet.lng,
    altitude: jet.altitude,
    heading: jet.heading,
    speed: jet.speed,
    timestamp: jet.lastSeen,
    label: `${jet.callsign} — ${jet.owner.split(" ")[0]}`,
    properties: {
      icao24: jet.icao24,
      callsign: jet.callsign,
      owner: jet.owner,
      ownerCategory: jet.ownerCategory,
      nationality: jet.nationality,
      aircraftType: jet.aircraftType,
      origin: jet.origin || "Unknown",
      destination: jet.destination || "Unknown",
      isAnomalous: jet.isAnomalous,
      anomalyReason: jet.anomalyReason || "",
      nexusRelevance: jet.nexusRelevance,
    },
  };
}

const CATEGORY_COLORS: Record<PrivateJet["ownerCategory"], string> = {
  OLIGARCH:    "#ef4444",
  ROYAL:       "#f59e0b",
  MINISTER:    "#3b82f6",
  CEO:         "#22d3ee",
  ARMS_DEALER: "#dc2626",
  UNKNOWN:     "#64748b",
};

export class PrivateJetPlugin implements WorldPlugin {
  id = "privatejet";
  name = "Private Jets";
  description = "Oligarch, government & VIP aircraft anomaly tracking";
  icon = Plane;
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
      const res = await fetch("/api/aviation?filter=privatejet", {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.jets?.length) return data.jets.map(jetToEntity);
      }
    } catch {}

    // adsb.fi returned no watchlisted aircraft — show nothing rather than fake positions
    return [];
  }

  getPollingInterval(): number {
    return 60000;
  }

  getLayerConfig(): LayerConfig {
    return {
      color: "#f59e0b",
      clusterEnabled: false,
      clusterDistance: 0,
    };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    const cat = entity.properties.ownerCategory as PrivateJet["ownerCategory"];
    const anomalous = entity.properties.isAnomalous as boolean;
    const color = CATEGORY_COLORS[cat] || "#64748b";

    return {
      type: "billboard",
      color,
      size: anomalous ? 14 : 9,
      rotation: (entity.heading || 0),
      labelText: anomalous ? `⚠ ${entity.label}` : entity.label || undefined,
      labelFont: "10px JetBrains Mono, monospace",
    };
  }

  getFilterDefinitions(): FilterDefinition[] {
    return [
      {
        id: "owner_category",
        label: "Owner Category",
        type: "select",
        propertyKey: "ownerCategory",
        options: [
          { value: "OLIGARCH", label: "Oligarch" },
          { value: "ROYAL", label: "Royal Family" },
          { value: "MINISTER", label: "Government/Minister" },
          { value: "CEO", label: "Tech CEO" },
          { value: "ARMS_DEALER", label: "Arms Network" },
        ],
      },
      {
        id: "anomalous_only",
        label: "Anomalous Only",
        type: "select",
        propertyKey: "isAnomalous",
        options: [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ],
      },
    ];
  }
}
