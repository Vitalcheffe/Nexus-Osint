#!/usr/bin/env python3
"""
nexus_alert_bot.py
NEXUS Intelligence — Telegram Alert Publisher + Interactive Bot

Polls /api/nexus/alerts every 20s and publishes high-level events
to a Telegram channel. Also handles commands from any chat/user.

Commands:
    /status         — source health + active alert count
    /zone <name>    — recent alerts for a specific zone
    /level <n>      — set minimum publish level (admin only)
    /sources        — active data sources list
    /help           — command reference

Alert behaviour:
    - Level 7+   → publish to channel immediately
    - Level 9+   → thread-style: summary + one reply per signal (max 6)
    - Escalation → edit existing message when level rises, no duplicate

ENV:
    NEXUS_BOT_TOKEN     — BotFather token (required)
    NEXUS_CHANNEL_ID    — e.g. @nexus_osint_alerts or -100xxxxxxxxxx (required)
    NEXUS_API_URL       — Next.js base URL (required)
    BOT_MIN_LEVEL       — minimum alert level to publish (default 7)
    BOT_COOLDOWN_SEC    — per-zone publish cooldown in seconds (default 30)
    BOT_ADMIN_IDS       — comma-separated Telegram user IDs for /level command
"""

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

try:
    from telegram import Bot, Update
    from telegram.constants import ParseMode
    from telegram.error import RetryAfter, TelegramError
    from telegram.ext import Application, CommandHandler, ContextTypes
    TELEGRAM_OK = True
except ImportError:
    TELEGRAM_OK = False

# ─── Config ───────────────────────────────────────────────────

BOT_TOKEN    = os.environ.get("NEXUS_BOT_TOKEN", "")
CHANNEL_ID   = os.environ.get("NEXUS_CHANNEL_ID", "")
API_URL      = os.environ.get("NEXUS_API_URL", "http://localhost:3000").rstrip("/")
MIN_LEVEL    = int(os.environ.get("BOT_MIN_LEVEL", "7"))
COOLDOWN_SEC = int(os.environ.get("BOT_COOLDOWN_SEC", "30"))
ADMIN_IDS    = {
    int(x.strip())
    for x in os.environ.get("BOT_ADMIN_IDS", "").split(",")
    if x.strip().isdigit()
}

POLL_INTERVAL = 20
API_TIMEOUT   = 10

# ─── Logging ──────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nexus_bot")

# ─── In-process state ─────────────────────────────────────────

@dataclass
class State:
    min_level:      int  = MIN_LEVEL
    published_ids:  set  = field(default_factory=set)
    zone_cooldowns: dict = field(default_factory=dict)  # zone → last_epoch
    message_ids:    dict = field(default_factory=dict)  # alert_id → tg_msg_id
    alert_levels:   dict = field(default_factory=dict)  # alert_id → last known level

ST = State()

# ─── Alert model ──────────────────────────────────────────────

@dataclass
class Alert:
    id:        str
    level:     int
    zone:      str
    country:   str
    category:  str
    signals:   list
    correlation: dict
    historical: list
    summary:   str
    timestamp: str

# ─── API helpers ──────────────────────────────────────────────

async def fetch_alerts(min_level: int = 7, limit: int = 15) -> list[Alert]:
    url = f"{API_URL}/api/nexus/alerts?minLevel={min_level}&limit={limit}"
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
            r = await c.get(url)
            r.raise_for_status()
            data = r.json()
            out = []
            for a in data.get("alerts", []):
                try:
                    out.append(Alert(
                        id=a.get("id", ""),
                        level=int(a.get("level", 0)),
                        zone=a.get("zone", "UNKNOWN"),
                        country=a.get("country", "XX"),
                        category=a.get("category", ""),
                        signals=a.get("signals", []),
                        correlation=a.get("correlation", {}),
                        historical=a.get("historicalMatches", []),
                        summary=a.get("aiSummary", ""),
                        timestamp=a.get("timestamp", ""),
                    ))
                except Exception:
                    continue
            return out
    except Exception as e:
        log.warning(f"fetch_alerts: {e}")
        return []

async def fetch_health() -> dict:
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as c:
            r = await c.get(f"{API_URL}/api/health")
            return r.json()
    except Exception:
        return {}

# ─── Text formatting ──────────────────────────────────────────

def level_label(level: int) -> str:
    if level >= 9: return "CRITICAL"
    if level >= 7: return "HIGH"
    if level >= 5: return "ELEVATED"
    return "WATCH"

def corr_line(c: dict) -> str:
    dims = [
        ("SPA", c.get("spatial", 0)),
        ("TMP", c.get("temporal", 0)),
        ("SEM", c.get("semantic", 0)),
        ("BHV", c.get("behavioral", 0)),
        ("HIS", c.get("historical", 0)),
        ("SRC", c.get("sourceDiv", 0)),
    ]
    return "  ".join(f"{k}:{int(v * 100):02d}" for k, v in dims)

def format_alert(a: Alert, escalated_from: int = 0) -> str:
    ts     = (a.timestamp[:16].replace("T", " ") + " UTC") if a.timestamp else "—"
    label  = level_label(a.level)
    parts  = [
        f"<b>[{label}]  LV{a.level}  {a.zone.upper()}</b>",
        f"<code>{ts}  ·  {a.category}  ·  {a.country}</code>",
        "",
    ]

    if a.signals:
        parts.append("<b>SOURCES</b>")
        for sig in a.signals[:8]:
            src  = str(sig.get("source", "?")).upper()[:12]
            conf = int(sig.get("confidence", 0) * 100)
            text = str(sig.get("text", ""))[:80]
            parts.append(f"<code>[{src}] {conf:02d}%</code>  {text}")
        parts.append("")

    c = a.correlation
    if c:
        total = int(c.get("total", 0) * 100)
        parts.append(f"<b>CORRELATION  {total}%</b>")
        parts.append(f"<code>{corr_line(c)}</code>")
        parts.append("")

    if a.historical:
        best = a.historical[0]
        sim  = int(best.get("similarity", 0) * 100)
        name = best.get("name", "?")
        date = best.get("date", "?")
        parts.append(f"<b>MATCH</b>  {name} ({date})  {sim}%")
        parts.append("")

    if a.summary:
        parts.append(f"<i>{a.summary.strip()[:280]}</i>")

    if escalated_from:
        parts.append(f"\n<b>ESCALATED  LV{escalated_from} → LV{a.level}</b>")

    parts.append(f"\n<code>NEXUS · {len(a.signals)} src · ID {a.id[:8]}</code>")
    return "\n".join(parts)

def format_signal(sig: dict) -> str:
    src  = str(sig.get("source", "?")).upper()
    conf = int(sig.get("confidence", 0) * 100)
    text = str(sig.get("text", ""))[:200]
    ts   = str(sig.get("timestamp", ""))[:16].replace("T", " ")
    return f"<code>[{src}]  {conf}%  {ts}</code>\n{text}"

# ─── Telegram send helpers ────────────────────────────────────

async def send_msg(bot: Bot, text: str, reply_id: Optional[int] = None) -> Optional[int]:
    for attempt in range(4):
        try:
            kwargs = dict(
                chat_id=CHANNEL_ID,
                text=text,
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=True,
            )
            if reply_id:
                kwargs["reply_to_message_id"] = reply_id
            msg = await bot.send_message(**kwargs)
            return msg.message_id
        except RetryAfter as e:
            wait = e.retry_after + 1
            log.warning(f"Rate limited — sleeping {wait}s")
            await asyncio.sleep(wait)
        except TelegramError as e:
            log.error(f"send_msg error: {e}")
            return None
    return None

async def edit_msg(bot: Bot, message_id: int, text: str) -> bool:
    try:
        await bot.edit_message_text(
            chat_id=CHANNEL_ID,
            message_id=message_id,
            text=text,
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return True
    except TelegramError as e:
        log.warning(f"edit_msg failed: {e}")
        return False

# ─── Publish logic ────────────────────────────────────────────

async def maybe_publish(bot: Bot, alert: Alert) -> None:
    zone = alert.zone.lower()
    now  = time.time()

    existing_msg = ST.message_ids.get(alert.id)
    prev_level   = ST.alert_levels.get(alert.id, 0)

    # Escalation: edit the existing message
    if existing_msg and alert.level > prev_level:
        text = format_alert(alert, escalated_from=prev_level)
        await edit_msg(bot, existing_msg, text)
        ST.alert_levels[alert.id] = alert.level
        log.info(f"Escalated {alert.zone}: LV{prev_level} → LV{alert.level}")
        return

    # Already published, no change
    if alert.id in ST.published_ids:
        return

    # Zone cooldown
    if (now - ST.zone_cooldowns.get(zone, 0)) < COOLDOWN_SEC:
        return

    # Send
    text   = format_alert(alert)
    msg_id = await send_msg(bot, text)
    if not msg_id:
        return

    ST.published_ids.add(alert.id)
    ST.zone_cooldowns[zone] = now
    ST.message_ids[alert.id] = msg_id
    ST.alert_levels[alert.id] = alert.level
    log.info(f"Published LV{alert.level} {alert.zone} ({len(alert.signals)} signals)")

    # Level 9+: post thread replies per signal
    if alert.level >= 9:
        await asyncio.sleep(1.2)
        for sig in alert.signals[:6]:
            await send_msg(bot, format_signal(sig), reply_id=msg_id)
            await asyncio.sleep(0.6)

    # Trim seen set
    if len(ST.published_ids) > 2000:
        to_drop = list(ST.published_ids)[:500]
        for x in to_drop:
            ST.published_ids.discard(x)

# ─── Poll loop ────────────────────────────────────────────────

async def poll_loop(bot: Bot) -> None:
    log.info(f"Poll loop started  interval={POLL_INTERVAL}s  min_level={ST.min_level}")
    while True:
        try:
            alerts = await fetch_alerts(min_level=ST.min_level, limit=15)
            for a in sorted(alerts, key=lambda x: x.level, reverse=True):
                await maybe_publish(bot, a)
        except Exception as e:
            log.error(f"poll_loop error: {e}")
        await asyncio.sleep(POLL_INTERVAL)

# ─── Bot command handlers ─────────────────────────────────────

async def cmd_help(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "<b>NEXUS INTELLIGENCE</b>\n\n"
        "<code>/status</code>         system status\n"
        "<code>/zone [name]</code>    alerts for a zone\n"
        "<code>/level [3-10]</code>   set publish level (admin)\n"
        "<code>/sources</code>        data source list\n"
        "<code>/help</code>           this message",
        parse_mode=ParseMode.HTML,
    )

async def cmd_status(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    health = await fetch_health()
    lines  = [
        "<b>NEXUS STATUS</b>",
        f"<code>Publish level : {ST.min_level}</code>",
        f"<code>Published     : {len(ST.published_ids)}</code>",
        f"<code>API           : {API_URL}</code>",
    ]
    src_count = health.get("sourcesOnline", "?")
    if src_count:
        lines.append(f"<code>Sources up    : {src_count}</code>")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)

async def cmd_zone(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if not ctx.args:
        await update.message.reply_text("Usage: /zone &lt;name&gt;", parse_mode=ParseMode.HTML)
        return
    query   = " ".join(ctx.args).lower()
    alerts  = await fetch_alerts(min_level=1, limit=100)
    matches = [a for a in alerts if query in a.zone.lower()][:5]
    if not matches:
        await update.message.reply_text(f"<code>No alerts found for: {query}</code>", parse_mode=ParseMode.HTML)
        return
    parts = [f"<b>ZONE: {query.upper()}</b>  ({len(matches)} alerts)\n"]
    for a in matches:
        ts = a.timestamp[:16].replace("T", " ")
        parts.append(f"LV{a.level}  {a.zone}  <code>{ts}</code>")
        parts.append(f"  {len(a.signals)} sources  ·  {a.category}")
        if a.summary:
            parts.append(f"  <i>{a.summary[:100]}</i>")
        parts.append("")
    await update.message.reply_text("\n".join(parts), parse_mode=ParseMode.HTML)

async def cmd_level(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    uid = update.effective_user.id if update.effective_user else 0
    if ADMIN_IDS and uid not in ADMIN_IDS:
        await update.message.reply_text("<code>Not authorized.</code>", parse_mode=ParseMode.HTML)
        return
    if not ctx.args or not ctx.args[0].isdigit():
        await update.message.reply_text("Usage: /level 1-10", parse_mode=ParseMode.HTML)
        return
    lvl = int(ctx.args[0])
    if not 1 <= lvl <= 10:
        await update.message.reply_text("<code>Level must be 1-10.</code>", parse_mode=ParseMode.HTML)
        return
    ST.min_level = lvl
    await update.message.reply_text(f"<code>Publish level set to {lvl}</code>", parse_mode=ParseMode.HTML)
    log.info(f"Level changed to {lvl} by user {uid}")

async def cmd_sources(update: Update, _ctx: ContextTypes.DEFAULT_TYPE) -> None:
    health  = await fetch_health()
    sources = health.get("sources", [])
    if not sources:
        await update.message.reply_text("<code>Source data unavailable.</code>", parse_mode=ParseMode.HTML)
        return
    lines = ["<b>ACTIVE SOURCES</b>\n"]
    for s in sources[:20]:
        name   = str(s.get("name", "?"))[:16]
        status = s.get("status", "?")
        lag    = s.get("lagSec", 0)
        flag   = "UP" if status == "online" else "DOWN"
        lines.append(f"<code>[{flag}]  {name:<16}  {lag}s</code>")
    await update.message.reply_text("\n".join(lines), parse_mode=ParseMode.HTML)

# ─── Entrypoint ───────────────────────────────────────────────

async def run() -> None:
    if not TELEGRAM_OK:
        log.error("python-telegram-bot not installed. pip install 'python-telegram-bot[all]' httpx")
        return
    if not BOT_TOKEN:
        log.error("NEXUS_BOT_TOKEN not set")
        return
    if not CHANNEL_ID:
        log.error("NEXUS_CHANNEL_ID not set")
        return

    log.info(f"NEXUS Alert Bot  channel={CHANNEL_ID}  level={ST.min_level}+")

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("help",    cmd_help))
    app.add_handler(CommandHandler("status",  cmd_status))
    app.add_handler(CommandHandler("zone",    cmd_zone))
    app.add_handler(CommandHandler("level",   cmd_level))
    app.add_handler(CommandHandler("sources", cmd_sources))

    async with app:
        await app.start()
        await app.updater.start_polling(drop_pending_updates=True)
        await poll_loop(app.bot)
        await app.updater.stop()
        await app.stop()

if __name__ == "__main__":
    asyncio.run(run())
