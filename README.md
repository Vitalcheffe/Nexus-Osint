# Nexus-OSINT

Real-time geospatial OSINT engine. Pulls from 35+ sources and clusters events so you can see what's actually happening.

## How it started

I used to watch Al Jazeera with my mom — she'd translate the Arabic. At the same time I'd be on Telegram pulling videos from OSINT channels and showing them to her in real time.

One night I showed her a video. 10 minutes later she showed me the same clip on Instagram. I had it 10 minutes before mainstream social media.

Then she showed me a video of Khamenei supposedly killed in a bunker strike. Very convincing. Except the footage was filmed in a city with apartment buildings visible in the background. Nobody caught it because everyone was sharing, not looking.

That's the real problem. Not finding info. Knowing what's real.

## How it works

Every signal gets correlated before it shows up on screen. One signal is noise. Two is a coincidence. Three independent sources confirming the same event within minutes? Probably real.

Scoring across 6 dimensions:
- Spatial (Haversine, drops to 0 beyond 500km)
- Temporal (full weight inside 3min, zero after 3h)
- Semantic (Jaccard + synonym expansion)
- Behavioral patterns
- Historical baseline
- Source diversity

The globe is silent most of the time. When something appears, it means multiple independent systems agree.

## Sources (35+)

GDELT, USGS, ADSB.fi, GPSJam, NASA FIRMS, Sentinel SAR, Cloudflare Radar, Wikipedia edit velocity (yes really — it gets edited fast when stuff happens), AIS ship tracking, and more.

92 Telegram channels with credibility scores based on how often they're first, how often they include coordinates, and their track record on fabricating stuff.

Everything goes through the same pipeline. No fake data, no placeholders — if a source isn't configured, it stays silent.

## Dark web

A separate collector handles Tor-accessible sources: 4chan /pol/, OSINT subreddits, Bellingcat mirrors, ransomware leak sites. SOCKS5 proxy, everything tagged `onion: true/false`.

## Text analysis

Grounded in actual research:
- LDA topic modelling (Mueller & Rauh, APSR 2018)
- Velocity penalty for misinformation (Vosoughi et al., MIT/Science 2018)
- Conflict escalation calibration (ViEWS, PRIO Oslo 2024)
- CUSUM anomaly detection
- Coordinated inauthentic behavior detection (Harvard Shorenstein 2024)

None of these are decorative. They're in the scoring pipeline.

## Run it

```bash
git clone https://github.com/Vitalcheffe/nexus-osint
cd nexus-platform
npm install
npm run dev
```

Most sources work without any API key. Optional keys unlock more data.

For Telegram:
```bash
pip install telethon httpx beautifulsoup4
python3 scripts/nexus_telegram_collector.py
```

For dark web:
```bash
tor &
python3 scripts/nexus_darkweb_collector.py
```

## Notes

This is a research project. It's not finished. Some feeds break, some correlations are noisy. That's OSINT — it's messy by nature.
