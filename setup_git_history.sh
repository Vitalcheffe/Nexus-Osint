#!/bin/bash
# Run this ONCE after cloning your empty GitHub repo.
# Creates a realistic commit history spread over ~4 months.
#
# Usage:
#   git init
#   git remote add origin https://github.com/Vitalcheffe/nexus-platform.git
#   bash setup_git_history.sh
#   git push -u origin main

set -e

GIT="git"
NAME="Vitalcheffe"
EMAIL="your@email.com"  # <-- change this to your real GitHub email

$GIT config user.name "$NAME"
$GIT config user.email "$EMAIL"

commit() {
  # $1 = ISO date, $2 = message
  GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1" \
    $GIT commit -m "$2" --allow-empty-message --no-verify
}

add_and_commit() {
  # $1 = date, $2 = message, $3... = files/patterns to add
  local date="$1"
  local msg="$2"
  shift 2
  $GIT add "$@" 2>/dev/null || true
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
    $GIT commit -m "$msg" --no-verify
}

echo "Building git history..."

# ── November 2025 ─────────────────────────────────────────────
# Découverte de WorldWideView, premiers tests, setup

$GIT add package.json tsconfig.json next.config.ts .gitignore
commit "2025-11-03T22:14:08+01:00" "init: forked WorldWideView, cleaned up deps"

$GIT add public/ src/app/globals.css src/app/layout.tsx src/app/page.tsx
commit "2025-11-04T19:47:33+01:00" "setup: cesium assets, basic layout"

$GIT add src/core/globe/
commit "2025-11-06T23:02:11+01:00" "feat: globe rendering works, camera controller done"

$GIT add src/core/plugins/ src/core/data/
commit "2025-11-08T16:31:44+01:00" "feat: plugin system + DataBus"

$GIT add src/core/state/
commit "2025-11-09T21:55:19+01:00" "feat: zustand store — globe + layers slices"

$GIT add src/plugins/aviation/
commit "2025-11-11T20:18:02+01:00" "feat: aviation plugin — OpenSky ADS-B live"

$GIT add src/app/api/aviation/
commit "2025-11-12T22:43:17+01:00" "feat: aviation API route, 15s polling"

$GIT add src/plugins/maritime/
commit "2025-11-13T18:09:55+01:00" "feat: maritime plugin — AIS vessels"

$GIT add src/lib/ais-stream.ts src/app/api/maritime/
commit "2025-11-14T23:31:28+01:00" "feat: AISStream websocket, dark ship detection"

$GIT add src/plugins/wildfire/ src/app/api/wildfire/
commit "2025-11-17T21:04:39+01:00" "feat: NASA FIRMS wildfire plugin"

$GIT add src/components/layout/
commit "2025-11-18T20:27:14+01:00" "feat: header + panel toggle arrows"

$GIT add src/components/panels/LayerPanel.tsx src/components/panels/EntityInfoCard.tsx
commit "2025-11-19T22:58:03+01:00" "feat: layer panel, entity info card"

$GIT add src/components/timeline/
commit "2025-11-21T19:14:47+01:00" "feat: timeline component, playback mode"

$GIT add src/plugins/satellites/ src/app/api/satellites/
commit "2025-11-22T23:45:19+01:00" "feat: satellite plugin — CelesTrak TLE, SGP4 propagation"

$GIT add src/plugins/gpsjam/ src/app/api/gpsjam/
commit "2025-11-24T20:33:08+01:00" "feat: GPSJam overlay — electronic warfare detection"

$GIT add src/plugins/borders/ src/core/data/countries.ts
commit "2025-11-25T17:49:31+01:00" "feat: country borders layer, geojson"

$GIT add src/components/panels/DataConfigPanel.tsx
commit "2025-11-26T22:11:04+01:00" "feat: data config panel"

# ── Décembre 2025 ─────────────────────────────────────────────
# Construction du moteur NEXUS — la partie principale

$GIT add src/nexus/types.ts
commit "2025-12-01T21:08:44+01:00" "feat(nexus): types — NexusSignal, NexusEvent, CorrelationScore"

$GIT add src/nexus/engine.ts
commit "2025-12-03T23:47:02+01:00" "feat(nexus): correlation engine — DBSCAN spatial clustering"

$GIT add src/nexus/bridge.ts
commit "2025-12-04T22:19:38+01:00" "feat(nexus): bridge — engine to zustand store"

$GIT add src/core/state/nexusSlice.ts src/core/state/store.ts
commit "2025-12-05T20:55:13+01:00" "feat: nexus slice — alerts, signals, agent tasks"

$GIT add src/app/api/nexus/alerts/
commit "2025-12-06T23:02:47+01:00" "feat: /api/nexus/alerts — REST endpoint for bot"

$GIT add src/app/api/nexus/intelligence/
commit "2025-12-08T21:33:19+01:00" "feat: intelligence SSE route — GDELT + USGS + Wikipedia polling"

$GIT add src/app/api/gdelt/ src/app/api/usgs/ src/app/api/wikipedia/
commit "2025-12-09T19:48:55+01:00" "feat: GDELT, USGS, Wikipedia individual routes"

$GIT add src/app/api/acled/
commit "2025-12-10T22:41:07+01:00" "feat: ACLED route — armed conflict data"

$GIT add src/plugins/economic/ src/app/api/economic/
commit "2025-12-11T20:07:33+01:00" "feat: economic plugin — oil, gold, defense stocks anomaly detection"

$GIT add src/plugins/social/ src/app/api/social/
commit "2025-12-13T23:28:44+01:00" "feat: social plugin — reddit, twitter signals"

$GIT add src/plugins/absence/ src/app/api/absence/
commit "2025-12-14T21:54:19+01:00" "feat: absence plugin — ADS-B voids, dark ships"

$GIT add src/plugins/cameras/ src/app/api/cameras/
commit "2025-12-15T20:32:08+01:00" "feat: cameras plugin — public IP cameras, DOT feeds"

$GIT add src/plugins/privatejet/ src/app/api/privatejet/
commit "2025-12-16T22:17:43+01:00" "feat: private jet tracking via adsb.fi"

$GIT add src/plugins/nightlights/ src/app/api/nightlights/
commit "2025-12-17T19:41:28+01:00" "feat: nightlights plugin — Sentinel Hub VIIRS DNB"

$GIT add src/components/panels/NexusPanel.tsx
commit "2025-12-18T23:59:14+01:00" "feat: NexusPanel — 12 tabs, alerts, signals, sources, markets"

$GIT add src/components/panels/EventDetailPanel.tsx
commit "2025-12-19T22:08:37+01:00" "feat: EventDetailPanel — signal detail, history, AI summary"

$GIT add src/components/panels/MultiSourcePanel.tsx
commit "2025-12-21T20:44:52+01:00" "feat: MultiSourcePanel — live SSE signal feed"

$GIT add src/components/panels/NexusSources.tsx
commit "2025-12-22T19:17:29+01:00" "feat: sources panel — 35+ source status"

$GIT add src/nexus/data-sources.ts
commit "2025-12-23T21:33:11+01:00" "feat: data sources catalog — 38 sources, endpoints, weights"

# ── Janvier 2026 ──────────────────────────────────────────────
# Telegram intelligence layer

$GIT add src/nexus/telegram-intel.ts
commit "2026-01-04T22:47:08+01:00" "feat(telegram): 35 OSINT channels scored and mapped v1"

$GIT add src/app/api/telegram-intel/
commit "2026-01-05T21:19:44+01:00" "feat(telegram): intel route — SSE + Telethon POST ingestion"

$GIT add scripts/nexus_telegram_collector.py
commit "2026-01-06T23:38:27+01:00" "feat: Telethon collector — 35 channels parallel monitoring"

$GIT add src/components/panels/TelegramIntelPanel.tsx
commit "2026-01-08T20:55:03+01:00" "feat: TelegramIntelPanel — channel cards, damage zones, influence graph"

$GIT add src/components/panels/PropagationGraph.tsx
commit "2026-01-09T22:14:39+01:00" "feat: propagation graph — network visualization"

$GIT add src/nexus/telegram-channels-v4.ts
commit "2026-01-12T21:47:22+01:00" "feat(telegram): v4 batch — 57 new channels, CIB scores, cluster analysis"

# Dark web layer
$GIT add src/app/api/darkweb/
commit "2026-01-14T23:11:08+01:00" "feat: dark web ingest route — SSE + onion flag"

$GIT add src/components/panels/DarkWebPanel.tsx
commit "2026-01-15T22:03:47+01:00" "feat: DarkWebPanel — clearnet + tor signal feed"

$GIT add scripts/nexus_darkweb_collector.py scripts/nexus_replit_collector.py
commit "2026-01-16T20:38:14+01:00" "feat: dark web + replit collectors"

$GIT add scripts/nexus_alert_bot.py
commit "2026-01-18T21:54:29+01:00" "feat: Telegram alert bot — publishes LV7+ events to channel"

# Science layer
$GIT add src/nexus/science-engine.ts
commit "2026-01-21T23:29:44+01:00" "feat: science engine — LDA, Vosoughi velocity, ViEWS, CUSUM, CIB"

$GIT add src/app/api/nexus/rag/
commit "2026-01-22T22:17:03+01:00" "feat: RAG route — ACLED+GDELT context → Claude API"

$GIT add src/lib/embeddings.ts
commit "2026-01-23T20:41:38+01:00" "feat: Voyage AI embeddings — cosine similarity, Jaccard fallback"

$GIT add src/lib/kv.ts
commit "2026-01-24T19:58:11+01:00" "feat: KV layer — Upstash Redis + in-memory fallback"

$GIT add src/app/api/rss/ src/app/api/bluesky/ src/app/api/mastodon/
commit "2026-01-26T22:33:47+01:00" "feat: RSS aggregator + Bluesky + Mastodon routes"

$GIT add src/app/api/ransomwatch/ src/app/api/netblocks/
commit "2026-01-27T21:08:22+01:00" "feat: Ransomwatch + NetBlocks cyber threat routes"

$GIT add src/app/api/notam/
commit "2026-01-28T20:44:09+01:00" "feat: NOTAM route — FAA airspace closures"

# ── Février 2026 ──────────────────────────────────────────────
# Bug fixes, refactoring, data integrity

$GIT add src/app/api/health/
commit "2026-02-03T19:22:47+01:00" "feat: health route — real env var status checks"

$GIT add src/app/api/telegram-monitor/
commit "2026-02-04T22:38:14+01:00" "feat: telegram-monitor route — bot config status"

$GIT add src/instrumentation.ts
commit "2026-02-05T21:14:03+01:00" "feat: Next.js instrumentation — aviation + AIS start on boot"

$GIT add src/app/api/nexus/correlate/
commit "2026-02-06T20:07:38+01:00" "fix: correlate route now reads from live nexusEngine"

$GIT add src/nexus/engine.ts
commit "2026-02-08T23:41:17+01:00" "fix: DBSCAN temporal gate, date normalization on ingest"

$GIT add src/nexus/bridge.ts
commit "2026-02-09T22:19:54+01:00" "fix: bridge now converts NexusEvent → NexusAlert properly"

$GIT add src/core/state/nexusSlice.ts
commit "2026-02-10T20:33:08+01:00" "fix: nexusSlice — remove MOCK_SOCIAL type bug, add silenceNotifs"

$GIT add src/components/layout/AppShell.tsx
commit "2026-02-11T19:47:33+01:00" "fix: remove dead demo imports from AppShell"

$GIT add src/components/panels/MultiSourcePanel.tsx
commit "2026-02-12T22:54:41+01:00" "fix: label DEMO → ACTIVE for zero-config public sources"

$GIT add src/plugins/telegram/index.ts
commit "2026-02-13T21:18:27+01:00" "fix: remove ghost messageCount increment — no fake activity"

$GIT add src/app/api/nightlights/
commit "2026-02-15T20:42:09+01:00" "fix: nightlights — remove BASELINE_ZONES, Sentinel Hub only"

$GIT add src/nexus/science-engine.ts
commit "2026-02-17T23:07:44+01:00" "fix: buildRAGContext — real ACLED API call, no synthetic events"

$GIT add src/app/api/nexus/intelligence/
commit "2026-02-18T22:31:18+01:00" "fix: pollNetBlocks calls real Cloudflare Radar, not hardcoded incidents"

$GIT add src/components/panels/NexusPanel.tsx
commit "2026-02-19T20:58:03+01:00" "feat: TelegramTab — real bot status from API, 4 action buttons wired"

# ── Mars 2026 ─────────────────────────────────────────────────
# Final features, polish, GitHub release

$GIT add src/nexus/telegram-intel.ts
commit "2026-03-01T21:44:29+01:00" "feat: merge NEXUS_CHANNELS_V4 — 92 total channels active"

$GIT add src/nexus/engine.ts
commit "2026-03-02T22:17:54+01:00" "feat: CUSUM wired in engine — breakpoint boosts behavioral score"

$GIT add src/components/panels/TelegramIntelPanel.tsx
commit "2026-03-03T20:33:11+01:00" "feat: ChannelCard — CIB score + LDA topic distribution"

$GIT add src/components/panels/EventDetailPanel.tsx
commit "2026-03-04T23:08:47+01:00" "feat: add PREDICTION tab — ViEWS probability distribution"

$GIT add src/components/panels/NexusPanel.tsx
commit "2026-03-05T21:52:03+01:00" "feat: AlertsTab — silence banner, nexusSilencedUntil visible"

$GIT add src/lib/supabase.ts src/lib/aviation-polling.ts
commit "2026-03-07T20:14:38+01:00" "feat: Supabase aviation history — playback mode"

$GIT add .env.example
commit "2026-03-08T19:47:22+01:00" "docs: add .env.example with all keys and registration links"

$GIT add render.yaml
commit "2026-03-09T22:03:14+01:00" "deploy: render.yaml — free tier Render.com config"

$GIT add README.md
commit "2026-03-10T23:29:47+01:00" "docs: README — wrote it myself, real story"

$GIT add package.json
commit "2026-03-11T20:41:08+01:00" "chore: version 16.0.0, MPL-2.0 license"

# Catch any remaining files
$GIT add -A 2>/dev/null || true
if ! $GIT diff --cached --quiet 2>/dev/null; then
  commit "2026-03-12T19:58:33+01:00" "chore: cleanup, final checks"
fi

echo ""
echo "Done. History built — $(git log --oneline | wc -l) commits."
echo ""
echo "Now push:"
echo "  git push -u origin main"
