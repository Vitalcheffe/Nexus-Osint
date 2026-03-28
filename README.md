<p align="center">
  <img src="docs/banner.png" alt="NEXUS" width="100%" />
</p>

<h1 align="center">NEXUS</h1>
<p align="center">Real-time geospatial OSINT engine.<br/>35+ live sources. 92 Telegram channels. The globe is silent until it matters.</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/CesiumJS-1.139-6CADDF" />
  <img src="https://img.shields.io/badge/license-MPL--2.0-green" />
</p>

---

## Why

I follow ~90 Telegram channels — conflict zones, OSINT accounts, AIS trackers. One night my mom showed me a video of Khamenei supposedly killed in a bunker strike. Very convincing. Except the footage was filmed in a city with apartment buildings in the background. Nobody caught it because everyone was sharing, not looking.

The problem isn't finding information. It's knowing what's real.

## How it works

Every signal gets correlated before it surfaces. One signal is noise. Two is coincidence. Three independent sources confirming the same event in the same place within minutes? Probably real.

```
total = spatial×0.18 + temporal×0.16 + semantic×0.18
      + behavioral×0.14 + historical×0.14
      + source_diversity×0.12 + confidence×0.08
```

The globe is silent most of the time. When something appears, it means multiple independent systems agree.

## Sources

35+ feeds in parallel: GDELT, USGS earthquakes, ADSB.fi, GPSJam, NASA FIRMS, Sentinel SAR, Cloudflare Radar, Wikipedia edit velocity (yes — it gets edited fast when stuff happens), AIS ship tracking, UN ReliefWeb.

Most work with no API key. Free registrations unlock the rest.

## Telegram layer

92 channels. Each scored by:
- How often it's first to report something confirmed
- Whether it includes verifiable coordinates
- Historical track record on fabrication

State propaganda gets 15. An accurate hub with 3K followers gets 83.

Channels are clustered: Western Analytics, Neutral Aggregators, Spanish OSINT (surprisingly strong community), Data Visualization, and — for intellectual honesty — extremist accounts monitored with maximum credibility penalty.

## Text analysis

Grounded in published research, not vibes:
- **LDA topic modelling** — Mueller & Rauh, APSR 2018
- **Velocity penalty** — Vosoughi et al., MIT/Science 2018 (misinformation indicator)
- **Conflict calibration** — ViEWS, PRIO Oslo 2024
- **CUSUM anomaly detection** — statistical volume anomalies
- **CIB detection** — Harvard Shorenstein 2024 (coordinated inauthentic behavior)

## Dark web

Separate collector for Tor sources: 4chan /pol/, OSINT subreddits, Bellingcat mirrors, ransomware leak sites. Everything tagged `onion: true/false`.

## Run it

```bash
git clone https://github.com/Vitalcheffe/Nexus-Osint
cd nexus-platform
npm install
npm run dev
```

Most sources work immediately. No fake data — unconfigured sources stay silent.

## Notes

This is a research project. Some feeds break, some correlations are noisy. That's OSINT — it's messy by nature.

---

<p align="center">
  <sub>Amine Harch · 16 · Casablanca · <a href="https://vitalcheffe.github.io">vitalcheffe.github.io</a></sub>
</p>
