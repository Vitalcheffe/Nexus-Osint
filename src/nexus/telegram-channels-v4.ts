/**
 * NEXUS Telegram Channel Metadata
 * ─────────────────────────────────────────────────────────────
 *
 * Métadonnées de canaux Telegram monitorés.
 *
 * LES SCORES DE CRÉDIBILITÉ NE SONT PAS HARDCODÉS.
 * Ils sont calculés dynamiquement par credibilityEngine.
 *
 * Ces métadonnées sont des faits observables:
 * - langue, région, affiliations déclarées
 * - warnings documentés (sources: OpenMinds, OSINT for Ukraine, etc.)
 */

// ─── Types ──────────────────────────────────────────────────────

export type ChannelBias = 
  | "PRO_ISRAEL" | "PRO_PALESTINE" | "PRO_UKRAINE" | "PRO_RUSSIA"
  | "PRO_IRAN" | "PRO_WEST" | "NEUTRAL_JOURNALIST" | "AGGREGATOR"
  | "OFFICIAL" | "ANALYST" | "FIELD_REPORTER";

export type ChannelTier = 
  | "PRIMARY"    // Source originale terrain
  | "SECONDARY"  // Agrège + analyse
  | "TERTIARY";  // Reposte sans vérification

export type NarrativeCluster =
  | "WESTERN_ANALYTICS"
  | "RUSSIAN_PROPAGANDA"
  | "RESISTANCE_AXIS"
  | "ISRAEL_PRO"
  | "FAR_RIGHT_EXTREMIST"
  | "CONSPIRACY_ALT"
  | "DATA_VISUALIZATION"
  | "SPANISH_GEOPOLITICS"
  | "NEUTRAL_AGGREGATOR";

export interface ChannelMetadata {
  id: string;
  handle: string;
  url: string;
  name: string;
  languages: string[];
  regions: string[];
  bias: ChannelBias;
  tier: ChannelTier;
  cluster?: NarrativeCluster;
  declaredAffiliation?: string;
  specialties: string[];
  knownAffiliations: string[];
  documentedWarnings: string[];
  warningSources: string[];
}

// ─── Monitored Channels ─────────────────────────────────────────
// Scores calculés dynamiquement par credibilityEngine

export const MONITORED_CHANNELS_V4: ChannelMetadata[] = [
  // ── PRIMARY SOURCES ───────────────────────────────────────────
  {
    id: "idfofficial",
    handle: "idfofficial",
    url: "https://t.me/idfofficial",
    name: "IDF Official",
    languages: ["he", "en"],
    regions: ["IL", "PS", "LB"],
    bias: "OFFICIAL",
    tier: "PRIMARY",
    specialties: ["military_ops", "air_strikes", "ground_ops", "casualties"],
    knownAffiliations: ["Israel Defense Forces"],
    documentedWarnings: ["official_communications_layer", "strategic_communication"],
    warningSources: ["IDF Spokesperson Unit"],
  },
  {
    id: "UltraRadar",
    handle: "UltraRadar",
    url: "https://t.me/UltraRadar",
    name: "Ultra Radar",
    languages: ["en"],
    regions: ["IL", "PS", "LB", "SY", "IR"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "PRIMARY",
    specialties: ["airstrikes", "radar_tracks", "missile_alerts", "sirens", "iron_dome"],
    knownAffiliations: ["Independent OSINT"],
    documentedWarnings: [],
    warningSources: [],
  },
  {
    id: "swatter_jammer",
    handle: "swatter_jammer",
    url: "https://t.me/swatter_jammer",
    name: "Swatter/Jammer",
    languages: ["en"],
    regions: ["IL", "PS", "LB", "YE", "IR"],
    bias: "ANALYST",
    tier: "PRIMARY",
    specialties: ["drone_warfare", "electronic_warfare", "gps_jamming", "ew_analysis", "sigint"],
    knownAffiliations: ["Independent analyst", "EW community"],
    documentedWarnings: [],
    warningSources: [],
  },
  {
    id: "social_drone",
    handle: "social_drone",
    url: "https://t.me/social_drone",
    name: "Social Drone",
    languages: ["en", "uk", "he"],
    regions: ["UA", "IL", "PS"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "PRIMARY",
    specialties: ["drone_warfare", "fpv_drones", "loitering_munitions", "uav_intel"],
    knownAffiliations: ["Independent"],
    documentedWarnings: ["footage_not_always_verified"],
    warningSources: [],
  },
  {
    id: "rnintel",
    handle: "rnintel",
    url: "https://t.me/rnintel",
    name: "RN Intel",
    languages: ["en"],
    regions: ["IL", "PS", "LB", "SY", "IR", "YE"],
    bias: "ANALYST",
    tier: "PRIMARY",
    specialties: ["naval_intel", "air_power", "geopolitics", "middle_east", "iran"],
    knownAffiliations: ["Independent military analyst"],
    documentedWarnings: [],
    warningSources: [],
  },
  {
    id: "warriorsukrainian",
    handle: "warriorsukrainian",
    url: "https://t.me/warriorsukrainian",
    name: "Warriors of Ukraine",
    languages: ["uk", "en"],
    regions: ["UA", "RU"],
    bias: "PRO_UKRAINE",
    tier: "PRIMARY",
    specialties: ["ukraine_frontline", "russian_losses", "drone_footage", "ground_combat"],
    knownAffiliations: ["Pro-Ukraine"],
    documentedWarnings: ["PRO_UKRAINE_BIAS", "russian_losses_potentially_exaggerated"],
    warningSources: ["OSINT community analysis"],
  },
  {
    id: "wfwitness",
    handle: "wfwitness",
    url: "https://t.me/wfwitness",
    name: "War & Footage Witness",
    languages: ["en"],
    regions: ["UA", "IL", "PS", "SY", "ML"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "PRIMARY",
    specialties: ["footage_verification", "conflict_documentation", "geolocation"],
    knownAffiliations: ["Independent OSINT"],
    documentedWarnings: ["graphic_content", "footage_not_always_verified"],
    warningSources: [],
  },

  // ── SECONDARY SOURCES ─────────────────────────────────────────
  {
    id: "warmonitors",
    handle: "warmonitors",
    url: "https://t.me/warmonitors",
    name: "War Monitors",
    languages: ["en"],
    regions: ["GLOBAL"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "SECONDARY",
    cluster: "NEUTRAL_AGGREGATOR",
    specialties: ["global_conflicts", "aggregation", "verification", "cross_source"],
    knownAffiliations: ["Independent media monitoring"],
    documentedWarnings: ["aggregator_not_primary"],
    warningSources: [],
  },
  {
    id: "intelslava",
    handle: "intelslava",
    url: "https://t.me/intelslava",
    name: "Intel Slava",
    languages: ["ru", "en"],
    regions: ["UA", "RU", "GLOBAL"],
    bias: "PRO_RUSSIA",
    tier: "SECONDARY",
    cluster: "RUSSIAN_PROPAGANDA",
    specialties: ["russia_ukraine_war", "russian_military", "geopolitics"],
    knownAffiliations: ["Pro-Russian", "Allegedly MoD adjacent"],
    documentedWarnings: [
      "PRO_RUSSIA_CONFIRMED",
      "DISINFORMATION_DOCUMENTED",
      "VERIFY_ALL_CLAIMS",
    ],
    warningSources: [
      "OSINT for Ukraine 2025",
      "OpenMinds Ltd 2024",
      "Foreign Policy 2022",
    ],
  },
  {
    id: "DDGeopolitics",
    handle: "DDGeopolitics",
    url: "https://t.me/DDGeopolitics",
    name: "DD Geopolitics",
    languages: ["en"],
    regions: ["GLOBAL"],
    bias: "ANALYST",
    tier: "SECONDARY",
    cluster: "WESTERN_ANALYTICS",
    specialties: ["geopolitics", "strategic_analysis", "multi_front_conflicts", "economic_signals"],
    knownAffiliations: ["Independent geopolitical analysis"],
    documentedWarnings: [],
    warningSources: [],
  },
  {
    id: "iswnews_en",
    handle: "iswnews_en",
    url: "https://t.me/iswnews_en",
    name: "ISW — Institute for the Study of War",
    languages: ["en"],
    regions: ["UA", "RU", "IR", "SY", "IQ"],
    bias: "ANALYST",
    tier: "SECONDARY",
    cluster: "WESTERN_ANALYTICS",
    specialties: ["ukraine_war_analysis", "russia_oob", "iran_military", "threat_assessment"],
    knownAffiliations: ["Institute for the Study of War — Washington DC think-tank"],
    documentedWarnings: ["PRO_UKRAINE_FRAMING", "VERIFY_VIA_TERRAIN_SOURCES"],
    warningSources: ["ISW methodology paper"],
  },
  {
    id: "ClashReport",
    handle: "ClashReport",
    url: "https://t.me/ClashReport",
    name: "Clash Report",
    languages: ["en", "tr", "fr", "ar"],
    regions: ["GLOBAL"],
    bias: "AGGREGATOR",
    tier: "SECONDARY",
    cluster: "NEUTRAL_AGGREGATOR",
    specialties: ["global_conflict", "breaking_news", "middle_east", "ukraine"],
    knownAffiliations: ["Origine turque — multilingue"],
    documentedWarnings: ["AGGREGATOR_SPEED_RISK", "CROSS_VERIFY_BEFORE_USE"],
    warningSources: [],
  },
  {
    id: "MilitantWire",
    handle: "MilitantWire",
    url: "https://t.me/MilitantWire",
    name: "Militant Wire",
    languages: ["en"],
    regions: ["SY", "IQ", "UA", "AF", "GLOBAL"],
    bias: "ANALYST",
    tier: "SECONDARY",
    cluster: "WESTERN_ANALYTICS",
    specialties: ["militant_groups", "isis_tracking", "syria_ops", "armed_groups_oob"],
    knownAffiliations: ["Analytique occidental"],
    documentedWarnings: [],
    warningSources: [],
  },

  // ── IRAN/RESISTANCE AXIS ──────────────────────────────────────
  {
    id: "presstv",
    handle: "presstv",
    url: "https://t.me/presstv",
    name: "Press TV",
    languages: ["en", "fa"],
    regions: ["IR", "PS", "LB", "YE", "IQ"],
    bias: "PRO_IRAN",
    tier: "SECONDARY",
    cluster: "RESISTANCE_AXIS",
    declaredAffiliation: "Iranian State Media",
    specialties: ["iran_official", "resistance_axis", "anti_israel", "anti_us_narrative"],
    knownAffiliations: ["MÉDIA D'ÉTAT IRANIEN"],
    documentedWarnings: [
      "STATE_PROPAGANDA_IRAN",
      "DISINFORMATION_DOCUMENTED",
      "SANCTIONED_ENTITY_US_EU",
    ],
    warningSources: ["US Treasury Sanctions List", "EU DisinfoLab Report"],
  },
  {
    id: "QudsNen",
    handle: "QudsNen",
    url: "https://t.me/QudsNen",
    name: "Quds News Network",
    languages: ["ar", "en"],
    regions: ["PS", "LB", "IQ", "YE", "IR"],
    bias: "PRO_IRAN",
    tier: "SECONDARY",
    cluster: "RESISTANCE_AXIS",
    specialties: ["gaza", "west_bank", "hamas", "islamic_jihad", "resistance_operations"],
    knownAffiliations: ["Quds News Network — pro-Hamas/Islamic Jihad"],
    documentedWarnings: [
      "PRO_HAMAS",
      "STRATEGIC_NARRATIVE",
      "VERIFY_CASUALTY_FIGURES",
    ],
    warningSources: ["Media Bias/Fact Check"],
  },
  {
    id: "thecradlemedia",
    handle: "thecradlemedia",
    url: "https://t.me/thecradlemedia",
    name: "The Cradle",
    languages: ["en"],
    regions: ["IR", "IQ", "LB", "SY", "YE"],
    bias: "PRO_IRAN",
    tier: "SECONDARY",
    cluster: "RESISTANCE_AXIS",
    specialties: ["resistance_axis", "iran", "hezbollah", "houthis", "geopolitics"],
    knownAffiliations: ["Pro-Iran/Resistance axis"],
    documentedWarnings: ["PRO_IRAN_CONFIRMED", "STRATEGIC_NARRATIVE"],
    warningSources: [],
  },

  // ── PRO-RUSSIA NETWORK ────────────────────────────────────────
  {
    id: "Slavyangrad",
    handle: "Slavyangrad",
    url: "https://t.me/Slavyangrad",
    name: "Slavyangrad",
    languages: ["en", "es", "ru"],
    regions: ["UA", "RU", "BY"],
    bias: "PRO_RUSSIA",
    tier: "SECONDARY",
    cluster: "RUSSIAN_PROPAGANDA",
    specialties: ["ukraine_war_russian_pov", "frontline_russia", "nato_criticism", "slavic_unity"],
    knownAffiliations: ["Documented pro-Kremlin conduit"],
    documentedWarnings: [
      "PRO_RUSSIA_CONFIRMED",
      "DISINFORMATION_DOCUMENTED",
      "VERIFY_ALL_MILITARY_CLAIMS",
    ],
    warningSources: [
      "OSINT for Ukraine 2025",
      "OpenMinds Ltd 2024",
      "Foreign Policy 2022",
    ],
  },
  {
    id: "FiorellaInMoscow",
    handle: "FiorellaInMoscow",
    url: "https://t.me/FiorellaInMoscow",
    name: "Fiorella In Moscow",
    languages: ["en"],
    regions: ["RU", "UA", "GLOBAL"],
    bias: "PRO_RUSSIA",
    tier: "SECONDARY",
    cluster: "RUSSIAN_PROPAGANDA",
    specialties: ["russia_narrative", "ukraine_war_russia_pov", "nato_opposition", "multipolar_world"],
    knownAffiliations: ["Fiorella Isabel — journaliste américaine basée à Moscou"],
    documentedWarnings: [
      "PRO_RUSSIA_CONFIRMED",
      "DISINFORMATION_DOCUMENTED",
    ],
    warningSources: ["OpenMinds Ltd 2024"],
  },
  {
    id: "tass_es",
    handle: "tass_es",
    url: "https://t.me/tass_es",
    name: "TASS en Español",
    languages: ["es"],
    regions: ["RU", "GLOBAL"],
    bias: "PRO_RUSSIA",
    tier: "SECONDARY",
    cluster: "RUSSIAN_PROPAGANDA",
    declaredAffiliation: "Russian State Media",
    specialties: ["russia_official", "ukraine_war_russian_narrative", "kremlin_positions"],
    knownAffiliations: ["TASS — Agence d'état russe"],
    documentedWarnings: [
      "STATE_PROPAGANDA_RUSSIA",
      "SANCTIONED_ENTITY_EU_UK_US",
      "OFFICIAL_KREMLIN_NARRATIVE",
    ],
    warningSources: ["EU Sanctions List"],
  },

  // ── TERTIARY / AGGREGATORS ─────────────────────────────────────
  {
    id: "BellumActaNews",
    handle: "BellumActaNews",
    url: "https://t.me/BellumActaNews",
    name: "Bellum Acta",
    languages: ["en"],
    regions: ["UA", "IL", "PS", "SY"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "SECONDARY",
    specialties: ["conflict_news", "military_movements", "global_hotspots"],
    knownAffiliations: ["Independent"],
    documentedWarnings: ["aggregator_primary_ratio_low"],
    warningSources: [],
  },
  {
    id: "IranintlTV",
    handle: "IranintlTV",
    url: "https://t.me/IranintlTV",
    name: "Iran International TV",
    languages: ["fa", "en"],
    regions: ["IR", "IL", "IQ", "SY"],
    bias: "PRO_WEST",
    tier: "PRIMARY",
    specialties: ["iran", "irgc", "nuclear", "protests", "iran_military"],
    knownAffiliations: ["Iran International — Saudi-funded, editorially independent per claim"],
    documentedWarnings: ["anti_iranian_government_bias", "Saudi_funding_disclosed"],
    warningSources: [],
  },
  {
    id: "Farsi_Iranwire",
    handle: "Farsi_Iranwire",
    url: "https://t.me/Farsi_Iranwire",
    name: "IranWire (Farsi)",
    languages: ["fa"],
    regions: ["IR"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "PRIMARY",
    specialties: ["iran_internal", "human_rights", "protests", "irgc", "nuclear_program"],
    knownAffiliations: ["IranWire — independent investigative journalism"],
    documentedWarnings: ["farsi_only_requires_translation", "blocked_in_iran"],
    warningSources: [],
  },
  {
    id: "LebUpdate",
    handle: "LebUpdate",
    url: "https://t.me/LebUpdate",
    name: "Lebanon Update",
    languages: ["en", "ar"],
    regions: ["LB", "SY", "IL"],
    bias: "NEUTRAL_JOURNALIST",
    tier: "SECONDARY",
    specialties: ["lebanon", "hezbollah", "south_lebanon", "israel_lebanon_border"],
    knownAffiliations: ["Lebanese-based journalists"],
    documentedWarnings: ["sectarian_dynamics_possible"],
    warningSources: [],
  },
];

// ─── Helper Functions ────────────────────────────────────────────

export function getChannelById(id: string): ChannelMetadata | undefined {
  return MONITORED_CHANNELS_V4.find(c => c.id === id);
}

export function getChannelByHandle(handle: string): ChannelMetadata | undefined {
  return MONITORED_CHANNELS_V4.find(c => c.handle === handle);
}

export function getChannelsByRegion(region: string): ChannelMetadata[] {
  return MONITORED_CHANNELS_V4.filter(c => c.regions.includes(region));
}

export function getChannelsByCluster(cluster: NarrativeCluster): ChannelMetadata[] {
  return MONITORED_CHANNELS_V4.filter(c => c.cluster === cluster);
}

export function getChannelsWithWarning(warning: string): ChannelMetadata[] {
  return MONITORED_CHANNELS_V4.filter(c => c.documentedWarnings.includes(warning));
}

export const CHANNEL_COUNT = MONITORED_CHANNELS_V4.length;

// Re-export as NEXUS_CHANNELS_V4 for backward compatibility
export const NEXUS_CHANNELS_V4 = MONITORED_CHANNELS_V4;
