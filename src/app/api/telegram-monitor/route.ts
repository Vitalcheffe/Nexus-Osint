import { NextResponse } from "next/server";

/**
 * Telegram Bot Status Monitor
 * GET /api/telegram-monitor
 *
 * Returns the configuration status of the NEXUS Telegram alert bot.
 * Does NOT attempt to call the Telegram API — it only reads env vars.
 * The actual bot runs as a separate process (scripts/nexus_alert_bot.py).
 *
 * Required env vars:
 *   NEXUS_BOT_TOKEN    — BotFather token
 *   NEXUS_CHANNEL_ID   — Channel ID (@handle or -100xxxxxxxxxx)
 *   NEXUS_API_URL      — Next.js base URL (e.g. https://nexus.onrender.com)
 *
 * Optional:
 *   BOT_MIN_LEVEL      — minimum alert level to publish (default 7)
 *   BOT_COOLDOWN_SEC   — per-zone cooldown in seconds (default 30)
 */
export async function GET() {
  const token     = process.env.NEXUS_BOT_TOKEN;
  const channelId = process.env.NEXUS_CHANNEL_ID;
  const apiUrl    = process.env.NEXUS_API_URL;
  const minLevel  = process.env.BOT_MIN_LEVEL    ?? "7";
  const cooldown  = process.env.BOT_COOLDOWN_SEC ?? "30";

  const configured = !!(token && channelId && apiUrl);

  return NextResponse.json({
    configured,
    status: configured ? "ready" : "unconfigured",
    channel: channelId ?? null,
    minLevel: parseInt(minLevel, 10),
    cooldownSec: parseInt(cooldown, 10),
    notice: configured
      ? "Bot environment is configured. Start scripts/nexus_alert_bot.py to activate."
      : "Set NEXUS_BOT_TOKEN + NEXUS_CHANNEL_ID + NEXUS_API_URL to enable Telegram alerts.",
    missingVars: [
      !token     && "NEXUS_BOT_TOKEN",
      !channelId && "NEXUS_CHANNEL_ID",
      !apiUrl    && "NEXUS_API_URL",
    ].filter(Boolean),
  });
}
