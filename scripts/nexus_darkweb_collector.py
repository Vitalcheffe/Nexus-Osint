#!/usr/bin/env python3
"""
NEXUS Dark Web & Deep Web Intelligence Collector
=================================================
Architecture: Tor SOCKS5 → requests_tor → Parser → Score LDA → POST /api/darkweb/ingest

Sources monitorées:
  CLEARNET
    - 4chan /pol/ /k/ /int/     — première heure sur les conflits, souvent avant les médias
    - Reddit r/worldnews etc.   — agrégation mondiale, modération légère
    - Hacker News               — cyber / tech incidents
    - Bellingcat forums         — OSINT communauté
    - Pastebin public           — leaks, dumps

  .ONION (via Tor)
    - DDoSecrets mirror         — leaks gouvernementaux (légal, journalisme)
    - The Intercept onion       — journalisme d'investigation
    - ProPublica onion          — journalisme d'investigation
    - SecureDrop mirrors        — whistleblowers
    - Ransomware leak sites     — détection proactive cyberattaques
    - Cybercrime forums publics — threat intelligence
    - Forums géopolitiques      — signaux bruts non filtrés

Dépendances:
    pip install requests[socks] stem beautifulsoup4 lxml httpx[socks] pysocks
    + Tor daemon installé (apt install tor / brew install tor)

Lancement:
    export NEXUS_API_URL=http://localhost:3000
    export TOR_SOCKS_PORT=9050          # défaut
    export TOR_CONTROL_PORT=9051        # défaut
    export TOR_CONTROL_PASSWORD=        # optionnel
    python3 scripts/nexus_darkweb_collector.py
"""

import os
import re
import json
import time
import random
import hashlib
import logging
import asyncio
import datetime
from typing import Optional, Any
from dataclasses import dataclass, asdict, field

import requests
from bs4 import BeautifulSoup

try:
    import stem
    from stem import Signal
    from stem.control import Controller
    HAS_STEM = True
except ImportError:
    HAS_STEM = False
    print("[WARN] stem not installed — no Tor circuit rotation (pip install stem)")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nexus.darkweb")

# ─── Config ──────────────────────────────────────────────────────────────────

NEXUS_API_URL     = os.getenv("NEXUS_API_URL", "http://localhost:3000")
TOR_SOCKS_PORT    = int(os.getenv("TOR_SOCKS_PORT", "9050"))
TOR_CONTROL_PORT  = int(os.getenv("TOR_CONTROL_PORT", "9051"))
TOR_CONTROL_PASS  = os.getenv("TOR_CONTROL_PASSWORD", "")
POLL_INTERVAL_MIN = int(os.getenv("DARKWEB_POLL_INTERVAL", "10"))   # minutes entre polls
USER_AGENT        = "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0"
REQUEST_TIMEOUT   = 30

# ─── Keyword scoring ─────────────────────────────────────────────────────────

HIGH_PRIORITY_KEYWORDS = [
    "airstrike", "frappe", "missile", "explosion", "attack", "attaque",
    "nuclear", "nucléaire", "chemical weapon", "arme chimique",
    "coup", "assassination", "assassinat",
    "cyber attack", "cyberattack", "ransomware", "breach", "leak", "fuite",
    "troops", "military operation", "opération militaire",
    "ceasefire", "cessez-le-feu", "ceasefire broken",
    "carrier group", "naval", "submarine", "sous-marin",
    "evacuate", "évacuation", "refugees", "réfugiés",
    "blackout", "power grid", "infrastructure strike",
    "IRGC", "IDF", "PLA", "NATO", "OTAN", "Wagner", "Hezbollah", "Hamas",
    "Houthi", "DPRK", "North Korea", "Corée du Nord",
]

MEDIUM_KEYWORDS = [
    "geopolitics", "conflict", "war", "guerre", "tensions",
    "sanctions", "embargo", "escalation",
    "intelligence", "OSINT", "intercept",
    "protest", "manifestation", "coup attempt",
    "election fraud", "vote", "militia",
]

LOCATION_KEYWORDS = {
    "Gaza":       (31.5,  34.45),  "Rafah":      (31.28, 34.24),
    "Ukraine":    (49.0,  32.0),   "Kyiv":       (50.45, 30.52),
    "Kharkiv":    (49.99, 36.23),  "Zaporizhzhia": (47.84, 35.12),
    "Russia":     (55.75, 37.62),  "Moscow":     (55.75, 37.62),
    "Iran":       (35.69, 51.39),  "Tehran":     (35.69, 51.39),
    "Israel":     (32.08, 34.78),  "Tel Aviv":   (32.08, 34.78),
    "Lebanon":    (33.89, 35.50),  "Beirut":     (33.88, 35.49),
    "Taiwan":     (25.03, 121.56), "Taipei":     (25.03, 121.56),
    "China":      (39.91, 116.39), "Beijing":    (39.91, 116.39),
    "North Korea":(39.01, 125.73), "Pyongyang":  (39.01, 125.73),
    "Yemen":      (15.35, 44.20),  "Hodeida":    (14.80, 42.95),
    "Sudan":      (15.60, 32.53),  "Khartoum":   (15.60, 32.53),
    "Mali":       (12.65, -8.00),  "Sahel":      (15.00, 2.00),
    "Syria":      (33.51, 36.29),  "Damascus":   (33.51, 36.29),
    "Red Sea":    (20.00, 38.00),  "Hormuz":     (26.50, 56.30),
    "Somalia":    (2.04,  45.34),  "Mogadishu":  (2.04,  45.34),
    "Pakistan":   (30.38, 69.35),  "Afghanistan":(33.93, 67.71),
    "Myanmar":    (19.74, 96.08),  "Ethiopia":   (9.15,  40.49),
}

def score_text(text: str) -> tuple[float, list[str], tuple[float, float]]:
    """Returns (confidence_score, matched_tags, (lat, lng))."""
    text_lower = text.lower()
    score = 0.0
    tags = []

    for kw in HIGH_PRIORITY_KEYWORDS:
        if kw.lower() in text_lower:
            score += 0.12
            tags.append(kw.replace(" ", "_"))

    for kw in MEDIUM_KEYWORDS:
        if kw.lower() in text_lower:
            score += 0.04
            tags.append(kw.replace(" ", "_"))

    score = min(0.97, score)

    lat, lng = 0.0, 0.0
    for location, coords in LOCATION_KEYWORDS.items():
        if location.lower() in text_lower:
            lat, lng = coords
            if location.lower() not in tags:
                tags.append(location.replace(" ", "_"))
            break

    return round(score, 3), list(set(tags))[:8], (lat, lng)

# ─── Signal dataclass ─────────────────────────────────────────────────────────

@dataclass
class DarkWebSignal:
    id: str
    source: str
    sourceName: str
    category: str
    lat: float
    lng: float
    country: str
    zone: str
    confidence: float
    title: str
    body: str
    tags: list[str]
    timestamp: str
    isAnomaly: bool
    onion: bool
    url: str
    rawData: dict = field(default_factory=dict)

    def uid(self) -> str:
        return hashlib.md5(f"{self.source}{self.title}".encode()).hexdigest()[:12]

# ─── Tor session ─────────────────────────────────────────────────────────────

def make_session(use_tor: bool = True) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "DNT": "1",
    })
    if use_tor:
        proxies = {
            "http":  f"socks5h://127.0.0.1:{TOR_SOCKS_PORT}",
            "https": f"socks5h://127.0.0.1:{TOR_SOCKS_PORT}",
        }
        session.proxies.update(proxies)
    return session

def rotate_tor_circuit():
    if not HAS_STEM:
        return
    try:
        with Controller.from_port(port=TOR_CONTROL_PORT) as ctrl:
            if TOR_CONTROL_PASS:
                ctrl.authenticate(password=TOR_CONTROL_PASS)
            else:
                ctrl.authenticate()
            ctrl.signal(Signal.NEWNYM)
            log.info("[TOR] New circuit requested")
            time.sleep(3)
    except Exception as e:
        log.warning(f"[TOR] Circuit rotation failed: {e}")

def check_tor(session: requests.Session) -> bool:
    try:
        r = session.get("https://check.torproject.org/api/ip", timeout=15)
        data = r.json()
        if data.get("IsTor"):
            log.info(f"[TOR] Connected — exit IP: {data.get('IP', '?')}")
            return True
        log.warning("[TOR] Not routing through Tor")
        return False
    except Exception as e:
        log.error(f"[TOR] Connection check failed: {e}")
        return False

# ─── Dedup cache ──────────────────────────────────────────────────────────────

_seen_ids: set[str] = set()
MAX_SEEN = 5000

def is_new(uid: str) -> bool:
    if uid in _seen_ids:
        return False
    _seen_ids.add(uid)
    if len(_seen_ids) > MAX_SEEN:
        oldest = list(_seen_ids)[:500]
        for o in oldest:
            _seen_ids.discard(o)
    return True

# ─── Post to NEXUS ────────────────────────────────────────────────────────────

def post_signal(signal: DarkWebSignal) -> bool:
    if not is_new(signal.uid()):
        return False
    try:
        payload = asdict(signal)
        r = requests.post(
            f"{NEXUS_API_URL}/api/darkweb/ingest",
            json=payload,
            timeout=5,
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 200:
            log.info(f"[NEXUS] → [{signal.source}] {signal.title[:60]} (conf: {signal.confidence})")
            return True
        return False
    except Exception as e:
        log.warning(f"[NEXUS] POST failed: {e}")
        return False

# ─── CLEARNET SCRAPERS ────────────────────────────────────────────────────────

# 4chan — /pol/, /k/, /int/ (premier sur les conflits, avant les médias)
FOURCHAN_BOARDS = ["pol", "k", "int", "news"]

def scrape_4chan(session: requests.Session) -> list[DarkWebSignal]:
    signals = []
    board = random.choice(FOURCHAN_BOARDS)
    try:
        url = f"https://a.4cdn.org/{board}/catalog.json"
        r = session.get(url, timeout=REQUEST_TIMEOUT)
        if not r.ok:
            return []
        pages = r.json()
        threads = []
        for page in pages[:3]:
            threads.extend(page.get("threads", []))

        for thread in sorted(threads, key=lambda t: t.get("replies", 0), reverse=True)[:20]:
            sub   = thread.get("sub", "") or ""
            com   = thread.get("com", "") or ""
            text  = BeautifulSoup(f"{sub} {com}", "html.parser").get_text(" ", strip=True)
            if len(text) < 30:
                continue

            score, tags, (lat, lng) = score_text(text)
            if score < 0.15:
                continue

            signals.append(DarkWebSignal(
                id=f"4chan_{board}_{thread.get('no', '')}",
                source=f"4chan_{board}",
                sourceName=f"4chan /{board}/",
                category="SOCIAL",
                lat=lat, lng=lng,
                country="XX",
                zone=next((t for t in tags if t in LOCATION_KEYWORDS), "Global"),
                confidence=min(0.55, score),
                title=text[:100],
                body=text[:300],
                tags=tags,
                timestamp=datetime.datetime.utcnow().isoformat() + "Z",
                isAnomaly=score >= 0.40,
                onion=False,
                url=f"https://boards.4chan.org/{board}/thread/{thread.get('no', '')}",
            ))
    except Exception as e:
        log.debug(f"[4chan] Error: {e}")
    return signals[:5]


# Reddit — r/worldnews, r/geopolitics, r/UkraineWarVideoReport, r/CombatFootage
REDDIT_SUBS = [
    "worldnews", "geopolitics", "UkraineWarVideoReport",
    "CombatFootage", "CredibleDefense", "WarCollage",
    "GlobalConflict", "ExplainOneWay",
]

def scrape_reddit(session: requests.Session) -> list[DarkWebSignal]:
    signals = []
    sub = random.choice(REDDIT_SUBS)
    try:
        url = f"https://www.reddit.com/r/{sub}/new.json?limit=25"
        r = session.get(url, timeout=REQUEST_TIMEOUT,
                        headers={"User-Agent": "nexus-intel-bot/1.0"})
        if not r.ok:
            return []
        posts = r.json().get("data", {}).get("children", [])
        for post in posts:
            d = post.get("data", {})
            title = d.get("title", "")
            selftext = d.get("selftext", "")
            text = f"{title} {selftext}"
            score_val = d.get("score", 0)
            if score_val < 10:
                continue

            conf_score, tags, (lat, lng) = score_text(text)
            if conf_score < 0.15:
                continue

            signals.append(DarkWebSignal(
                id=f"reddit_{d.get('id', '')}",
                source=f"reddit_{sub}",
                sourceName=f"Reddit r/{sub}",
                category="SOCIAL",
                lat=lat, lng=lng,
                country="XX",
                zone=next((t for t in tags if t in LOCATION_KEYWORDS), sub),
                confidence=min(0.70, conf_score + (min(score_val, 1000) / 10000)),
                title=title[:100],
                body=text[:300],
                tags=tags,
                timestamp=datetime.datetime.utcnow().isoformat() + "Z",
                isAnomaly=conf_score >= 0.40,
                onion=False,
                url=f"https://reddit.com{d.get('permalink', '')}",
            ))
    except Exception as e:
        log.debug(f"[Reddit] Error: {e}")
    return signals[:5]


# Hacker News — incidents cyber, tech
def scrape_hackernews(session: requests.Session) -> list[DarkWebSignal]:
    signals = []
    try:
        r = session.get("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=REQUEST_TIMEOUT)
        if not r.ok:
            return []
        ids = r.json()[:40]
        for item_id in random.sample(ids, min(10, len(ids))):
            try:
                ir = session.get(f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json", timeout=10)
                if not ir.ok:
                    continue
                item = ir.json()
                title = item.get("title", "")
                url_item = item.get("url", "")
                score_val = item.get("score", 0)
                if score_val < 50:
                    continue
                text = title
                conf_score, tags, (lat, lng) = score_text(text)
                if conf_score < 0.12:
                    continue
                signals.append(DarkWebSignal(
                    id=f"hn_{item_id}",
                    source="hackernews",
                    sourceName="Hacker News",
                    category="CYBER",
                    lat=lat, lng=lng,
                    country="XX",
                    zone="Global",
                    confidence=min(0.65, conf_score),
                    title=title[:100],
                    body=f"{title} — {url_item}",
                    tags=tags + ["hacker_news"],
                    timestamp=datetime.datetime.utcnow().isoformat() + "Z",
                    isAnomaly=conf_score >= 0.30,
                    onion=False,
                    url=url_item or f"https://news.ycombinator.com/item?id={item_id}",
                ))
                time.sleep(0.3)
            except:
                continue
    except Exception as e:
        log.debug(f"[HN] Error: {e}")
    return signals[:4]


# Pastebin — leaks publics récents
def scrape_pastebin(session: requests.Session) -> list[DarkWebSignal]:
    signals = []
    try:
        r = session.get("https://scrape.pastebin.com/api_scraping.php?limit=30",
                        timeout=REQUEST_TIMEOUT)
        if not r.ok:
            return []
        pastes = r.json()
        for paste in pastes:
            title = paste.get("title", "") or paste.get("key", "")
            size = int(paste.get("size", 0))
            if size < 100 or size > 500000:
                continue
            try:
                pr = session.get(f"https://scrape.pastebin.com/api_scrape_item.php?i={paste['key']}",
                                 timeout=10)
                if not pr.ok:
                    continue
                text = f"{title} {pr.text[:500]}"
                conf_score, tags, (lat, lng) = score_text(text)
                if conf_score < 0.20:
                    continue
                signals.append(DarkWebSignal(
                    id=f"pastebin_{paste['key']}",
                    source="pastebin",
                    sourceName="Pastebin",
                    category="CYBER",
                    lat=lat, lng=lng,
                    country="XX",
                    zone=next((t for t in tags if t in LOCATION_KEYWORDS), "Global"),
                    confidence=min(0.60, conf_score),
                    title=title[:80] or f"Paste {paste['key']}",
                    body=pr.text[:250],
                    tags=tags + ["paste", "leak"],
                    timestamp=datetime.datetime.utcnow().isoformat() + "Z",
                    isAnomaly=True,
                    onion=False,
                    url=f"https://pastebin.com/{paste['key']}",
                ))
                time.sleep(0.5)
            except:
                continue
    except Exception as e:
        log.debug(f"[Pastebin] Error: {e}")
    return signals[:3]


# ─── .ONION SCRAPERS (via Tor) ────────────────────────────────────────────────

# Sites .onion légitimes — journalisme d'investigation et leaks publics
ONION_SOURCES = [
    {
        "id": "ddosecrets",
        "name": "DDoSecrets",
        "url": "http://ddosecretspqkfxmehd4im63v7oihkx4ezrfdt4fnb3auh5t2ejxu2sqd.onion/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.82,
        "selector": "article h2, .title, h3",
    },
    {
        "id": "the_intercept",
        "name": "The Intercept",
        "url": "http://y6xjgkjgakixi4lt6sr3vfmhpkduvp64as2qlhejpqkrjb4y5bwbfuad.onion/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.78,
        "selector": "h2, .PostCard__title, article h2",
    },
    {
        "id": "propublica",
        "name": "ProPublica",
        "url": "https://www.propub3r6espa33w.onion/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.80,
        "selector": "h2, .article-title, .story-heading",
    },
    {
        "id": "nytimes_onion",
        "name": "NYT Onion",
        "url": "https://www.nytimesn7cgmftshazwhfgzm37qxb44r64ytbb2dj3x62d2lljsciiyd.onion/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.75,
        "selector": "h2, h3, .css-vsuiox",
    },
    {
        "id": "bbc_onion",
        "name": "BBC Onion",
        "url": "https://www.bbcweb3hytmzhn5d532owbu6oqadra5z3ar726vq5kgwwn6aucdccrad.onion/news/world",
        "category": "GROUND_TRUTH",
        "conf_base": 0.77,
        "selector": "h3, .gs-c-promo-heading__title",
    },
    {
        "id": "dw_onion",
        "name": "Deutsche Welle Onion",
        "url": "http://dwnewsgngmhlplxy6o2twtfgjnrnjxbegbwqx6wnotdhkzt562tszfid.onion/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.74,
        "selector": "h2, h3, .sc-title",
    },
    {
        "id": "rferl_onion",
        "name": "RFE/RL Onion",
        "url": "http://rferlo2zxoqbdz5vfjesowhptdovrqhfxivdqxndbnkwddqtkqahvhyd.onion/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.76,
        "selector": "h2, h3, .media-block__title",
    },
    {
        "id": "bellingcat_forum",
        "name": "Bellingcat Investigation",
        "url": "https://www.bellingcat.com/category/news/",
        "category": "GROUND_TRUTH",
        "conf_base": 0.84,
        "selector": "h2.entry-title, h3.entry-title, .l-grid__title",
        "onion": False,
    },
]

# Ransomware leak site monitoring — threat intelligence proactif
# Ces sites publient les données APRÈS les attaques pour pression sur les victimes
# Surveiller = protection, pas participation
RANSOMWARE_SITES = [
    {
        "id": "lockbit3_leak",
        "name": "LockBit 3.0 Leaks (monitor)",
        "url": "http://lockbit7z2jwcskxpbokpemdxmltipntwlkmidcll2qirbu7ykg46eyd.onion/",
        "category": "CYBER",
        "conf_base": 0.85,
        "selector": "div.post-title, h2, .victim",
    },
    {
        "id": "alphv_leak",
        "name": "ALPHV/BlackCat Leaks (monitor)",
        "url": "http://alphvmmm27o3abo3r2mlmjrpdmzle3rykajqc5xsj7j7ejksbpsa36ad.onion/",
        "category": "CYBER",
        "conf_base": 0.88,
        "selector": "div.company, h2, .post",
    },
    {
        "id": "clop_leak",
        "name": "CLOP Leaks (monitor)",
        "url": "http://santat7kpllt6iyvqbr7q4amdv6dzrh6paatvyrzl7ry3zm72zigf4ad.onion/",
        "category": "CYBER",
        "conf_base": 0.83,
        "selector": "h2, .company-name, .post-title",
    },
]

def scrape_onion_source(tor_session: requests.Session, source: dict) -> list[DarkWebSignal]:
    signals = []
    is_onion = source.get("onion", True)
    try:
        r = tor_session.get(source["url"], timeout=REQUEST_TIMEOUT)
        if not r.ok:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        elements = soup.select(source["selector"])
        for el in elements[:10]:
            text = el.get_text(" ", strip=True)
            if len(text) < 20:
                continue
            conf_score, tags, (lat, lng) = score_text(text)
            if conf_score < 0.05 and source["conf_base"] < 0.70:
                continue
            conf_final = min(0.96, source["conf_base"] + conf_score * 0.3)
            link_tag = el.find_parent("a") or el.find("a")
            article_url = source["url"]
            if link_tag and link_tag.get("href"):
                href = link_tag["href"]
                if href.startswith("/"):
                    base = source["url"].rstrip("/")
                    article_url = base + href
                elif href.startswith("http"):
                    article_url = href
            uid = hashlib.md5(f"{source['id']}{text}".encode()).hexdigest()[:12]
            signals.append(DarkWebSignal(
                id=f"{source['id']}_{uid}",
                source=source["id"],
                sourceName=source["name"],
                category=source["category"],
                lat=lat, lng=lng,
                country="XX",
                zone=next((t for t in tags if t in LOCATION_KEYWORDS), "Global"),
                confidence=conf_final,
                title=text[:100],
                body=text[:300],
                tags=tags + (["onion"] if is_onion else ["darkweb_clearnet"]),
                timestamp=datetime.datetime.utcnow().isoformat() + "Z",
                isAnomaly=conf_score >= 0.25,
                onion=is_onion,
                url=article_url,
            ))
    except Exception as e:
        log.debug(f"[{source['id']}] Error: {e}")
    return signals[:3]


def scrape_ransomware_sites(tor_session: requests.Session) -> list[DarkWebSignal]:
    signals = []
    site = random.choice(RANSOMWARE_SITES)
    try:
        r = tor_session.get(site["url"], timeout=REQUEST_TIMEOUT)
        if not r.ok:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        elements = soup.select(site["selector"])
        for el in elements[:5]:
            victim = el.get_text(" ", strip=True)
            if len(victim) < 5:
                continue
            text = f"RANSOMWARE VICTIM: {victim}"
            conf_score, tags, (lat, lng) = score_text(text)
            signals.append(DarkWebSignal(
                id=f"{site['id']}_{hashlib.md5(victim.encode()).hexdigest()[:8]}",
                source=site["id"],
                sourceName=site["name"],
                category="CYBER",
                lat=lat, lng=lng,
                country="XX",
                zone=next((t for t in tags if t in LOCATION_KEYWORDS), "Global"),
                confidence=site["conf_base"],
                title=f"[RANSOMWARE] {victim[:70]}",
                body=f"Victim listed on {site['name']} — potential data breach active",
                tags=["ransomware", "cyber", "leak", "threat_intel"] + tags,
                timestamp=datetime.datetime.utcnow().isoformat() + "Z",
                isAnomaly=True,
                onion=True,
                url=site["url"],
            ))
    except Exception as e:
        log.debug(f"[Ransomware-{site['id']}] Error: {e}")
    return signals[:3]


# ─── Main collection loop ─────────────────────────────────────────────────────

def collect_clearnet(session: requests.Session) -> list[DarkWebSignal]:
    all_signals = []
    collectors = [scrape_4chan, scrape_reddit, scrape_hackernews, scrape_pastebin]
    random.shuffle(collectors)
    for fn in collectors:
        try:
            sigs = fn(session)
            all_signals.extend(sigs)
            time.sleep(random.uniform(1.5, 4.0))
        except Exception as e:
            log.warning(f"[Clearnet] {fn.__name__} failed: {e}")
    return all_signals


def collect_darkweb(tor_session: requests.Session) -> list[DarkWebSignal]:
    all_signals = []
    sources = ONION_SOURCES.copy()
    random.shuffle(sources)
    for source in sources[:4]:
        try:
            sigs = scrape_onion_source(tor_session, source)
            all_signals.extend(sigs)
            time.sleep(random.uniform(3.0, 8.0))
        except Exception as e:
            log.warning(f"[Onion-{source['id']}] Failed: {e}")

    try:
        ransomware_sigs = scrape_ransomware_sites(tor_session)
        all_signals.extend(ransomware_sigs)
    except Exception as e:
        log.warning(f"[Ransomware] Failed: {e}")

    return all_signals


def run_collection_cycle(clear_session: requests.Session, tor_session: Optional[requests.Session]):
    log.info("=" * 60)
    log.info(f"Collection cycle — {datetime.datetime.utcnow().strftime('%H:%M:%S UTC')}")

    clearnet_sigs = collect_clearnet(clear_session)
    log.info(f"[Clearnet] {len(clearnet_sigs)} signals collected")

    darkweb_sigs = []
    if tor_session:
        darkweb_sigs = collect_darkweb(tor_session)
        log.info(f"[Darkweb] {len(darkweb_sigs)} signals collected")
    else:
        log.warning("[Darkweb] Tor not available — skipping .onion sources")

    all_sigs = clearnet_sigs + darkweb_sigs
    all_sigs.sort(key=lambda s: s.confidence, reverse=True)

    posted = 0
    for sig in all_sigs:
        if sig.confidence >= 0.12:
            if post_signal(sig):
                posted += 1
            time.sleep(0.1)

    log.info(f"[NEXUS] Posted {posted}/{len(all_sigs)} signals")

    if tor_session and random.random() < 0.3:
        rotate_tor_circuit()


def main():
    log.info("NEXUS Dark Web Collector starting...")
    log.info(f"  Target: {NEXUS_API_URL}/api/darkweb/ingest")
    log.info(f"  Tor SOCKS: 127.0.0.1:{TOR_SOCKS_PORT}")
    log.info(f"  Poll interval: {POLL_INTERVAL_MIN} min")

    clear_session = make_session(use_tor=False)

    tor_session = None
    try:
        tor_session = make_session(use_tor=True)
        if check_tor(tor_session):
            log.info("[TOR] Tor routing confirmed")
        else:
            log.warning("[TOR] Could not confirm Tor routing — check Tor daemon")
            tor_session = None
    except Exception as e:
        log.error(f"[TOR] Setup failed: {e}")
        log.warning("[TOR] Running clearnet only")

    cycle = 0
    while True:
        cycle += 1
        log.info(f"[CYCLE #{cycle}]")
        try:
            run_collection_cycle(clear_session, tor_session)
        except KeyboardInterrupt:
            log.info("Stopping...")
            break
        except Exception as e:
            log.error(f"Collection cycle error: {e}")

        sleep_s = POLL_INTERVAL_MIN * 60 + random.randint(-60, 60)
        log.info(f"[SLEEP] Next cycle in {sleep_s // 60}m {sleep_s % 60}s")
        try:
            time.sleep(sleep_s)
        except KeyboardInterrupt:
            log.info("Stopping...")
            break


if __name__ == "__main__":
    main()
