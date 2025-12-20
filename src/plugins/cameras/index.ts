/**
 * Public Cameras Plugin
 * ─────────────────────────────────────────────────────────────
 * Visual ground truth for NEXUS alerts.
 * When NEXUS fires a Level 7+ alert, this plugin automatically
 * queries for cameras within 50km radius to confirm visually.
 *
 * Sources (all legal, public APIs):
 *  - EarthCam API (earthcam.com/api) — thousands of live webcams
 *  - Windy.com Webcams API (api.windy.com/webcams) — 50k+ cameras
 *  - NYC DOT (data.cityofnewyork.us) — 900+ traffic cameras
 *  - TfL API (api.tfl.gov.uk) — London traffic cameras
 *  - YouTube Data API v3 — YOUTUBE_API_KEY env var
 *
 * Computer Vision pipeline (optional, requires GPU sidecar):
 *  - YOLO v8: detect smoke, military vehicles, crowds
 *  - CLIP: scene classification
 *  - Output: visual confirmation score fed to NEXUS engine
 */

import type {
  WorldPlugin,
  GeoEntity,
  TimeRange,
  PluginContext,
  LayerConfig,
  CesiumEntityOptions,
} from "@/core/plugins/PluginTypes";
import { nexusEngine } from "@/nexus/engine";
import type { NexusSignal } from "@/nexus/types";

interface PublicCamera {
  id: string;
  type: "webcam" | "traffic" | "youtube_live" | "port" | "weather";
  name: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  streamUrl?: string;
  thumbnailUrl?: string;
  isLive: boolean;
  /** Computer Vision result (if sidecar is active) */
  cvDetections?: string[];
  cvConfidence?: number;
  /** Whether this camera is near an active NEXUS alert */
  isAlertProximity: boolean;
  lastUpdate: Date;
}


export class CamerasPlugin implements WorldPlugin {
  id = "cameras";
  name = "Caméras Publiques";
  description = "Ground truth visuelle — EarthCam, Windy, DOT, TfL, YouTube Lives";
  icon = "📷";
  category = "custom" as const;
  version = "1.0.0";

  private ctx: PluginContext | null = null;

  async initialize(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
  }

  destroy(): void { this.ctx = null; }

  async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
    const res = await fetch("/api/cameras");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.cameras?.length) return [];
    const cameras: PublicCamera[] = data.cameras;

    // Feed CV confirmations to NEXUS engine
    for (const cam of cameras) {
      if (cam.isAlertProximity && cam.cvDetections && cam.cvConfidence && cam.cvConfidence > 0.6) {
        const signal: NexusSignal = {
          id: `camera-cv-${cam.id}`,
          source: cam.type === "youtube_live" ? "camera_youtube" : "camera_ip",
          lat: cam.lat,
          lng: cam.lng,
          radiusKm: 5,
          eventTime: cam.lastUpdate,
          ingestTime: new Date(),
          description: `Caméra ${cam.name} — Vision IA détecte: ${cam.cvDetections.join(", ")} (confiance ${Math.round(cam.cvConfidence * 100)}%)`,
          confidence: cam.cvConfidence,
          payload: {
            cameraId: cam.id,
            cameraName: cam.name,
            detections: cam.cvDetections,
            streamUrl: cam.streamUrl,
            cameraType: cam.type,
          },
        };
        nexusEngine.ingest(signal);
      }
    }

    return cameras.map((cam) => ({
      id: `camera-${cam.id}`,
      pluginId: "cameras",
      latitude: cam.lat,
      longitude: cam.lng,
      timestamp: cam.lastUpdate,
      label: cam.name,
      properties: {
        type: cam.type,
        city: cam.city,
        country: cam.country,
        isLive: cam.isLive,
        isAlertProximity: cam.isAlertProximity,
        cvDetections: cam.cvDetections || [],
        cvConfidence: cam.cvConfidence || 0,
        streamUrl: cam.streamUrl,
      },
    }));
  }

  getPollingInterval(): number { return 60_000; } // 1 minute

  getLayerConfig(): LayerConfig {
    return {
      color: "#4ade80",
      clusterEnabled: true,
      clusterDistance: 50,
      maxEntities: 500,
    };
  }

  renderEntity(entity: GeoEntity): CesiumEntityOptions {
    const isAlert = entity.properties.isAlertProximity as boolean;
    const conf = entity.properties.cvConfidence as number;
    return {
      type: "point",
      color: isAlert ? (conf > 0.7 ? "#ef4444" : "#f59e0b") : "#4ade80",
      size: isAlert ? 8 : 5,
      outlineColor: "#ffffff",
      outlineWidth: 1,
    };
  }
}
