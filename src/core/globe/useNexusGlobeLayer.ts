/**
 * NEXUS Globe Layer
 * ─────────────────────────────────────────────────────────────
 * Renders NEXUS intelligence events directly onto the CesiumJS globe:
 * - Pulsing concentric rings for active alerts (level-colored)
 * - GPS jamming zone ellipses (orange translucent)
 * - Satellite ground-track polylines
 * - ADS-B void zones (dark red)
 * - Signal epicentre labels
 *
 * Uses Cesium Entity API for declarative management.
 * All entities are prefixed `__nexus_` for easy cleanup.
 */

import { useEffect, useRef } from "react";
import {
  Color,
  Cartesian3,
  ColorMaterialProperty,
  ConstantProperty,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  NearFarScalar,
  CallbackProperty,
} from "cesium";
import type { Viewer as CesiumViewer } from "cesium";
import { useStore } from "@/core/state/store";
import type { NexusAlert } from "@/core/state/nexusSlice";

// ─── Level → Cesium Color ─────────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  10: "#dc2626", 9: "#ef4444", 8: "#f97316", 7: "#f59e0b",
  6: "#eab308", 5: "#84cc16", 4: "#4ade80", 3: "#22d3ee",
};

function levelColor(level: number, alpha: number): Color {
  const hex = LEVEL_COLORS[level] || "#22d3ee";
  const c = Color.fromCssColorString(hex);
  return c.withAlpha(alpha);
}

// Pulsing animation value (0 → 1 → 0)
function getPulseAlpha(offsetMs = 0): number {
  const t = (Date.now() + offsetMs) / 1200;
  return 0.08 + 0.12 * Math.abs(Math.sin(t * Math.PI));
}

function getOuterPulse(offsetMs = 0): number {
  const t = (Date.now() + offsetMs) / 1800;
  return 0.03 + 0.06 * Math.abs(Math.sin(t * Math.PI));
}

// ─── Alert Circle Entities ─────────────────────────────────────

function addAlertEntities(viewer: CesiumViewer, alert: NexusAlert): string[] {
  const ids: string[] = [];
  const hex = LEVEL_COLORS[alert.level] || "#22d3ee";
  const baseColor = Color.fromCssColorString(hex);
  const radiusMeters = Math.max(50_000, alert.level * 30_000);
  const center = Cartesian3.fromDegrees(alert.lng, alert.lat);

  // Inner filled zone (pulsing)
  const zoneId = `__nexus_zone_${alert.id}`;
  viewer.entities.add({
    id: zoneId,
    position: center,
    ellipse: {
      semiMajorAxis: radiusMeters,
      semiMinorAxis: radiusMeters,
      material: new ColorMaterialProperty(
        new CallbackProperty(() => levelColor(alert.level, getPulseAlpha()), false)
      ) as any,
      outline: true,
      outlineColor: new ConstantProperty(levelColor(alert.level, 0.6)),
      outlineWidth: alert.level >= 7 ? 2.5 : 1.5,
      height: 0,
    },
  });
  ids.push(zoneId);

  // Outer ring (slower pulse, larger)
  if (alert.level >= 5) {
    const outerRingId = `__nexus_ring_${alert.id}`;
    viewer.entities.add({
      id: outerRingId,
      position: center,
      ellipse: {
        semiMajorAxis: radiusMeters * 1.65,
        semiMinorAxis: radiusMeters * 1.65,
        material: new ColorMaterialProperty(
          new CallbackProperty(() => levelColor(alert.level, getOuterPulse(600)), false)
        ) as any,
        outline: true,
        outlineColor: new ConstantProperty(levelColor(alert.level, 0.25)),
        outlineWidth: 1,
        height: 0,
      },
    });
    ids.push(outerRingId);
  }

  // Third expanding ring for critical+
  if (alert.level >= 8) {
    const ring3Id = `__nexus_ring3_${alert.id}`;
    viewer.entities.add({
      id: ring3Id,
      position: center,
      ellipse: {
        semiMajorAxis: radiusMeters * 2.4,
        semiMinorAxis: radiusMeters * 2.4,
        material: new ColorMaterialProperty(
          new CallbackProperty(() => levelColor(alert.level, getOuterPulse(1200)), false)
        ) as any,
        outline: true,
        outlineColor: new ConstantProperty(levelColor(alert.level, 0.12)),
        outlineWidth: 1,
        height: 0,
      },
    });
    ids.push(ring3Id);
  }

  // Centre point
  const pointId = `__nexus_point_${alert.id}`;
  viewer.entities.add({
    id: pointId,
    position: Cartesian3.fromDegrees(alert.lng, alert.lat, 1000),
    point: {
      pixelSize: alert.level >= 8 ? 14 : alert.level >= 6 ? 10 : 7,
      color: baseColor,
      outlineColor: Color.WHITE.withAlpha(0.5),
      outlineWidth: 2,
      scaleByDistance: new NearFarScalar(1e5, 1.5, 2e7, 0.4),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  ids.push(pointId);

  // Label
  const labelId = `__nexus_label_${alert.id}`;
  viewer.entities.add({
    id: labelId,
    position: Cartesian3.fromDegrees(alert.lng, alert.lat, 80_000),
    label: {
      text: `⬤ LV${alert.level} ${alert.zone.toUpperCase()}`,
      font: "bold 11px JetBrains Mono, monospace",
      style: LabelStyle.FILL_AND_OUTLINE,
      fillColor: baseColor,
      outlineColor: Color.fromCssColorString("#0a0f1e"),
      outlineWidth: 4,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.CENTER,
      pixelOffset: { x: 0, y: -14 } as any,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#0a0f1e").withAlpha(0.85),
      backgroundPadding: { x: 7, y: 4 } as any,
      scaleByDistance: new NearFarScalar(5e5, 1.0, 1.5e7, 0.0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: alert.level >= 4,
    },
  });
  ids.push(labelId);

  // Signal count badge
  const badgeId = `__nexus_badge_${alert.id}`;
  viewer.entities.add({
    id: badgeId,
    position: Cartesian3.fromDegrees(alert.lng + 0.3, alert.lat + 0.2, 60_000),
    label: {
      text: `${alert.signals.length} sig · ${alert.confidence}%`,
      font: "10px JetBrains Mono, monospace",
      style: LabelStyle.FILL_AND_OUTLINE,
      fillColor: Color.WHITE.withAlpha(0.7),
      outlineColor: Color.fromCssColorString("#0a0f1e"),
      outlineWidth: 3,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.LEFT,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#141b2d").withAlpha(0.8),
      backgroundPadding: { x: 5, y: 3 } as any,
      scaleByDistance: new NearFarScalar(1e6, 0.9, 8e6, 0.0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: alert.level >= 5,
    },
  });
  ids.push(badgeId);

  return ids;
}

// GPS Jamming zone (specific source types)
function addJammingZone(viewer: CesiumViewer, alert: NexusAlert): string[] {
  const hasJam = alert.signals.some(s => s.source === "gpsjam");
  if (!hasJam) return [];

  const id = `__nexus_jam_${alert.id}`;
  viewer.entities.add({
    id,
    position: Cartesian3.fromDegrees(alert.lng, alert.lat),
    ellipse: {
      semiMajorAxis: 180_000,
      semiMinorAxis: 140_000,
      material: new ColorMaterialProperty(
        Color.fromCssColorString("#f97316").withAlpha(0.07)
      ) as any,
      outline: true,
      outlineColor: new ConstantProperty(Color.fromCssColorString("#f97316").withAlpha(0.4)),
      outlineWidth: 1.5,
      height: 12_000,
      extrudedHeight: 25_000,
      rotation: (alert.id.charCodeAt(0) % 31) * 0.1,
    },
  });
  return [id];
}

// ADS-B void zone
function addAbsenceZone(viewer: CesiumViewer, alert: NexusAlert): string[] {
  const hasAbsence = alert.signals.some(s =>
    s.source === "absence_ads_b" || s.source === "absence_ais" || s.source === "absence_social"
  );
  if (!hasAbsence) return [];

  const id = `__nexus_void_${alert.id}`;
  viewer.entities.add({
    id,
    position: Cartesian3.fromDegrees(alert.lng, alert.lat),
    ellipse: {
      semiMajorAxis: 280_000,
      semiMinorAxis: 250_000,
      material: new ColorMaterialProperty(
        Color.fromCssColorString("#7f1d1d").withAlpha(0.08)
      ) as any,
      outline: true,
      outlineColor: new ConstantProperty(Color.fromCssColorString("#ef4444").withAlpha(0.25)),
      outlineWidth: 1,
      height: 0,
    },
  });
  return [id];
}

// ─── Damage Zones (UNOSAT/ACLED) ─────────────────────────────

const ATTACK_COLORS: Record<string, string> = {
  AIRSTRIKE:  "#ef4444",
  MISSILE:    "#f97316",
  DRONE:      "#a855f7",
  ARTILLERY:  "#f59e0b",
  NAVAL:      "#3b82f6",
  GROUND:     "#84cc16",
  UNKNOWN:    "#64748b",
};

function addDamageZone(
  viewer: CesiumViewer,
  zone: {
    id: string; name: string; lat: number; lng: number; radiusKm: number;
    destroyedStructures: number; totalAffected: number; percentageAffected: number;
    attackType: string; attributedActor: string; weaponSystem: string[];
    confidence: number; verifiedBy: string[];
  }
): string[] {
  const color = ATTACK_COLORS[zone.attackType] || "#ef4444";
  const cesiumColor = Color.fromCssColorString(color);
  const center = Cartesian3.fromDegrees(zone.lng, zone.lat, 0);
  const radiusM = zone.radiusKm * 1000;
  const ids: string[] = [];
  const t = () => performance.now() / 1000;

  // ── Zone principale: ellipse animée avec intensité selon dommages
  const damageIntensity = Math.min(1.0, zone.percentageAffected / 100);

  viewer.entities.add({
    id: `__nexus_dmg_ellipse_${zone.id}`,
    position: center,
    ellipse: {
      semiMajorAxis: new CallbackProperty(() => radiusM * (1 + Math.sin(t() * 0.5) * 0.03 * damageIntensity), false),
      semiMinorAxis: new CallbackProperty(() => radiusM * 0.85 * (1 + Math.sin(t() * 0.5) * 0.03 * damageIntensity), false),
      material: new ColorMaterialProperty(
        new CallbackProperty(() => cesiumColor.withAlpha(0.08 + 0.04 * Math.sin(t() * 0.7)), false)
      ) as any,
      outline: true,
      outlineColor: new ConstantProperty(cesiumColor.withAlpha(0.5)),
      outlineWidth: 2,
      height: 0,
    },
  });
  ids.push(`__nexus_dmg_ellipse_${zone.id}`);

  // ── Anneaux de dommages (1=modéré, 2=grave, 3=détruit — concentrique)
  const rings = [
    { scale: 1.0, alpha: 0.04, label: "DÉTRUIT" },
    { scale: 0.65, alpha: 0.08, label: "GRAVE" },
    { scale: 0.35, alpha: 0.14, label: "MODÉRÉ" },
  ];
  rings.forEach((ring, i) => {
    viewer.entities.add({
      id: `__nexus_dmg_ring_${zone.id}_${i}`,
      position: center,
      ellipse: {
        semiMajorAxis: radiusM * ring.scale,
        semiMinorAxis: radiusM * ring.scale * 0.85,
        material: new ColorMaterialProperty(cesiumColor.withAlpha(ring.alpha)) as any,
        height: 0,
      },
    });
    ids.push(`__nexus_dmg_ring_${zone.id}_${i}`);
  });

  // ── Label principal
  const attackIcons: Record<string, string> = {
    AIRSTRIKE: "✈", MISSILE: "🚀", DRONE: "⬡",
    ARTILLERY: "●", NAVAL: "⚓", GROUND: "☆", UNKNOWN: "?",
  };

  viewer.entities.add({
    id: `__nexus_dmg_label_${zone.id}`,
    position: Cartesian3.fromDegrees(zone.lng, zone.lat, 15000),
    label: {
      text: `${attackIcons[zone.attackType] || "●"} ${zone.name}\n${zone.destroyedStructures.toLocaleString()} détruits · ${zone.confidence}% conf`,
      font: "bold 11px JetBrains Mono",
      fillColor: Color.fromCssColorString(color),
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.CENTER,
      pixelOffset: new Cartesian3(0, -20, 0) as any,
      scaleByDistance: new NearFarScalar(500000, 1.0, 8000000, 0.4),
      backgroundPadding: new Cartesian3(6, 4, 0) as any,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#0a0f1e").withAlpha(0.85),
    },
  });
  ids.push(`__nexus_dmg_label_${zone.id}`);

  // ── Point central (épicenter)
  viewer.entities.add({
    id: `__nexus_dmg_center_${zone.id}`,
    position: center,
    point: {
      pixelSize: 8,
      color: cesiumColor.withAlpha(0.9),
      outlineColor: Color.WHITE.withAlpha(0.6),
      outlineWidth: 1,
    },
  });
  ids.push(`__nexus_dmg_center_${zone.id}`);

  return ids;
}

// ─── Hook ─────────────────────────────────────────────────────

import { DAMAGE_ZONES } from "@/nexus/telegram-intel";

export function useNexusGlobeLayer(viewer: CesiumViewer | null, ready: boolean) {
  const alerts = useStore(s => s.nexusAlerts);
  const entityIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!viewer || !ready || viewer.isDestroyed()) return;

    // Remove all existing NEXUS entities
    for (const id of entityIdsRef.current) {
      const e = viewer.entities.getById(id);
      if (e) viewer.entities.remove(e);
    }
    entityIdsRef.current = [];

    // ── Alertes NEXUS
    for (const alert of alerts) {
      if (alert.acknowledged && alert.level < 7) continue;
      const ids = [
        ...addAlertEntities(viewer, alert),
        ...addJammingZone(viewer, alert),
        ...addAbsenceZone(viewer, alert),
      ];
      entityIdsRef.current.push(...ids);
    }

    // ── Zones de dommages (UNOSAT/ACLED)
    for (const zone of DAMAGE_ZONES) {
      const ids = addDamageZone(viewer, zone);
      entityIdsRef.current.push(...ids);
    }

    // Force scene to keep rendering (for callback properties)
    viewer.scene.requestRenderMode = false;

    return () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const id of entityIdsRef.current) {
        const e = viewer.entities.getById(id);
        if (e) viewer.entities.remove(e);
      }
    };
  }, [viewer, ready, alerts]);
}
