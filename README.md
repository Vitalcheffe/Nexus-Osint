# NEXUS

<p align="center">
  <b>Real-time geospatial OSINT engine.</b><br>
  <i>35+ live sources. 92 Telegram channels. The globe is silent until it matters.</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/CesiumJS-1.139-6CADDF" />
  <img src="https://img.shields.io/badge/license-MPL--2.0-green" />
</p>

---

Every signal gets correlated before it surfaces. One signal is noise. Two is coincidence. Three independent sources confirming the same event in the same place within minutes? Probably real.

---

## Why

I follow ~90 Telegram channels — conflict zones, OSINT accounts, AIS trackers. One night someone showed me a video of a leader supposedly killed in a strike. Very convincing. Except the footage was filmed in a city with apartment buildings in the background. Nobody caught it because everyone was sharing, not looking.

The problem isn't finding information. It's knowing what's real.

---

## How It Works

```
total = spatial*0.18 + temporal*0.16 + semantic*0.18
      + behavioral*0.14 + historical*0.14
      + source_diversity*0.12 + confidence*0.08
```

The globe is silent most of the time. When something appears, it means multiple independent systems agree.

---

## Sources

35+ feeds in parallel. Most work with no API key.

| Source | What It Tracks |
|--------|---------------|
| GDELT | Global event database |
| USGS | Earthquakes in real-time |
| ADSB.fi | Aircraft tracking |
| GPSJam | GPS interference |
| NASA FIRMS | Fires from space |
| Sentinel SAR | Satellite radar |
| Cloudflare Radar | Internet disruptions |
| Wikipedia | Edit velocity (fast edits = something happened) |
| AIS | Ship tracking |
| UN ReliefWeb | Humanitarian crises |

---

## Telegram Layer

92 channels. Each scored by:

- How often it's first to report something confirmed
- Whether it includes verifiable coordinates
- Historical track record on fabrication

State propaganda gets 15. An accurate hub with 3K followers gets 83.

Channels are clustered: Western Analytics, Neutral Aggregators, Spanish OSINT (surprisingly strong community), Data Visualization, and — for intellectual honesty — extremist accounts monitored with maximum credibility penalty.

---

## Text Analysis

Grounded in published research, not vibes:

- **LDA topic modelling** — Mueller & Rauh, APSR 2018
- **Velocity penalty** — Vosoughi et al., MIT/Science 2018 (misinformation indicator)
- **Conflict calibration** — ViEWS, PRIO Oslo 2024
- **CUSUM anomaly detection** — statistical volume anomalies
- **CIB detection** — Harvard Shorenstein 2024 (coordinated inauthentic behavior)

---

## Quick Start

```bash
git clone https://github.com/Vitalcheffe/Nexus-Osint.git
cd Nexus-Osint
npm install
cp .env.example .env.local
npm run dev
```

Open `localhost:3000` and watch the globe.

---

## Project Structure

```
src/
  app/              Next.js app router
  components/       Globe, panels, feeds
  lib/
    feeds/          35+ source connectors
    analysis/       Correlation engine
    telegram/       Channel scorer + parser
  config/           Source definitions
scripts/            Feed bootstrap + data seeding
```

---

## License

MPL-2.0
