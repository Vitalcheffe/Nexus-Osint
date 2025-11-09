import { create } from "zustand";
import { createGlobeSlice, type GlobeSlice } from "./globeSlice";
import { createLayersSlice, type LayersSlice } from "./layersSlice";
import { createTimelineSlice, type TimelineSlice } from "./timelineSlice";
import { createUISlice, type UISlice } from "./uiSlice";
import { createFilterSlice, type FilterSlice } from "./filterSlice";
import { createDataSlice, type DataSlice } from "./dataSlice";
import { createConfigSlice, type ConfigSlice } from "./configSlice";
import { createNexusSlice, type NexusSlice } from "./nexusSlice";

export type { MapConfig, DataConfig } from "./configSlice";
export type { LayerState } from "./layersSlice";
export type { NexusAlert, TelegramNotif, SocialSource, AlertLevel, LiveSignal, EconomicIndicator, IntelReport } from "./nexusSlice";

export type AppStore = GlobeSlice & LayersSlice & TimelineSlice & UISlice & FilterSlice & DataSlice & ConfigSlice & NexusSlice;

export const useStore = create<AppStore>((...args: Parameters<typeof createGlobeSlice>) => ({
  ...createGlobeSlice(...args),
  ...createLayersSlice(...args),
  ...createTimelineSlice(...args),
  ...createUISlice(...args),
  ...createFilterSlice(...args),
  ...createDataSlice(...args),
  ...createConfigSlice(...args),
  ...createNexusSlice(...args),
}));
