#!/usr/bin/env python3
"""
NEXUS Telegram Collector — Telethon Backend
════════════════════════════════════════════════════════════════

Surveille 35 canaux Telegram OSINT en temps réel:
- Détection premier émetteur (premier message_id sur événement)
- Scoring confiance par canal (algorithme 6-dimensions)
- Similarité Jaccard pour détecter les reposts (seuil 0.85)
- Extraction géolocalisation dans le texte (NER simplifié)
- Traduction automatique (deepl-free / googletrans)
- Push vers API NEXUS (Next.js /api/telegram-intel/route)

SETUP:
  pip install telethon httpx rapidfuzz googletrans==4.0.0-rc1 regex
  export TELEGRAM_API_ID=xxx
  export TELEGRAM_API_HASH=xxx
  export NEXUS_API_URL=http://localhost:3000
  python3 nexus_telegram_collector.py

CHANNELS COUVERTS (35 canaux):
  - 7 PRIMARY (sources originales terrain)
  - 18 SECONDARY (agrégateurs + analystes)
  - 10 TERTIARY (footage/brut)
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Optional

import httpx
from telethon import TelegramClient, events
from telethon.tl.types import Message, Channel

# ── Configuration ──────────────────────────────────────────────

API_ID   = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
NEXUS_API_URL = os.environ.get("NEXUS_API_URL", "http://localhost:3000")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [NEXUS-TG] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nexus.telegram")

# ── Canaux à surveiller ────────────────────────────────────────

CHANNELS = {
    # FORMAT: handle → { tier, bias, credibility_base, specialties }
    "idfofficial":               {"tier": 1, "bias": "OFFICIAL",     "cred": 72, "weight": 0.88},
    "swatter_jammer":            {"tier": 1, "bias": "ANALYST",      "cred": 88, "weight": 0.95},
    "social_drone":              {"tier": 1, "bias": "NEUTRAL",      "cred": 84, "weight": 0.90},
    "UltraRadar":                {"tier": 1, "bias": "NEUTRAL",      "cred": 87, "weight": 0.93},
    "rnintel":                   {"tier": 1, "bias": "ANALYST",      "cred": 86, "weight": 0.91},
    "warriorsukrainian":         {"tier": 1, "bias": "PRO_UA",       "cred": 73, "weight": 0.80},
    "wfwitness":                 {"tier": 1, "bias": "NEUTRAL",      "cred": 81, "weight": 0.87},
    "IranintlTV":                {"tier": 1, "bias": "PRO_WEST",     "cred": 80, "weight": 0.85},
    "Farsi_Iranwire":            {"tier": 1, "bias": "NEUTRAL",      "cred": 85, "weight": 0.91},
    "Tsaplienko":                {"tier": 1, "bias": "PRO_UA",       "cred": 82, "weight": 0.86},
    "warmonitors":               {"tier": 2, "bias": "NEUTRAL",      "cred": 82, "weight": 0.85},
    "intelslava":                {"tier": 2, "bias": "PRO_RU",       "cred": 63, "weight": 0.60},
    "DDGeopolitics":             {"tier": 2, "bias": "ANALYST",      "cred": 84, "weight": 0.88},
    "warfareanalysis":           {"tier": 2, "bias": "ANALYST",      "cred": 85, "weight": 0.89},
    "BellumActaNews":            {"tier": 2, "bias": "NEUTRAL",      "cred": 80, "weight": 0.83},
    "IntelRepublic":             {"tier": 2, "bias": "NEUTRAL",      "cred": 78, "weight": 0.80},
    "Middle_East_Spectator":     {"tier": 2, "bias": "NEUTRAL",      "cred": 76, "weight": 0.78},
    "Israel_Middle_East_Insight":{"tier": 2, "bias": "PRO_IL",       "cred": 70, "weight": 0.72},
    "LebUpdate":                 {"tier": 2, "bias": "NEUTRAL",      "cred": 76, "weight": 0.79},
    "GeoPWatch":                 {"tier": 2, "bias": "ANALYST",      "cred": 79, "weight": 0.82},
    "engliishabuali":            {"tier": 2, "bias": "PRO_PA",       "cred": 68, "weight": 0.68},
    "beholdisraelchannel":       {"tier": 2, "bias": "PRO_IL",       "cred": 66, "weight": 0.65},
    "hnaftali":                  {"tier": 1, "bias": "OFFICIAL",     "cred": 74, "weight": 0.76},
    "United24media":             {"tier": 2, "bias": "PRO_UA",       "cred": 72, "weight": 0.73},
    "ukrainejournal":            {"tier": 2, "bias": "PRO_UA",       "cred": 75, "weight": 0.76},
    "thecradlemedia":            {"tier": 2, "bias": "PRO_IR",       "cred": 62, "weight": 0.60},
    "TheSimurgh313":             {"tier": 1, "bias": "PRO_IR",       "cred": 60, "weight": 0.58},
    "RezistanceTrench1":         {"tier": 3, "bias": "PRO_IR",       "cred": 48, "weight": 0.45},
    "AssyriaNewsNetwork":        {"tier": 1, "bias": "NEUTRAL",      "cred": 77, "weight": 0.80},
    "medmannews":                {"tier": 2, "bias": "NEUTRAL",      "cred": 73, "weight": 0.75},
    "IsraelWarLive":             {"tier": 2, "bias": "PRO_IL",       "cred": 68, "weight": 0.68},
    "warvideos18":               {"tier": 3, "bias": "AGGREGATOR",   "cred": 42, "weight": 0.35},
    "horror_footage":            {"tier": 3, "bias": "AGGREGATOR",   "cred": 45, "weight": 0.38},
    "NewsWorld_23":              {"tier": 3, "bias": "AGGREGATOR",   "cred": 58, "weight": 0.52},
    "stayfreeworld":             {"tier": 3, "bias": "AGGREGATOR",   "cred": 52, "weight": 0.48},
}

# ── Types ──────────────────────────────────────────────────────

@dataclass
class NexusMessage:
    id: str                         # nexus-{channel}-{msg_id}
    channel: str
    msg_id: int
    text: str
    translated_text: str
    original_language: str
    timestamp: str                  # ISO 8601
    credibility_score: float        # 0-100
    confidence_score: float         # 0-1
    channel_tier: int               # 1-3
    channel_bias: str
    is_forward: bool
    forward_from: Optional[str]
    has_media: bool
    media_type: Optional[str]       # photo, video, document
    entities_detected: list         # [{"type": "location", "text": "Tel Aviv"}]
    zone: Optional[str]             # Zone NEXUS détectée
    level: int                      # 1-10 niveau estimé
    tags: list                      # ["airstrike", "israel", "missile"]
    is_repost: bool                 # Jaccard > 0.85 vs message récent
    primacy_rank: int               # 1 = premier émetteur sur cet event
    event_hash: Optional[str]       # Hash événement pour grouper

# ── Détection d'événements ────────────────────────────────────

ZONE_KEYWORDS = {
    "Tel Aviv":          ["tel aviv", "הבזק", "תל אביב", "sirens"],
    "Gaza":              ["gaza", "rafah", "khan yunis", "deir al-balah", "צוק"],
    "Liban":             ["lebanon", "beirut", "hezbollah", "بيروت", "لبنان"],
    "Iran":              ["iran", "tehran", "isfahan", "irgc", "تهران", "ایران"],
    "Détroit d'Ormuz":   ["hormuz", "ormuz", "gulf", "tanker"],
    "Ukraine":           ["ukraine", "kyiv", "kherson", "kharkiv", "zaporizhzhia", "київ"],
    "Mer Rouge":         ["red sea", "houthi", "houthis", "hodeidah", "ansarallah"],
    "Syrie":             ["syria", "damascus", "aleppo", "دمشق", "سوريا"],
    "Irak":              ["iraq", "baghdad", "mosul", "irak"],
    "Moscou":            ["moscow", "kremlin", "moskva", "москва"],
    "Taiwan":            ["taiwan", "strait", "pla", "taipei"],
    "Sahel":             ["mali", "niger", "burkina", "wagner", "sahel"],
}

ALERT_KEYWORDS = {
    9: ["explosion", "airstrike", "missile", "bombing", "attack confirmed", "rockets fired", "casualties"],
    8: ["sirens", "alert", "drone attack", "incoming", "שגר", "אזעקה", "חדירה"],
    7: ["military movement", "convoy", "forces advancing", "shelling", "artillery"],
    6: ["warning", "escalation", "threat", "mobilization", "deployment"],
    5: ["tension", "incident", "protest", "clashes", "border"],
}

BIAS_PENALTIES = {
    "PRO_RU": 20, "PRO_IR": 18, "PRO_IL": 12, "PRO_PA": 12,
    "PRO_UA": 8, "PRO_WEST": 10, "OFFICIAL": 15, "AGGREGATOR": 25,
    "NEUTRAL": 0, "ANALYST": 0,
}

LANGUAGE_ICONS = {
    "ar": "🇦🇪", "he": "🇮🇱", "fa": "🇮🇷", "ru": "🇷🇺",
    "uk": "🇺🇦", "en": "🇺🇸", "syr": "✝️",
}

# ── Recent messages cache (pour Jaccard) ──────────────────────

recent_messages: deque = deque(maxlen=500)  # Buffer 500 messages récents
event_clusters: dict = defaultdict(list)    # hash → [messages]

# ── Fonctions utilitaires ──────────────────────────────────────

def detect_language(text: str) -> str:
    """Détection simple basée sur caractères"""
    if not text: return "en"
    arabic_chars = len(re.findall(r'[\u0600-\u06FF]', text))
    hebrew_chars = len(re.findall(r'[\u0590-\u05FF]', text))
    cyrillic_chars = len(re.findall(r'[\u0400-\u04FF]', text))
    
    if hebrew_chars > 5: return "he"
    if arabic_chars > 5:
        # Distinguer farsi et arabe (approximatif)
        farsi_chars = len(re.findall(r'[گچپژ]', text))
        return "fa" if farsi_chars > 2 else "ar"
    if cyrillic_chars > 5:
        ukrainian = len(re.findall(r'[іїєґ]', text))
        return "uk" if ukrainian > 2 else "ru"
    return "en"

def tokenize(text: str) -> set:
    """Tokenisation simple pour Jaccard"""
    tokens = re.findall(r'\b\w{4,}\b', text.lower())
    return set(tokens)

def jaccard_similarity(text1: str, text2: str) -> float:
    """Similarité Jaccard entre deux textes"""
    t1, t2 = tokenize(text1), tokenize(text2)
    if not t1 or not t2: return 0.0
    intersection = t1 & t2
    union = t1 | t2
    return len(intersection) / len(union)

def detect_zone(text: str) -> Optional[str]:
    """Détecte la zone géographique dans le texte"""
    text_lower = text.lower()
    for zone, keywords in ZONE_KEYWORDS.items():
        if any(kw.lower() in text_lower for kw in keywords):
            return zone
    return None

def detect_alert_level(text: str) -> int:
    """Estime le niveau d'alerte NEXUS 1-10 depuis le texte"""
    text_lower = text.lower()
    for level in sorted(ALERT_KEYWORDS.keys(), reverse=True):
        for kw in ALERT_KEYWORDS[level]:
            if kw.lower() in text_lower:
                return level
    return 4  # Niveau par défaut

def extract_tags(text: str) -> list:
    """Extrait des tags thématiques"""
    tags = []
    tag_patterns = {
        "airstrike":    r'\b(airstrikes?|bombing|f-35|f-16|warplane)\b',
        "missile":      r'\b(missile|ballistic|cruise|scud|iskander|kalibr)\b',
        "drone":        r'\b(drone|uav|fpv|kamikaze|shaheed|geran|lancet)\b',
        "naval":        r'\b(ship|vessel|destroyer|carrier|frigate|submarine)\b',
        "cyber":        r'\b(cyberattack|hack|ddos|malware|ransomware)\b',
        "nuclear":      r'\b(nuclear|enrichment|uranium|centrifuge|natanz)\b',
        "casualty":     r'\b(killed|wounded|dead|casualties|fatalities)\b',
        "explosion":    r'\b(explosion|blast|detonation|strike)\b',
        "gps_jamming":  r'\b(gps|jamming|spoofing|electronic warfare|ew)\b',
        "artillery":    r'\b(artillery|shelling|howitzer|grad|shell)\b',
    }
    for tag, pattern in tag_patterns.items():
        if re.search(pattern, text, re.IGNORECASE):
            tags.append(tag)
    return tags

def compute_confidence(channel: str, text: str, is_repost: bool, is_forward: bool) -> float:
    """Score confiance 0-1 basé sur 6 dimensions"""
    ch_meta = CHANNELS.get(channel, {"cred": 50, "tier": 3, "bias": "AGGREGATOR"})
    base = ch_meta["cred"] / 100.0
    
    # Pénalités
    bias_pen = BIAS_PENALTIES.get(ch_meta["bias"], 0) / 100.0
    repost_pen = 0.20 if is_repost else 0.0
    tier_pen = {1: 0.0, 2: 0.05, 3: 0.20}.get(ch_meta["tier"], 0.20)
    
    # Bonus
    multi_lang_bonus = 0.05 if detect_language(text) != "en" else 0.0
    
    score = base - bias_pen - repost_pen - tier_pen + multi_lang_bonus
    return round(max(0.0, min(1.0, score)), 3)

def event_hash(text: str, zone: Optional[str]) -> str:
    """Hash pour grouper messages sur même événement"""
    tokens = sorted(tokenize(text))[:15]  # 15 mots clés les plus discriminants
    content = (zone or "global") + " ".join(tokens)
    return hashlib.md5(content.encode()).hexdigest()[:12]

# ── Traduction (gratuite) ─────────────────────────────────────

async def translate_text(text: str, src_lang: str) -> str:
    """Traduction via LibreTranslate (auto-hébergé) ou fallback"""
    if src_lang == "en" or not text.strip():
        return text
    try:
        # Option 1: LibreTranslate (hébergé localement ou public)
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(
                "https://libretranslate.de/translate",  # Instance publique
                json={"q": text[:500], "source": src_lang, "target": "en"},
            )
            if r.status_code == 200:
                return r.json().get("translatedText", text)
    except Exception:
        pass
    
    # Fallback: prefix avec langue détectée
    return f"[{src_lang.upper()}] {text[:300]}"

# ── Client Telegram ───────────────────────────────────────────

client = TelegramClient("nexus_session", API_ID, API_HASH)

@client.on(events.NewMessage(chats=list(CHANNELS.keys())))
async def on_message(event):
    msg: Message = event.message
    channel_entity = await event.get_chat()
    channel_handle = getattr(channel_entity, "username", "unknown") or "unknown"
    
    if not msg.text or len(msg.text) < 10:
        return
    
    text = msg.text
    lang = detect_language(text)
    translated = await translate_text(text, lang)
    zone = detect_zone(text) or detect_zone(translated)
    level = detect_alert_level(text + " " + translated)
    tags = extract_tags(text + " " + translated)
    
    # Repost detection (Jaccard)
    is_repost = False
    for prev_text in list(recent_messages):
        if jaccard_similarity(text, prev_text) > 0.82:
            is_repost = True
            break
    recent_messages.append(text)
    
    # Forward tracking
    is_forward = msg.forward is not None
    forward_from = None
    if is_forward and msg.forward.channel_id:
        try:
            fwd_entity = await client.get_entity(msg.forward.channel_id)
            forward_from = getattr(fwd_entity, "username", None)
        except Exception:
            pass
    
    # Forward burst detection — count unique channels forwarding same event in 3min.
    # A burst >= 5 channels is a strong propagation signal (often precedes media coverage).
    evt_hash = event_hash(translated, zone)
    forward_burst = 0
    if is_forward:
        burst_key = f"fwd_{evt_hash}"
        if burst_key not in event_clusters:
            event_clusters[burst_key] = []
        event_clusters[burst_key].append({
            "channel": channel_handle,
            "ts_epoch": msg.date.timestamp(),
        })
        now_epoch = msg.date.timestamp()
        recent_fwds = [
            e for e in event_clusters[burst_key]
            if abs(now_epoch - e["ts_epoch"]) < 180
        ]
        forward_burst = len(set(e["channel"] for e in recent_fwds))
    
    if forward_burst >= 5 and "propagation_burst" not in tags:
        tags.append("propagation_burst")
        level = max(level, 6)
        log.info(f"PROPAGATION BURST: {forward_burst} channels / 3min  hash={evt_hash[:8]}")
    
    confidence = compute_confidence(channel_handle, text, is_repost, is_forward)
    
    event_clusters[evt_hash].append({
        "channel": channel_handle,
        "msg_id": msg.id,
        "timestamp": msg.date.isoformat(),
        "text": text[:200],
    })
    
    cluster = event_clusters[evt_hash]
    cluster.sort(key=lambda x: x["msg_id"])
    primacy_rank = next((i+1 for i, m in enumerate(cluster) if m["channel"] == channel_handle), 1)
    
    nexus_msg = NexusMessage(
        id=f"tg-{channel_handle}-{msg.id}",
        channel=channel_handle,
        msg_id=msg.id,
        text=text[:400],
        translated_text=translated[:400],
        original_language=lang,
        timestamp=msg.date.isoformat(),
        credibility_score=CHANNELS.get(channel_handle, {}).get("cred", 50),
        confidence_score=confidence,
        channel_tier=CHANNELS.get(channel_handle, {}).get("tier", 3),
        channel_bias=CHANNELS.get(channel_handle, {}).get("bias", "UNKNOWN"),
        is_forward=is_forward,
        forward_from=forward_from,
        has_media=msg.media is not None,
        media_type=type(msg.media).__name__ if msg.media else None,
        entities_detected=[{"type": "location", "text": zone}] if zone else [],
        zone=zone,
        level=level,
        tags=tags,
        is_repost=is_repost,
        primacy_rank=primacy_rank,
        event_hash=evt_hash if len(cluster) > 1 else None,
    )
    
    cred_bar = "#" * int(confidence * 10) + "." * (10 - int(confidence * 10))
        "channel": channel_handle,
        "msg_id": msg.id,
        "timestamp": msg.date.isoformat(),
        "text": text[:200],
    })
    
    # Primacy rank (1 = premier sur cet event)
    cluster = event_clusters[evt_hash]
    cluster.sort(key=lambda x: x["msg_id"])
    primacy_rank = next((i+1 for i, m in enumerate(cluster) if m["channel"] == channel_handle), 1)
    
    # Construire objet NEXUS
    nexus_msg = NexusMessage(
        id=f"tg-{channel_handle}-{msg.id}",
        channel=channel_handle,
        msg_id=msg.id,
        text=text[:400],
        translated_text=translated[:400],
        original_language=lang,
        timestamp=msg.date.isoformat(),
        credibility_score=CHANNELS.get(channel_handle, {}).get("cred", 50),
        confidence_score=confidence,
        channel_tier=CHANNELS.get(channel_handle, {}).get("tier", 3),
        channel_bias=CHANNELS.get(channel_handle, {}).get("bias", "UNKNOWN"),
        is_forward=is_forward,
        forward_from=forward_from,
        has_media=msg.media is not None,
        media_type=type(msg.media).__name__ if msg.media else None,
        entities_detected=[{"type": "location", "text": zone}] if zone else [],
        zone=zone,
        level=level,
        tags=tags,
        is_repost=is_repost,
        primacy_rank=primacy_rank,
        event_hash=evt_hash if len(cluster) > 1 else None,
    )
    
    # Log (no emojis — clean output for log aggregators like Datadog/Render)
    log.info(
        f"[{channel_handle}] LV{level} | [{cred_bar}]{confidence:.0%} "
        f"| {'FIRST' if primacy_rank == 1 else f'rank {primacy_rank}'} "
        f"| {'REPOST' if is_repost else 'ORIGINAL'} "
        f"| {zone or 'GLOBAL'} | {tags[:3]}"
    )
    
    await push_to_nexus(nexus_msg)

async def push_to_nexus(msg: NexusMessage):
    """Push message to NEXUS Next.js API."""
    try:
        async with httpx.AsyncClient(timeout=5) as client_http:
            r = await client_http.post(
                f"{NEXUS_API_URL}/api/telegram-intel",
                json=asdict(msg),
                headers={"Content-Type": "application/json"},
            )
            if r.status_code != 200:
                log.warning(f"NEXUS API error: {r.status_code}")
    except Exception as e:
        log.error(f"Push failed: {e}")

async def main():
    log.info("NEXUS Telegram Collector starting")
    log.info(f"Monitoring {len(CHANNELS)} channels")
    log.info(f"API ID: {API_ID}")
    log.info(f"NEXUS API: {NEXUS_API_URL}")
    
    await client.start()
    log.info("Connected to Telegram")
    
    resolved = 0
    for handle in CHANNELS.keys():
        try:
            await client.get_entity(handle)
            resolved += 1
        except Exception as e:
            log.warning(f"Channel not resolved: {handle} — {e}")
    
    log.info(f"{resolved}/{len(CHANNELS)} channels resolved")
    log.info("Listening for new messages...")
    
    await client.run_until_disconnected()

if __name__ == "__main__":
    asyncio.run(main())
