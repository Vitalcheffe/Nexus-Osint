"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/core/state/store";
import { dataBus } from "@/core/data/DataBus";
import { pluginManager } from "@/core/plugins/PluginManager";
import { Globe } from "lucide-react";
import { SearchBar } from "./SearchBar";

const REGIONS = [
    { id: "global",      label: "Global",   icon: Globe },
    { id: "americas",    label: "Americas", icon: Globe },
    { id: "europe",      label: "Europe",   icon: Globe },
    { id: "mena",        label: "MENA",     icon: Globe },
    { id: "asiaPacific", label: "Asia",     icon: Globe },
    { id: "africa",      label: "Africa",   icon: Globe },
    { id: "oceania",     label: "Oceania",  icon: Globe },
    { id: "arctic",      label: "Arctic",   icon: Globe },
];

const TIME_WINDOWS = ["1h", "6h", "24h", "48h", "7d"] as const;

function NexusAlertButton() {
    const alerts = useStore((s) => s.nexusAlerts);
    const toggleNexus = useStore((s) => s.toggleNexusPanel);
    const critical = alerts.filter((a) => a.level >= 7 && !a.acknowledged).length;

    return (
        <button
            className="btn"
            onClick={toggleNexus}
            style={{
                position: "relative",
                background: critical > 0 ? "rgba(239,68,68,0.1)" : "var(--bg-glass)",
                borderColor: critical > 0 ? "rgba(239,68,68,0.35)" : "var(--border-subtle)",
                color: critical > 0 ? "#ef4444" : "var(--text-secondary)",
                gap: 6,
                flexShrink: 0,
            }}
        >
            <span style={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: critical > 0 ? "#ef4444" : "var(--accent-green)",
                boxShadow: critical > 0 ? "0 0 6px #ef4444" : "0 0 4px var(--accent-green)",
                animation: critical > 0 ? "pulse 1s ease-in-out infinite" : "none",
            }} />
            NEXUS
            {critical > 0 && (
                <span
                    style={{
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 700,
                        background: "#ef4444",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "1px 5px",
                        lineHeight: 1.4,
                    }}
                >
                    {critical}
                </span>
            )}
        </button>
    );
}

export function Header() {
    const timeWindow = useStore((s) => s.timeWindow);
    const setTimeWindow = useStore((s) => s.setTimeWindow);

    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };
        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => el.removeEventListener("wheel", handleWheel);
    }, []);

    return (
        <header className="header glass-panel">
            <div className="header__brand">
                <div>
                    <div className="header__logo">NEXUS</div>
                    <div className="header__subtitle">Geospatial Intelligence Platform</div>
                </div>
                <div style={{ marginLeft: "var(--space-xl)" }}>
                    <SearchBar />
                </div>
            </div>
            <div className="header__controls">
                <div className="header__controls-scroll" ref={scrollContainerRef}>
                    {REGIONS.map((r) => (
                        <button
                            key={r.id}
                            className="btn btn--glow"
                            onClick={() => dataBus.emit("cameraPreset", { presetId: r.id })}
                            title={r.label}
                            style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}
                        >
                            <r.icon size={14} />
                            {r.label}
                        </button>
                    ))}
                    <div style={{ width: 1, height: 20, background: "var(--border-subtle)", flexShrink: 0 }} />
                    {TIME_WINDOWS.map((tw) => (
                        <button
                            key={tw}
                            className={`btn ${timeWindow === tw ? "btn--active" : ""}`}
                            style={{ flexShrink: 0 }}
                            onClick={() => {
                                setTimeWindow(tw);
                                const range = useStore.getState().timeRange;
                                pluginManager.updateTimeRange(range);
                            }}
                        >
                            {tw}
                        </button>
                    ))}
                </div>
                <div className="header__actions">
                    <div style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />
                    <NexusAlertButton />
                    <div style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />
                    <div className="status-badge">
                        <span className="status-badge__dot" />
                        LIVE
                    </div>
                </div>
            </div>
        </header>
    );
}
