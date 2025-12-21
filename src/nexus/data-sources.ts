/**
 * NEXUS Data Sources Master Catalog v4
 * ─────────────────────────────────────────────────────────────
 * 35+ sources d'intelligence open-source organisées par catégorie.
 * Chaque source définit : endpoint réel, auth, fréquence, poids,
 * parser, et comment l'intégrer dans le moteur de corrélation.
 *
 * FONDEMENT SCIENTIFIQUE:
 * Murphy et al. (Cambridge 2024): "La diversité des sources est le
 * facteur de prédiction le plus robuste — mieux qu'un seul canal
 * à haute précision."
 * → Notre dimension sourceDiv (0.12 weight) dans la formule 6D
 */

// ─── Types ────────────────────────────────────────────────────

export interface DataSourceConfig {
  id: string;
  name: string;
  category: SourceCategory;
  tier: 1 | 2 | 3;            // 1=temps réel, 2=<1h, 3=quotidien
  weight: number;              // 0-1 dans la corrélation 6D
  latencyMs: number;           // Latence typique
  free: boolean;
  envVar?: string;             // Variable d'environnement requise
  endpoint: string;            // URL de l'API
  refreshMs: number;           // Fréquence de polling en ms
  description: string;
  signalStrength: number;      // 0-1 : capacité à prédire les conflits
  geoCoverage: "GLOBAL" | "REGIONAL" | "LOCAL";
  dataType: "STRUCTURED" | "UNSTRUCTURED" | "STREAM" | "RASTER";
  setupMinutes: number;        // Temps de setup estimé
  docsUrl: string;
}

export type SourceCategory =
  | "AVIATION"        // ADS-B, NOTAM, FlightAware
  | "MARITIME"        // AIS, MarineTraffic
  | "SATELLITE"       // TLE, SAR, Optical
  | "SOCIAL"          // Telegram, Twitter, Reddit, TikTok
  | "GROUND_TRUTH"    // ACLED, GDELT, UN OCHA
  | "FINANCIAL"       // Markets, commodities, crypto
  | "GEOPHYSICAL"     // USGS, NOAA, NASA FIRMS
  | "ELECTRONIC"      // GPS Jam, SDR, SIGINT
  | "CYBER"           // Shodan, dark web
  | "VISUAL"          // Cameras, webcams, YouTube Live
  | "ABSENCE"         // Dark ships, ADS-B voids
  | "HUMAN"           // WikiEdit velocity, FastFood, Uber surge;

// ─── SOURCE CATALOG ───────────────────────────────────────────

export const NEXUS_SOURCES: DataSourceConfig[] = [

  // ════════════════════════════════════════════════════════════
  // AVIATION
  // ════════════════════════════════════════════════════════════
  {
    id: "adsb_opensky",
    name: "ADS-B OpenSky Network",
    category: "AVIATION",
    tier: 1,
    weight: 0.85,
    latencyMs: 5000,
    free: true,
    endpoint: "https://opensky-network.org/api/states/all",
    refreshMs: 15000,
    description: "Positions temps réel de tous les aéronefs civils + détection anomalies militaires",
    signalStrength: 0.82,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://opensky-network.org/apidoc/",
  },
  {
    id: "adsb_fi",
    name: "ADS-B Exchange (ADSB.fi)",
    category: "AVIATION",
    tier: 1,
    weight: 0.87,
    latencyMs: 2000,
    free: true,
    endpoint: "https://opendata.adsb.fi/api/v2/",
    refreshMs: 10000,
    description: "Feed non-filtré incluant avions militaires exclus par FlightRadar24",
    signalStrength: 0.90, // Meilleur que OpenSky pour le militaire
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://opendata.adsb.fi",
  },
  {
    id: "notam_faa",
    name: "NOTAM FAA + EUROCONTROL",
    category: "AVIATION",
    tier: 1,
    weight: 0.95,
    latencyMs: 60000,
    free: true,
    endpoint: "https://external-api.faa.gov/notamapi/v1/notams",
    refreshMs: 60000,
    description: "Fermetures d'espaces aériens — précurseur systématique de frappes",
    signalStrength: 0.96,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 5,
    docsUrl: "https://api.faa.gov/",
  },
  {
    id: "flightradar_hex",
    name: "HexDB Aircraft Database",
    category: "AVIATION",
    tier: 2,
    weight: 0.78,
    latencyMs: 0,
    free: true,
    endpoint: "https://hexdb.io/api/v1/aircraft/{hex}",
    refreshMs: 0, // On-demand
    description: "Identification type/propriétaire d'un aéronef par code ICAO hex",
    signalStrength: 0.70,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://hexdb.io",
  },

  // ════════════════════════════════════════════════════════════
  // MARITIME
  // ════════════════════════════════════════════════════════════
  {
    id: "ais_stream",
    name: "AISStream.io WebSocket",
    category: "MARITIME",
    tier: 1,
    weight: 0.82,
    latencyMs: 3000,
    free: true,
    envVar: "AISSTREAM_API_KEY",
    endpoint: "wss://stream.aisstream.io/v0/stream",
    refreshMs: 0, // Stream
    description: "Positions navires temps réel, détection dark ships (AIS off)",
    signalStrength: 0.80,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 5,
    docsUrl: "https://aisstream.io/documentation",
  },
  {
    id: "marine_traffic_incidents",
    name: "MarineTraffic Incidents (scrape)",
    category: "MARITIME",
    tier: 2,
    weight: 0.75,
    latencyMs: 300000,
    free: true,
    endpoint: "https://www.marinetraffic.com/en/reports/latest",
    refreshMs: 300000,
    description: "Rapports d'incidents maritimes publics — collision, attaque, naufrage",
    signalStrength: 0.72,
    geoCoverage: "GLOBAL",
    dataType: "UNSTRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://marinetraffic.com",
  },
  {
    id: "lloyd_intel",
    name: "Lloyd's MIB (Maritime Intel Bulletin)",
    category: "MARITIME",
    tier: 2,
    weight: 0.88,
    latencyMs: 3600000,
    free: false,
    endpoint: "https://www.lloyds.com/market-resources/market-intelligence",
    refreshMs: 3600000,
    description: "Bulletins de risque maritime — zones de guerre, piraterie",
    signalStrength: 0.85,
    geoCoverage: "GLOBAL",
    dataType: "UNSTRUCTURED",
    setupMinutes: 60,
    docsUrl: "https://www.lloyds.com",
  },

  // ════════════════════════════════════════════════════════════
  // SATELLITE
  // ════════════════════════════════════════════════════════════
  {
    id: "celestrak_tle",
    name: "CelesTrak TLE Satellites",
    category: "SATELLITE",
    tier: 2,
    weight: 0.90,
    latencyMs: 3600000,
    free: true,
    endpoint: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON",
    refreshMs: 3600000,
    description: "Éléments orbitaux de tous satellites actifs — prédiction survolage zones conflits",
    signalStrength: 0.75,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://celestrak.org/NORAD/documentation/gp-data-formats.php",
  },
  {
    id: "sentinel_hub",
    name: "Sentinel Hub Copernicus (ESA)",
    category: "SATELLITE",
    tier: 2,
    weight: 0.88,
    latencyMs: 86400000,
    free: true,
    envVar: "SENTINEL_HUB_INSTANCE_ID",
    endpoint: "https://services.sentinel-hub.com/api/v1/process",
    refreshMs: 86400000, // Passage satellites ~1/jour
    description: "Sentinel-1 SAR + Sentinel-2 optique — détection dommages ETH CSS methodology",
    signalStrength: 0.88, // ETH Zurich CSS 2024
    geoCoverage: "GLOBAL",
    dataType: "RASTER",
    setupMinutes: 30,
    docsUrl: "https://docs.sentinel-hub.com",
  },
  {
    id: "nasa_firms",
    name: "NASA FIRMS (Fire Information)",
    category: "SATELLITE",
    tier: 2,
    weight: 0.85,
    latencyMs: 10800000,
    free: true,
    envVar: "NASA_FIRMS_MAP_KEY",
    endpoint: "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/VIIRS_NOAA20_NRT/{bbox}/1",
    refreshMs: 3600000,
    description: "Points thermiques actifs VIIRS — incendies de guerre vs wildfires",
    signalStrength: 0.80,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 5,
    docsUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
  },
  {
    id: "nasa_blackmarble",
    name: "NASA Black Marble (Night Lights)",
    category: "SATELLITE",
    tier: 3,
    weight: 0.82,
    latencyMs: 86400000,
    free: true,
    endpoint: "https://ladsweb.modaps.eosdis.nasa.gov/api/v2/content/archives/VIIRS_DNB_At_Sensor_L1B",
    refreshMs: 86400000,
    description: "Lumières nocturnes VIIRS — détection blackouts, déplacements de population",
    signalStrength: 0.78,
    geoCoverage: "GLOBAL",
    dataType: "RASTER",
    setupMinutes: 20,
    docsUrl: "https://blackmarble.gsfc.nasa.gov/",
  },

  // ════════════════════════════════════════════════════════════
  // GROUND TRUTH (ACLED, GDELT, UN OCHA, RELIEFWEB)
  // ════════════════════════════════════════════════════════════
  {
    id: "acled",
    name: "ACLED — Armed Conflict Location & Event",
    category: "GROUND_TRUTH",
    tier: 2,
    weight: 0.92,
    latencyMs: 86400000,
    free: true,
    envVar: "ACLED_API_KEY",
    endpoint: "https://api.acleddata.com/acled/read/?key={KEY}&email={EMAIL}&limit=500&event_date={DATE}&event_date_where=BETWEEN",
    refreshMs: 3600000,
    description: "Événements de conflit armé géocodés — base de vérité terrain. Murphy et al. 2024: meilleur dataset pour ML conflict forecasting",
    signalStrength: 0.94,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 10,
    docsUrl: "https://acleddata.com/resources/general-guides/",
  },
  {
    id: "gdelt",
    name: "GDELT 2.0 (15-minute updates)",
    category: "GROUND_TRUTH",
    tier: 1,
    weight: 0.72,
    latencyMs: 900000,
    free: true,
    endpoint: "https://api.gdeltproject.org/api/v2/doc/doc?query={QUERY}&mode=artlist&maxrecords=25&format=json",
    refreshMs: 900000, // 15 minutes
    description: "Milliards de points CAMEO — surveillance médias mondiaux. 15min update. Murphy 2024: 'GDELT met à jour toutes les 15 minutes'",
    signalStrength: 0.68, // Haute quantité, erreurs classification
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://blog.gdeltproject.org/gdelt-2-0-our-global-world-in-realtime/",
  },
  {
    id: "gdelt_gkg",
    name: "GDELT GKG (Global Knowledge Graph)",
    category: "GROUND_TRUTH",
    tier: 1,
    weight: 0.70,
    latencyMs: 900000,
    free: true,
    endpoint: "https://api.gdeltproject.org/api/v2/summary/summary?d=web&t=summary&k={KEYWORDS}&timespan=24h&format=json",
    refreshMs: 900000,
    description: "Graphe de connaissances global — acteurs, thèmes, tons, organisations",
    signalStrength: 0.65,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://www.gdeltproject.org/data.html#rawdatafiles",
  },
  {
    id: "unocha_reliefweb",
    name: "UN OCHA ReliefWeb API",
    category: "GROUND_TRUTH",
    tier: 2,
    weight: 0.80,
    latencyMs: 3600000,
    free: true,
    endpoint: "https://api.reliefweb.int/v1/reports?appname=nexus&query[value]={QUERY}&limit=10&fields[include][]=date&fields[include][]=body",
    refreshMs: 3600000,
    description: "Rapports humanitaires officiels ONU — indicateur de crise humanitaire et conflit",
    signalStrength: 0.78,
    geoCoverage: "GLOBAL",
    dataType: "UNSTRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://reliefweb.int/help/api",
  },
  {
    id: "unosat",
    name: "UNOSAT Satellite Analysis",
    category: "GROUND_TRUTH",
    tier: 3,
    weight: 0.91,
    latencyMs: 86400000,
    free: true,
    endpoint: "https://data.humdata.org/organization/unosat",
    refreshMs: 86400000,
    description: "Analyse satellite dommages de guerre — Gaza, Ukraine, Syrie. Données GeoJSON publiques",
    signalStrength: 0.90,
    geoCoverage: "REGIONAL",
    dataType: "RASTER",
    setupMinutes: 5,
    docsUrl: "https://unosat.org/products/",
  },
  {
    id: "icrc_ihl",
    name: "ICRC IHL Watch Alerts",
    category: "GROUND_TRUTH",
    tier: 3,
    weight: 0.82,
    latencyMs: 86400000,
    free: true,
    endpoint: "https://www.icrc.org/en/sitemap.xml", // + RSS alerts
    refreshMs: 86400000,
    description: "Alertes violations droit international humanitaire — Comité International Croix Rouge",
    signalStrength: 0.80,
    geoCoverage: "GLOBAL",
    dataType: "UNSTRUCTURED",
    setupMinutes: 10,
    docsUrl: "https://www.icrc.org/en/data-protection-humanitarian-action",
  },
  {
    id: "views_prio",
    name: "ViEWS — Violence Early Warning System (PRIO Oslo)",
    category: "GROUND_TRUTH",
    tier: 3,
    weight: 0.90,
    latencyMs: 86400000,
    free: true,
    endpoint: "https://viewsforecasting.org/api/forecasts/cm/monthly/",
    refreshMs: 86400000 * 30, // Mensuel
    description: "Prévisions violence mensuelle par pays. AUC 0.87. Benchmark de référence mondiale (Murphy 2024)",
    signalStrength: 0.87,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 15,
    docsUrl: "https://viewsforecasting.org/",
  },
  {
    id: "conflict_forecast",
    name: "ConflictForecast.org (Mueller & Rauh LDA)",
    category: "GROUND_TRUTH",
    tier: 3,
    weight: 0.88,
    latencyMs: 86400000 * 7,
    free: true,
    endpoint: "https://conflictforecast.org/api/predictions",
    refreshMs: 86400000 * 7, // Hebdomadaire
    description: "Prédictions LDA issues de Mueller & Rauh APSR 2018 — 700k articles de presse traités",
    signalStrength: 0.85,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 10,
    docsUrl: "https://conflictforecast.org",
  },

  // ════════════════════════════════════════════════════════════
  // FINANCIAL
  // ════════════════════════════════════════════════════════════
  {
    id: "yahoo_finance",
    name: "Yahoo Finance (yfinance)",
    category: "FINANCIAL",
    tier: 1,
    weight: 0.72,
    latencyMs: 60000,
    free: true,
    endpoint: "https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?interval=1m&range=1d",
    refreshMs: 60000,
    description: "Prix temps réel: Brent, Or, Défense (LMT/RTX/NOC), BDI, Blé, BTC — anomalies = signal pré-crise",
    signalStrength: 0.65,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://pypi.org/project/yfinance/",
  },
  {
    id: "quandl_commodities",
    name: "FRED / St. Louis Fed",
    category: "FINANCIAL",
    tier: 2,
    weight: 0.68,
    latencyMs: 86400000,
    free: true,
    envVar: "FRED_API_KEY",
    endpoint: "https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json&limit=30",
    refreshMs: 86400000,
    description: "Données macro-économiques (prix pétrole, or, taux changes) — Fed St. Louis",
    signalStrength: 0.60,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 5,
    docsUrl: "https://fred.stlouisfed.org/docs/api/fred/",
  },

  // ════════════════════════════════════════════════════════════
  // GEOPHYSICAL (USGS, NOAA, Volcan)
  // ════════════════════════════════════════════════════════════
  {
    id: "usgs_seismic",
    name: "USGS Earthquake Catalog",
    category: "GEOPHYSICAL",
    tier: 1,
    weight: 0.90,
    latencyMs: 30000,
    free: true,
    endpoint: "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=50&orderby=time",
    refreshMs: 30000,
    description: "Séismes M4.5+ temps réel — différentiation naturel/nucléaire souterrain (profondeur, forme onde)",
    signalStrength: 0.60,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://earthquake.usgs.gov/fdsnws/event/1/",
  },
  {
    id: "noaa_weather_alerts",
    name: "NOAA / WMO Severe Weather Alerts",
    category: "GEOPHYSICAL",
    tier: 1,
    weight: 0.70,
    latencyMs: 60000,
    free: true,
    endpoint: "https://api.weather.gov/alerts/active?status=actual&message_type=alert&severity=Severe",
    refreshMs: 60000,
    description: "Alertes météo sévères — contexte pour opérations militaires, cyclones, inondations",
    signalStrength: 0.50,
    geoCoverage: "REGIONAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://www.weather.gov/documentation/services-web-api",
  },
  {
    id: "gfz_geomagnetic",
    name: "GFZ Potsdam — Geomagnetic Index Kp",
    category: "GEOPHYSICAL",
    tier: 2,
    weight: 0.60,
    latencyMs: 3600000,
    free: true,
    endpoint: "https://kp.gfz-potsdam.de/app/json/?start={DATE}T00%3A00Z&end={DATE}T23%3A59Z&index=Kp",
    refreshMs: 3600000,
    description: "Indice Kp géomagnétique — tempêtes solaires affectent GPS, communications satellites, réseaux électriques",
    signalStrength: 0.45,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://kp.gfz-potsdam.de/",
  },
  {
    id: "smithsonian_volcan",
    name: "Smithsonian GVP — Volcanic Activity",
    category: "GEOPHYSICAL",
    tier: 3,
    weight: 0.55,
    latencyMs: 86400000,
    free: true,
    endpoint: "https://volcano.si.edu/volcanoes/data/weekly_report.json",
    refreshMs: 86400000 * 7,
    description: "Rapports d'activité volcanique — SIGMET aviation + disruptions humanitaires",
    signalStrength: 0.45,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://volcano.si.edu/",
  },

  // ════════════════════════════════════════════════════════════
  // ELECTRONIC / SIGINT
  // ════════════════════════════════════════════════════════════
  {
    id: "gpsjam",
    name: "GPSJam.org (ADS-B derived)",
    category: "ELECTRONIC",
    tier: 1,
    weight: 0.88,
    latencyMs: 300000,
    free: true,
    endpoint: "https://gpsjam.org/data/{DATE}.json",
    refreshMs: 300000,
    description: "Cartographie brouillage GPS dérivée ADS-B — indique warfare électronique active",
    signalStrength: 0.88,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://gpsjam.org/",
  },
  {
    id: "websdr",
    name: "WebSDR / KiwiSDR Network",
    category: "ELECTRONIC",
    tier: 1,
    weight: 0.65,
    latencyMs: 0,
    free: true,
    endpoint: "https://www.websdr.org/",
    refreshMs: 0, // Stream audio
    description: "400+ récepteurs SDR publics mondiaux — écoute fréquences radio, détection activité militaire anormale",
    signalStrength: 0.70,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 5,
    docsUrl: "https://www.websdr.org/howto.html",
  },
  {
    id: "sdr_ism",
    name: "RTL-SDR Community Reports",
    category: "ELECTRONIC",
    tier: 2,
    weight: 0.60,
    latencyMs: 3600000,
    free: true,
    endpoint: "https://www.rtl-sdr.com/feed/",
    refreshMs: 3600000,
    description: "Communauté SDR — rapports d'activité radio inhabituelle, signaux EW détectés",
    signalStrength: 0.58,
    geoCoverage: "REGIONAL",
    dataType: "UNSTRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://www.rtl-sdr.com",
  },

  // ════════════════════════════════════════════════════════════
  // CYBER
  // ════════════════════════════════════════════════════════════
  {
    id: "shodan_stream",
    name: "Shodan Monitor (Stream API)",
    category: "CYBER",
    tier: 1,
    weight: 0.72,
    latencyMs: 0,
    free: false,
    envVar: "SHODAN_API_KEY",
    endpoint: "https://stream.shodan.io/shodan/banners?key={KEY}",
    refreshMs: 0, // Stream
    description: "Banners d'appareils exposés — détection nouveaux serveurs militaires, ICS vulnérables pré-opération",
    signalStrength: 0.65,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 30,
    docsUrl: "https://developer.shodan.io/api/stream",
  },
  {
    id: "netblocks",
    name: "NetBlocks — Internet Shutdown Monitor",
    category: "CYBER",
    tier: 2,
    weight: 0.85,
    latencyMs: 300000,
    free: true,
    endpoint: "https://netblocks.org/api/reports",
    refreshMs: 300000,
    description: "Coupures Internet nationales — indicateur de coup d'État, répression, opération militaire",
    signalStrength: 0.88,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://netblocks.org/",
  },
  {
    id: "cloudflare_radar",
    name: "Cloudflare Radar API",
    category: "CYBER",
    tier: 1,
    weight: 0.82,
    latencyMs: 60000,
    free: true,
    envVar: "CLOUDFLARE_RADAR_TOKEN",
    endpoint: "https://api.cloudflare.com/client/v4/radar/attacks/layer3/timeseries_groups?format=json",
    refreshMs: 60000,
    description: "Traffic Internet global + DDoS temps réel — blackouts réseau = indicateur de crise",
    signalStrength: 0.78,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 10,
    docsUrl: "https://developers.cloudflare.com/radar/",
  },

  // ════════════════════════════════════════════════════════════
  // SOCIAL
  // ════════════════════════════════════════════════════════════
  {
    id: "telegram_telethon",
    name: "Telegram (Telethon — 90+ canaux)",
    category: "SOCIAL",
    tier: 1,
    weight: 0.78,
    latencyMs: 5000,
    free: true,
    envVar: "TELEGRAM_API_ID",
    endpoint: "wss://api.telegram.org/",
    refreshMs: 0, // Stream
    description: "90+ canaux OSINT scorés (v3+v4) — scoring 6D LDA + CIB + Vosoughi velocity",
    signalStrength: 0.82,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 15,
    docsUrl: "https://docs.telethon.dev/",
  },
  {
    id: "twitter_firehose",
    name: "Twitter/X API v2 (Filtered Stream)",
    category: "SOCIAL",
    tier: 1,
    weight: 0.65,
    latencyMs: 30000,
    free: false,
    envVar: "TWITTER_BEARER_TOKEN",
    endpoint: "https://api.twitter.com/2/tweets/search/stream",
    refreshMs: 0, // Stream
    description: "Filtered stream sur keywords conflits — MIT Vosoughi: détection vitesse propagation fake news",
    signalStrength: 0.62,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 30,
    docsUrl: "https://developer.twitter.com/en/docs/twitter-api/tweets/filtered-stream/",
  },
  {
    id: "reddit_pushshift",
    name: "Reddit API (PushShift) + RSS",
    category: "SOCIAL",
    tier: 1,
    weight: 0.55,
    latencyMs: 60000,
    free: true,
    endpoint: "https://www.reddit.com/r/{SUBREDDIT}/new.json?limit=25",
    refreshMs: 60000,
    description: "Subreddits: r/worldnews r/ukraine r/middleeast r/geopolitics — early signal civilian reporting",
    signalStrength: 0.58,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 5,
    docsUrl: "https://www.reddit.com/dev/api/",
  },
  {
    id: "wikipedia_edits",
    name: "Wikipedia Recent Changes Stream",
    category: "HUMAN",
    tier: 1,
    weight: 0.72,
    latencyMs: 1000,
    free: true,
    endpoint: "https://stream.wikimedia.org/v2/stream/recentchange",
    refreshMs: 0, // SSE Stream
    description: "Vélocité d'éditions d'articles = précurseur d'événements. Pic d'éditions 'Beyrouth' = signal -20min",
    signalStrength: 0.75,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 0,
    docsUrl: "https://wikitech.wikimedia.org/wiki/Event_Platform/EventStreams",
  },

  // ════════════════════════════════════════════════════════════
  // VISUAL
  // ════════════════════════════════════════════════════════════
  {
    id: "youtube_live",
    name: "YouTube Live Search (Data API)",
    category: "VISUAL",
    tier: 1,
    weight: 0.70,
    latencyMs: 60000,
    free: true,
    envVar: "YOUTUBE_API_KEY",
    endpoint: "https://www.googleapis.com/youtube/v3/search?part=snippet&eventType=live&type=video&q={QUERY}&key={KEY}",
    refreshMs: 60000,
    description: "Streams live sur zones conflits — confirmation visuelle temps réel",
    signalStrength: 0.72,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 10,
    docsUrl: "https://developers.google.com/youtube/v3/",
  },
  {
    id: "traffic_cameras",
    name: "DOT / TfL Traffic Cameras",
    category: "VISUAL",
    tier: 1,
    weight: 0.75,
    latencyMs: 30000,
    free: true,
    endpoint: "https://api.tfl.gov.uk/place?type=JamCam&app_key={KEY}",
    refreshMs: 30000,
    description: "Caméras trafic publiques (NYC DOT, TfL London) — détection foules, fumée, anomalies visuelles",
    signalStrength: 0.68,
    geoCoverage: "LOCAL",
    dataType: "STREAM",
    setupMinutes: 5,
    docsUrl: "https://api.tfl.gov.uk/",
  },

  // ════════════════════════════════════════════════════════════
  // HUMAN INTELLIGENCE (HUMINT proxies)
  // ════════════════════════════════════════════════════════════
  {
    id: "fastfood_surge",
    name: "Pentagon Fast-Food Surge (Grubhub API)",
    category: "HUMAN",
    tier: 3,
    weight: 0.45,
    latencyMs: 3600000,
    free: false,
    endpoint: "https://api.grubhub.com/restaurant/search?locationId={PENTAGON_ID}",
    refreshMs: 3600000,
    description: "Pic de commandes fast-food Pentagon 23h-5h = préparation d'opération. Signal précurseur documenté.",
    signalStrength: 0.55,
    geoCoverage: "LOCAL",
    dataType: "STRUCTURED",
    setupMinutes: 120,
    docsUrl: "https://developer.grubhub.com",
  },
  {
    id: "uber_surge_dc",
    name: "Ride-Share Surge (Washington D.C.)",
    category: "HUMAN",
    tier: 3,
    weight: 0.42,
    latencyMs: 300000,
    free: false,
    endpoint: "https://api.uber.com/v1.2/estimates/price?start_latitude=38.869&start_longitude=-77.056", // Pentagon
    refreshMs: 300000,
    description: "Surge pricing déplacements Pentagon/State Dept. en dehors des heures normales = activité anormale",
    signalStrength: 0.50,
    geoCoverage: "LOCAL",
    dataType: "STRUCTURED",
    setupMinutes: 60,
    docsUrl: "https://developer.uber.com",
  },
  {
    id: "flightstats_chartered",
    name: "Private Jets + Charter Flights",
    category: "AVIATION",
    tier: 2,
    weight: 0.78,
    latencyMs: 60000,
    free: true,
    endpoint: "https://opendata.adsb.fi/api/v2/",
    refreshMs: 60000,
    description: "Décollages anormaux jets privés oligarques/officiels = fuite de capitaux, évacuation VIP pré-crise",
    signalStrength: 0.72,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://opendata.adsb.fi",
  },

  // ════════════════════════════════════════════════════════════
  // ABSENCE SIGNALS
  // ════════════════════════════════════════════════════════════
  {
    id: "absence_ads_b",
    name: "ADS-B Void Detector",
    category: "ABSENCE",
    tier: 1,
    weight: 0.92,
    latencyMs: 300000,
    free: true,
    endpoint: "https://opensky-network.org/api/states/all",
    refreshMs: 300000,
    description: "Zones de silence ADS-B = espace aérien fermé pour opération militaire. Signal précurseur fort.",
    signalStrength: 0.94,
    geoCoverage: "GLOBAL",
    dataType: "STRUCTURED",
    setupMinutes: 0,
    docsUrl: "https://opensky-network.org/apidoc/",
  },
  {
    id: "absence_ais",
    name: "Dark Ship Detector (AIS Off)",
    category: "ABSENCE",
    tier: 1,
    weight: 0.88,
    latencyMs: 1800000,
    free: true,
    endpoint: "wss://stream.aisstream.io/v0/stream",
    refreshMs: 0,
    description: "Navires qui éteignent leur transpondeur AIS = contournement sanctions, attaque imminente, trafic illicite",
    signalStrength: 0.88,
    geoCoverage: "GLOBAL",
    dataType: "STREAM",
    setupMinutes: 5,
    docsUrl: "https://aisstream.io",
  },
];

// ─── Source lookup helpers ────────────────────────────────────

export function getSourceById(id: string): DataSourceConfig | undefined {
  return NEXUS_SOURCES.find(s => s.id === id);
}

export function getSourcesByCategory(cat: SourceCategory): DataSourceConfig[] {
  return NEXUS_SOURCES.filter(s => s.category === cat);
}

export function getHighSignalSources(minStrength = 0.80): DataSourceConfig[] {
  return NEXUS_SOURCES.filter(s => s.signalStrength >= minStrength)
    .sort((a, b) => b.signalStrength - a.signalStrength);
}

export function getFreeSources(): DataSourceConfig[] {
  return NEXUS_SOURCES.filter(s => s.free);
}

export const SOURCE_COUNT = NEXUS_SOURCES.length;

export const CATEGORY_STATS = Object.fromEntries(
  (["AVIATION","MARITIME","SATELLITE","SOCIAL","GROUND_TRUTH","FINANCIAL",
    "GEOPHYSICAL","ELECTRONIC","CYBER","VISUAL","HUMAN","ABSENCE"] as SourceCategory[])
    .map(cat => [cat, NEXUS_SOURCES.filter(s => s.category === cat).length])
);

// ─── Setup priority (minimal working config) ──────────────────

export const QUICK_START_SOURCES = NEXUS_SOURCES.filter(s => s.free && s.setupMinutes <= 5);
export const ZERO_CONFIG_SOURCES = NEXUS_SOURCES.filter(s => s.free && !s.envVar);
