import { Ship } from "lucide-react";
import type {
    WorldPlugin,
    GeoEntity,
    TimeRange,
    PluginContext,
    LayerConfig,
    CesiumEntityOptions,
    FilterDefinition,
} from "@/core/plugins/PluginTypes";

const VESSEL_COLORS: Record<string, string> = {
    cargo: "#f59e0b",     // amber
    tanker: "#ef4444",    // red
    passenger: "#3b82f6", // blue
    fishing: "#22d3ee",   // cyan
    military: "#a78bfa",  // purple
    sailing: "#4ade80",   // green
    tug: "#f97316",       // orange
    other: "#94a3b8",     // slate
};

function getVesselColor(type: string): string {
    const lower = type.toLowerCase();
    for (const [key, color] of Object.entries(VESSEL_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return VESSEL_COLORS.other;
}

// Demo AIS data (used when no real AIS feed is configured)

export class MaritimePlugin implements WorldPlugin {
    id = "maritime";
    name = "Maritime";
    description = "Vessel tracking via AIS feeds";
    icon = Ship;
    category = "maritime" as const;
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
            const res = await fetch("/api/maritime");
            if (!res.ok) return [];
            const data = await res.json();
            if (!data.vessels?.length) return []; // AIS stream not yet populated or AISSTREAM_API_KEY not set

            return data.vessels.map((v: Record<string, unknown>) => ({
                ...v,
                timestamp: new Date(v.timestamp as string),
            }));
        } catch {
            return []; // AIS unreachable — show nothing rather than fake positions
        }
    }

    getPollingInterval(): number {
        return 60000; // 60 seconds
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#f59e0b",
            clusterEnabled: true,
            clusterDistance: 50,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const vesselType = (entity.properties.vesselType as string) || "other";
        return {
            type: "point",
            color: getVesselColor(vesselType),
            size: 7,
            rotation: entity.heading,
            outlineColor: "#000000",
            outlineWidth: 1,
            labelText: entity.label || undefined,
            labelFont: "11px JetBrains Mono, monospace",
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "vessel_type",
                label: "Vessel Type",
                type: "select",
                propertyKey: "vesselType",
                options: [
                    { value: "cargo", label: "Cargo" },
                    { value: "tanker", label: "Tanker" },
                    { value: "passenger", label: "Passenger" },
                    { value: "fishing", label: "Fishing" },
                    { value: "military", label: "Military" },
                    { value: "sailing", label: "Sailing" },
                    { value: "tug", label: "Tug" },
                    { value: "other", label: "Other" },
                ],
            },
            {
                id: "speed",
                label: "Speed (knots)",
                type: "range",
                propertyKey: "speed_knots",
                range: { min: 0, max: 30, step: 1 },
            },
        ];
    }
}
