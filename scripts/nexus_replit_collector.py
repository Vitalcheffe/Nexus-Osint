#!/usr/bin/env python3
"""
NEXUS Replit Collector
======================
Version optimisée pour Replit Always-On (gratuit).

Ce script tourne EN PARALLÈLE du serveur Next.js sur Render.
Il collecte les signaux dark web + clearnet et les envoie
vers ton instance Render via /api/darkweb/ingest.

Setup Replit:
1. Va sur replit.com → Create Repl → Python
2. Copie ce fichier entier dans main.py
3. Dans Secrets (🔒), ajoute:
   NEXUS_API_URL = https://ton-app.onrender.com
4. Dans Shell: pip install requests beautifulsoup4
5. Run → Active "Always On" (gratuit avec compte Replit)

Variables d'environnement:
  NEXUS_API_URL   — URL de ton app Render (obligatoire)
  POLL_MINUTES    — Intervalle entre cycles (défaut: 8)
"""

import os
import re
import json
import time
import random
import hashlib
import logging
import datetime
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

import requests
from bs4 import BeautifulSoup

# ─── Logging ──────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nexus.replit")

# ─── Config ───────────────────────────────────────────────────

NEXUS_API_URL  = os.getenv("NEXUS_API_URL", "https://nexus-platform.onrender.com")
POLL_MINUTES   = int(os.getenv("POLL_MINUTES", "8"))
USER_AGENT     = "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0"
TIMEOUT        = 20

# ─── Keep-alive HTTP server (pour Replit Always-On) ───────────

class KeepAliveHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"NEXUS collector alive")
    def log_message(self, *args):
        pass

def start_keepalive_server():
    port = int(os.getenv("PORT", "8080"))
    server = HTTPServer(("0.0.0.0", port), KeepAliveHandler)
    log.info(f"Keep-alive server on port {port}")
    server.serve_forever()

# ─── Keyword scoring ──────────────────────────────────────────

HIGH_KW = [
    "airstrike", "frappe", "missile", "explosion", "attack", "attaque",
    "nuclear", "chemical weapon", "coup", "assassination",
    "cyber attack", "ransomware", "breach", "leak",
    "troops", "military operation", "ceasefire", "ceasefire broken",
    "carrier group", "naval", "submarine", "evacuate",
    "blackout", "power grid", "infrastructure",
    "IRGC", "IDF", "PLA", "NATO", "OTAN", "Wagner",
    "Hezbollah", "Hamas", "Houthi", "DPRK", "North Korea",
]

MEDIUM_KW = [
    "geopolitics", "conflict", "war", "tensions", "sanctions",
    "escalation", "intelligence", "OSINT", "protest", "militia",
]

LOCATIONS = {
    "Gaza": (31.5, 34.45), "Ukraine": (49.0, 32.0), "Kyiv": (50.45, 30.52),
    "Russia": (55.75, 37.62), "Iran": (35.69, 51.39), "Israel": (32.08, 34.78),
    "Lebanon": (33.89, 35.50), "Taiwan": (25.03, 121.56), "China": (39.91, 116.39),
    "North Korea": (39.01, 125.73), "Yemen": (15.35, 44.20), "Sudan": (15.60, 32.53),
    "Syria": (33.51, 36.29), "Red Sea": (20.0, 38.0), "Somalia": (2.04, 45.34),
    "Pakistan": (30.38, 69.35), "Afghanistan": (33.93, 67.71), "Myanmar": (19.74, 96.08),
    "Mali": (12.65, -8.00), "Sahel": (15.0, 2.0), "Kharkiv": (49.99, 36.23),
    "Zaporizhzhia": (47.84, 35.12), "Hodeida": (14.80, 42.95),
}

def score(text: str):
    tl = text.lower()
    s = sum(0.12 for kw in HIGH_KW if kw.lower() in tl)
    s += sum(0.04 for kw in MEDIUM_KW if kw.lower() in tl)
    s = min(0.97, s)
    tags = [kw.replace(" ", "_") for kw in HIGH_KW + MEDIUM_KW if kw.lower() in tl][:8]
    lat, lng = 0.0, 0.0
    zone = "Global"
    for loc, coords in LOCATIONS.items():
        if loc.lower() in tl:
            lat, lng = coords
            zone = loc
            if loc.replace(" ", "_") not in tags:
                tags.append(loc.replace(" ", "_"))
            break
    return round(s, 3), list(set(tags)), lat, lng, zone

# ─── Dedup ────────────────────────────────────────────────────

_seen = set()

def is_new(uid: str) -> bool:
    if uid in _seen:
        return False
    _seen.add(uid)
    if len(_seen) > 3000:
        for k in list(_seen)[:500]:
            _seen.discard(k)
    return True

# ─── POST to Render ───────────────────────────────────────────

def post(source_id: str, source_name: str, category: str,
         title: str, body: str, lat: float, lng: float, zone: str,
         tags: list, conf: float, url: str, onion: bool = False):
    uid = hashlib.md5(f"{source_id}{title}".encode()).hexdigest()[:12]
    if not is_new(uid):
        return False
    if conf < 0.12:
        return False
    try:
        payload = {
            "id": f"{source_id}_{uid}",
            "source": source_id,
            "sourceName": source_name,
            "category": category,
            "lat": lat, "lng": lng,
            "country": "XX",
            "zone": zone,
            "confidence": min(0.97, conf),
            "title": title[:100],
            "body": body[:300],
            "tags": tags,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "isAnomaly": conf >= 0.35,
            "onion": onion,
            "url": url,
        }
        r = requests.post(
            f"{NEXUS_API_URL}/api/darkweb/ingest",
            json=payload, timeout=8,
        )
        if r.status_code == 200:
            log.info(f"✓ [{source_name}] {title[:55]} ({int(conf*100)}%)")
            return True
    except Exception as e:
        log.warning(f"POST failed: {e}")
    return False

# ─── Scrapers ─────────────────────────────────────────────────

HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}

def scrape_4chan():
    board = random.choice(["pol", "k", "int", "news"])
    try:
        r = requests.get(f"https://a.4cdn.org/{board}/catalog.json",
                         headers=HEADERS, timeout=TIMEOUT)
        if not r.ok:
            return
        pages = r.json()
        threads = []
        for page in pages[:3]:
            threads.extend(page.get("threads", []))
        threads.sort(key=lambda t: t.get("replies", 0), reverse=True)
        count = 0
        for t in threads[:25]:
            text = BeautifulSoup(
                f"{t.get('sub','')} {t.get('com','')}",
                "html.parser"
            ).get_text(" ", strip=True)
            if len(text) < 30:
                continue
            conf, tags, lat, lng, zone = score(text)
            if conf < 0.15:
                continue
            post(
                source_id=f"4chan_{board}",
                source_name=f"4chan /{board}/",
                category="SOCIAL",
                title=text[:100], body=text[:280],
                lat=lat, lng=lng, zone=zone,
                tags=tags, conf=min(0.52, conf),
                url=f"https://boards.4chan.org/{board}/thread/{t.get('no','')}",
            )
            count += 1
            if count >= 4:
                break
        time.sleep(random.uniform(2, 5))
    except Exception as e:
        log.debug(f"4chan error: {e}")


SUBS = [
    "worldnews", "geopolitics", "UkraineWarVideoReport",
    "CombatFootage", "CredibleDefense", "GlobalConflict",
]

def scrape_reddit():
    sub = random.choice(SUBS)
    try:
        r = requests.get(
            f"https://www.reddit.com/r/{sub}/new.json?limit=25",
            headers={**HEADERS, "User-Agent": "nexus-intel-bot/2.0"},
            timeout=TIMEOUT,
        )
        if not r.ok:
            return
        posts = r.json().get("data", {}).get("children", [])
        count = 0
        for p in posts:
            d = p.get("data", {})
            title = d.get("title", "")
            if d.get("score", 0) < 10:
                continue
            conf, tags, lat, lng, zone = score(f"{title} {d.get('selftext','')}")
            if conf < 0.15:
                continue
            post(
                source_id=f"reddit_{sub}",
                source_name=f"Reddit r/{sub}",
                category="SOCIAL",
                title=title[:100], body=title[:280],
                lat=lat, lng=lng, zone=zone,
                tags=tags, conf=min(0.68, conf),
                url=f"https://reddit.com{d.get('permalink','')}",
            )
            count += 1
            if count >= 4:
                break
        time.sleep(random.uniform(2, 4))
    except Exception as e:
        log.debug(f"Reddit error: {e}")


def scrape_hackernews():
    try:
        r = requests.get(
            "https://hacker-news.firebaseio.com/v0/topstories.json",
            headers=HEADERS, timeout=TIMEOUT,
        )
        if not r.ok:
            return
        ids = r.json()[:50]
        count = 0
        for item_id in random.sample(ids, min(15, len(ids))):
            try:
                ir = requests.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json",
                    headers=HEADERS, timeout=10,
                )
                if not ir.ok:
                    continue
                item = ir.json()
                title = item.get("title", "")
                if item.get("score", 0) < 50:
                    continue
                conf, tags, lat, lng, zone = score(title)
                if conf < 0.12:
                    continue
                post(
                    source_id="hackernews",
                    source_name="Hacker News",
                    category="CYBER",
                    title=title[:100], body=title[:280],
                    lat=lat, lng=lng, zone=zone,
                    tags=tags + ["hacker_news"], conf=min(0.62, conf),
                    url=item.get("url") or f"https://news.ycombinator.com/item?id={item_id}",
                )
                count += 1
                if count >= 3:
                    break
                time.sleep(0.3)
            except:
                continue
    except Exception as e:
        log.debug(f"HN error: {e}")


def scrape_bellingcat():
    try:
        r = requests.get(
            "https://www.bellingcat.com/category/news/",
            headers=HEADERS, timeout=TIMEOUT,
        )
        if not r.ok:
            return
        soup = BeautifulSoup(r.text, "html.parser")
        for el in soup.select("h2.entry-title, h3.entry-title, .l-grid__title")[:8]:
            text = el.get_text(" ", strip=True)
            if len(text) < 20:
                continue
            conf, tags, lat, lng, zone = score(text)
            link = el.find("a")
            url = link["href"] if link and link.get("href") else "https://bellingcat.com"
            post(
                source_id="bellingcat",
                source_name="Bellingcat",
                category="GROUND_TRUTH",
                title=text[:100], body=text[:280],
                lat=lat, lng=lng, zone=zone,
                tags=tags + ["OSINT", "bellingcat"],
                conf=min(0.84, 0.65 + conf * 0.3),
                url=url,
            )
        time.sleep(random.uniform(3, 6))
    except Exception as e:
        log.debug(f"Bellingcat error: {e}")


def scrape_rferl():
    try:
        r = requests.get(
            "https://www.rferl.org/api/epiqq",
            headers={**HEADERS, "Accept": "application/json"},
            timeout=TIMEOUT,
        )
        if not r.ok:
            # Fallback: scrape HTML
            r2 = requests.get("https://www.rferl.org/", headers=HEADERS, timeout=TIMEOUT)
            if not r2.ok:
                return
            soup = BeautifulSoup(r2.text, "html.parser")
            for el in soup.select("h3, .media-block__title, .title")[:10]:
                text = el.get_text(" ", strip=True)
                if len(text) < 20:
                    continue
                conf, tags, lat, lng, zone = score(text)
                if conf < 0.12:
                    continue
                post(
                    source_id="rferl",
                    source_name="RFE/RL",
                    category="GROUND_TRUTH",
                    title=text[:100], body=text[:280],
                    lat=lat, lng=lng, zone=zone,
                    tags=tags, conf=min(0.74, 0.55 + conf * 0.3),
                    url="https://www.rferl.org/",
                )
    except Exception as e:
        log.debug(f"RFE/RL error: {e}")


def scrape_kyivindependent():
    try:
        r = requests.get(
            "https://kyivindependent.com/",
            headers=HEADERS, timeout=TIMEOUT,
        )
        if not r.ok:
            return
        soup = BeautifulSoup(r.text, "html.parser")
        for el in soup.select("h2, h3, .post-title, .entry-title")[:10]:
            text = el.get_text(" ", strip=True)
            if len(text) < 20:
                continue
            conf, tags, lat, lng, zone = score(text)
            if conf < 0.10:
                continue
            link = el.find("a") or el.find_parent("a")
            url = "https://kyivindependent.com/"
            if link and link.get("href", "").startswith("http"):
                url = link["href"]
            post(
                source_id="kyivindependent",
                source_name="Kyiv Independent",
                category="GROUND_TRUTH",
                title=text[:100], body=text[:280],
                lat=49.0, lng=32.0, zone="Ukraine",
                tags=tags + ["Ukraine", "war"],
                conf=min(0.78, 0.60 + conf * 0.3),
                url=url,
            )
        time.sleep(random.uniform(2, 4))
    except Exception as e:
        log.debug(f"Kyiv Independent error: {e}")


def scrape_middleeasteye():
    try:
        r = requests.get(
            "https://www.middleeasteye.net/",
            headers=HEADERS, timeout=TIMEOUT,
        )
        if not r.ok:
            return
        soup = BeautifulSoup(r.text, "html.parser")
        for el in soup.select("h2, h3, .article__title")[:10]:
            text = el.get_text(" ", strip=True)
            if len(text) < 20:
                continue
            conf, tags, lat, lng, zone = score(text)
            if conf < 0.10:
                continue
            post(
                source_id="middleeasteye",
                source_name="Middle East Eye",
                category="GROUND_TRUTH",
                title=text[:100], body=text[:280],
                lat=lat or 31.5, lng=lng or 34.78, zone=zone or "Middle East",
                tags=tags + ["MiddleEast"],
                conf=min(0.75, 0.55 + conf * 0.3),
                url="https://www.middleeasteye.net/",
            )
        time.sleep(random.uniform(2, 5))
    except Exception as e:
        log.debug(f"MEE error: {e}")


def scrape_thehill_defense():
    try:
        r = requests.get(
            "https://thehill.com/policy/defense/",
            headers=HEADERS, timeout=TIMEOUT,
        )
        if not r.ok:
            return
        soup = BeautifulSoup(r.text, "html.parser")
        for el in soup.select("h3.article__title, h2, .post-title")[:8]:
            text = el.get_text(" ", strip=True)
            if len(text) < 20:
                continue
            conf, tags, lat, lng, zone = score(text)
            if conf < 0.12:
                continue
            post(
                source_id="thehill_defense",
                source_name="The Hill — Defense",
                category="GROUND_TRUTH",
                title=text[:100], body=text[:280],
                lat=lat, lng=lng, zone=zone,
                tags=tags + ["defense", "US"],
                conf=min(0.72, 0.52 + conf * 0.3),
                url="https://thehill.com/policy/defense/",
            )
    except Exception as e:
        log.debug(f"The Hill error: {e}")


# ─── Ping Render pour éviter le sleep ──────────────────────────

def ping_render():
    try:
        r = requests.get(f"{NEXUS_API_URL}/api/health", timeout=10)
        if r.ok:
            log.info(f"[PING] Render awake — {r.json().get('uptime', '?')}s uptime")
    except Exception as e:
        log.warning(f"[PING] Render unreachable: {e}")


# ─── Main loop ────────────────────────────────────────────────

SCRAPERS = [
    ("4chan",            scrape_4chan),
    ("Reddit",          scrape_reddit),
    ("Hacker News",     scrape_hackernews),
    ("Bellingcat",      scrape_bellingcat),
    ("RFE/RL",          scrape_rferl),
    ("Kyiv Independent",scrape_kyivindependent),
    ("Middle East Eye", scrape_middleeasteye),
    ("The Hill Defense",scrape_thehill_defense),
]

def run_cycle(cycle: int):
    log.info(f"═══ Cycle #{cycle} — {datetime.datetime.utcnow().strftime('%H:%M UTC')} ═══")
    ping_render()

    scrapers = SCRAPERS.copy()
    random.shuffle(scrapers)
    for name, fn in scrapers:
        try:
            log.info(f"  → {name}")
            fn()
            time.sleep(random.uniform(1.5, 4.0))
        except Exception as e:
            log.warning(f"  ✗ {name}: {e}")

    log.info(f"Cycle #{cycle} done. Next in {POLL_MINUTES}min.")


def main():
    log.info("NEXUS Replit Collector v2")
    log.info(f"  Target: {NEXUS_API_URL}")
    log.info(f"  Interval: {POLL_MINUTES} min")
    log.info(f"  Sources: {len(SCRAPERS)}")

    # Start keep-alive HTTP server in background thread
    t = threading.Thread(target=start_keepalive_server, daemon=True)
    t.start()

    cycle = 0
    while True:
        cycle += 1
        try:
            run_cycle(cycle)
        except KeyboardInterrupt:
            log.info("Arrêt propre.")
            break
        except Exception as e:
            log.error(f"Cycle error: {e}")

        sleep_sec = POLL_MINUTES * 60 + random.randint(-30, 30)
        time.sleep(sleep_sec)


if __name__ == "__main__":
    main()
