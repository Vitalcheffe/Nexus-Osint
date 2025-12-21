"use client";

import { useEffect } from "react";
import { Header } from "./Header";
import { LayerPanel } from "@/components/panels/LayerPanel";
import { EntityInfoCard } from "@/components/panels/EntityInfoCard";
import { DataConfigPanel } from "@/components/panels/DataConfigPanel";
import CameraStatsPanel from "@/components/panels/CameraStatsPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { TimelineSync } from "@/core/globe/TimelineSync";
import { pluginManager } from "@/core/plugins/PluginManager";
import { pluginRegistry } from "@/core/plugins/PluginRegistry";
import { AviationPlugin } from "@/plugins/aviation";
import { MaritimePlugin } from "@/plugins/maritime";
import { WildfirePlugin } from "@/plugins/wildfire";
import { BordersPlugin } from "@/plugins/borders";
import { SocialPlugin } from "@/plugins/social";
import { EconomicPlugin } from "@/plugins/economic";
import { GpsJamPlugin } from "@/plugins/gpsjam";
import { SatellitePlugin } from "@/plugins/satellites";
import { CamerasPlugin } from "@/plugins/cameras";
import { AbsencePlugin } from "@/plugins/absence";
import { PrivateJetPlugin } from "@/plugins/privatejet";
import { NightlightsPlugin } from "@/plugins/nightlights";
import { TelegramPlugin } from "@/plugins/telegram";
import { initNexusBridge, destroyNexusBridge } from "@/nexus/bridge";
import { useStore } from "@/core/state/store";
import { dataBus } from "@/core/data/DataBus";
import { PanelToggleArrows } from "@/components/layout/PanelToggleArrows";
import { NexusPanel } from "@/components/panels/NexusPanel";
import { EventDetailPanel } from "@/components/panels/EventDetailPanel";
import dynamic from "next/dynamic";

const GlobeView = dynamic(() => import("@/core/globe/GlobeView"), {
    ssr: false,
    loading: () => (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
            <div className="status-badge">
                <span className="status-badge__dot" />
                Loading Engine...
            </div>
        </div>
    ),
});

export function AppShell() {
    const initLayer = useStore((s) => s.initLayer);

    useEffect(() => {
        const startPlatform = async () => {
            pluginRegistry.register(new AviationPlugin());
            pluginRegistry.register(new MaritimePlugin());
            pluginRegistry.register(new WildfirePlugin());
            pluginRegistry.register(new BordersPlugin());
            pluginRegistry.register(new SocialPlugin());
            pluginRegistry.register(new EconomicPlugin());
            pluginRegistry.register(new GpsJamPlugin());
            pluginRegistry.register(new SatellitePlugin());
            pluginRegistry.register(new CamerasPlugin());
            pluginRegistry.register(new AbsencePlugin());
            pluginRegistry.register(new PrivateJetPlugin());
            pluginRegistry.register(new NightlightsPlugin());
            pluginRegistry.register(new TelegramPlugin());

            // Bridge connects engine events → Zustand store (alerts, signals, tasks).
            // Must be initialized before plugins start polling so no events are lost.
            initNexusBridge();

            await pluginManager.init();

            for (const plugin of pluginRegistry.getAll()) {
                await pluginManager.registerPlugin(plugin);
                initLayer(plugin.id);
            }
        };

        startPlatform();

        const unsubData = dataBus.on("dataUpdated", ({ pluginId, entities }) => {
            useStore.getState().setEntities(pluginId, entities);
            useStore.getState().setEntityCount(pluginId, entities.length);
        });

        return () => {
            unsubData();
            pluginManager.destroy();
            destroyNexusBridge();
        };
    }, [initLayer]);

    return (
        <div className="app-shell">
            <div className="app-shell__globe">
                <GlobeView />
            </div>
            <TimelineSync />
            <PanelToggleArrows />
            <Header />
            <LayerPanel />
            <NexusPanel />
            <EventDetailPanel />
            <DataConfigPanel />
            <CameraStatsPanel />
            <EntityInfoCard />
            <Timeline />
        </div>
    );
}
