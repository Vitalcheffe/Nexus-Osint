/**
 * NEXUS Telegram Intelligence API
 * POST /api/telegram-intel
 * 
 * Reçoit les messages du collecteur Python (Telethon),
 * applique le moteur de scoring IA multi-dimensionnel,
 * et pousse les résultats vers le store Zustand via SSE.
 * 
 * FONDEMENT: MIT Vosoughi/Roy/Aral (Science 2018)
 * → Les fausses nouvelles se propagent 6x plus vite que les vraies
 * → La NOUVEAUTÉ et l'ÉMOTION sont les vecteurs principaux
 * → Solution: scorer la primauté + la corroboration croisée
 */

import { NextRequest, NextResponse } from "next/server";
import { NEXUS_CHANNELS, computeChannelScore, detectPrimacy, DAMAGE_ZONES } from "@/nexus/telegram-intel";
import { nexusEngine } from "@/nexus/engine";
import { dataBus } from "@/core/data/DataBus";

// ── Coordonnées approximatives des zones ─────────────────────────────
const ZONE_COORDS: Record<string, [number, number]> = {
  "Tel Aviv": [32.08, 34.78],
  "Gaza": [31.5, 34.45],
  "Liban": [33.89, 35.5],
  "Lebanon": [33.89, 35.5],
  "Iran": [35.69, 51.39],
  "Détroit d'Ormuz": [26.5, 56.5],
  "Strait of Hormuz": [26.5, 56.5],
  "Ukraine": [49.0, 32.0],
  "Mer Rouge": [15.0, 43.0],
  "Red Sea": [15.0, 43.0],
  "Syrie": [33.51, 36.29],
  "Syria": [33.51, 36.29],
  "Irak": [33.34, 44.40],
  "Iraq": [33.34, 44.40],
  "Moscou": [55.75, 37.62],
  "Moscow": [55.75, 37.62],
  "Taiwan": [25.0, 121.5],
  "Sahel": [17.57, -3.99],
  "Global": [20.0, 10.0],
};

// ── Store en mémoire (Next.js edge -- remplacer par Redis en prod) ──
const messageBuffer: any[] = [];
const eventClusters = new Map<string, any[]>();
const channelStats = new Map<string, { total: number; primacy: number; accuracy: number }>();

// SSE subscribers
const subscribers = new Set<ReadableStreamDefaultController>();

// ── GET -- Server-Sent Events stream ───────────────────────────────
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      subscribers.add(controller);
      controller.enqueue(`data: ${JSON.stringify({ type: "connected", channels: NEXUS_CHANNELS.length })}\n\n`);
    },
    cancel(controller) {
      subscribers.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// ── POST -- Ingestion depuis Telethon ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const msg = await req.json();
    
    // ── 1. Enrichissement IA ─────────────────────────────────────
    const enriched = enrichMessage(msg);
    
    // ── 2. Envoyer au moteur NEXUS pour générer des alertes ───────
    if (enriched.zone && enriched.lat === undefined) {
      // Assigner des coordonnées approximatives basées sur la zone
      const zoneCoords = ZONE_COORDS[enriched.zone];
      if (zoneCoords) {
        enriched.lat = zoneCoords[0];
        enriched.lng = zoneCoords[1];
      }
    }
    
    // Créer un signal pour le moteur NEXUS
    const nexusSignal = {
      id: enriched.id || `tg-${msg.channel}-${Date.now()}`,
      source: "social_telegram" as const,
      description: enriched.text || enriched.translated_text || "",
      lat: enriched.lat || 25.0,
      lng: enriched.lng || 45.0,
      eventTime: new Date(enriched.timestamp || Date.now()),
      ingestTime: new Date(),
      confidence: enriched.confidence_score || 0.5,
      tags: enriched.tags || [],
      payload: {
        channel: msg.channel,
        channelHandle: msg.channel,
        channelTier: enriched.channel_tier,
        channelBias: enriched.channel_bias,
        primacyRank: enriched.primacy_rank,
        isRepost: enriched.is_repost,
        isForward: enriched.is_forward,
        originalLanguage: enriched.original_language,
        zone: enriched.zone,
        nexusLevel: enriched.nexus_level,
      },
    };
    
    // Injecter dans le moteur NEXUS pour créer des alertes
    nexusEngine.ingest(nexusSignal);
    
    // Aussi émettre via DataBus pour les panels UI
    dataBus.emit("telegramSignal", enriched);
    
    // ── 3. Mise à jour du cluster événement ─────────────────────
    if (enriched.event_hash) {
      const cluster = eventClusters.get(enriched.event_hash) || [];
      cluster.push(enriched);
      eventClusters.set(enriched.event_hash, cluster);
      
      // Re-calculer primauté pour tout le cluster
      if (cluster.length >= 2) {
        const primacy = detectPrimacy(cluster.map(m => ({
          channelId: m.channel,
          msgId: m.msg_id,
          timestamp: new Date(m.timestamp),
          text: m.text,
          forwardedFrom: m.forward_from,
        })));
        
        if (primacy) {
          // Mettre à jour le rang de primauté dans le cluster
          cluster.forEach(m => {
            const rank = primacy.chainOrder.findIndex(c => c.channelId === m.channel) + 1;
            m.primacy_rank = rank || m.primacy_rank;
            m.propagation_delay = primacy.chainOrder.find(c => c.channelId === m.channel)?.delaySeconds || 0;
          });
        }
      }
    }
    
    // ── 4. Mise à jour stats canal ───────────────────────────────
    const stats = channelStats.get(msg.channel) || { total: 0, primacy: 0, accuracy: 0 };
    stats.total++;
    if (enriched.primacy_rank === 1) stats.primacy++;
    channelStats.set(msg.channel, stats);
    
    // ── 5. Buffer + broadcast SSE ────────────────────────────────
    messageBuffer.unshift(enriched);
    if (messageBuffer.length > 1000) messageBuffer.pop();
    
    const event = JSON.stringify({ type: "message", data: enriched });
    subscribers.forEach(ctrl => {
      try { ctrl.enqueue(`data: ${event}\n\n`); }
      catch { subscribers.delete(ctrl); }
    });
    
    return NextResponse.json({ ok: true, id: enriched.id, score: enriched.confidence_score, ingested: true });
    
  } catch (error) {
    console.error("[telegram-intel] POST error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// ── Enrichissement IA ─────────────────────────────────────────────
function enrichMessage(msg: any) {
  const channel = NEXUS_CHANNELS.find(c => c.handle === msg.channel || c.id === msg.channel);
  
  // Score confiance composite (6 dimensions Bellingcat/Harvard)
  const channelScore = channel ? computeChannelScore(channel) : 50;
  
  // Facteurs dynamiques
  const repostPenalty = msg.is_repost ? -20 : 0;
  const forwardPenalty = msg.is_forward && !msg.is_repost ? -8 : 0;
  const mediaBonus = msg.has_media ? +5 : 0;
  const translationBonus = msg.original_language !== "en" ? +8 : 0; // Contenu proche source
  const primacyBonus = msg.primacy_rank === 1 ? +10 : msg.primacy_rank <= 3 ? +3 : 0;
  
  // MIT Vosoughi finding: messages courts et émotionnels = haute vélocité de propagation
  // → Un message qui se propage vite N'EST PAS forcément vrai
  const viralityWarning = msg.text && msg.text.split(" ").length < 15 ? "SHORT_HIGH_VIRALITY" : null;
  
  // Score final
  const rawScore = channelScore + repostPenalty + forwardPenalty + mediaBonus + translationBonus + primacyBonus;
  const finalScore = Math.max(0, Math.min(100, rawScore));
  
  // Détection zone de dommages
  const nearestDamage = findNearestDamageZone(msg.zone);
  
  // Niveau d'alerte NEXUS
  const nexusLevel = scoreToLevel(finalScore, msg.level);
  
  return {
    ...msg,
    credibility_score: finalScore,
    confidence_score: finalScore / 100,
    channel_meta: channel ? {
      name: channel.name,
      tier: channel.tier,
      bias: channel.bias,
      firstMoverScore: channel.firstMoverScore,
      medianLeadTimeMinutes: channel.medianLeadTimeMinutes,
      warningFlags: channel.warningFlags,
    } : null,
    nexus_level: nexusLevel,
    virality_warning: viralityWarning,
    damage_zone: nearestDamage,
    score_breakdown: {
      channel_base: channelScore,
      repost_penalty: repostPenalty,
      forward_penalty: forwardPenalty,
      media_bonus: mediaBonus,
      translation_bonus: translationBonus,
      primacy_bonus: primacyBonus,
    },
    processed_at: new Date().toISOString(),
  };
}

function findNearestDamageZone(zoneName: string | null): string | null {
  if (!zoneName) return null;
  const match = DAMAGE_ZONES.find(dz => 
    dz.name.toLowerCase().includes(zoneName.toLowerCase()) ||
    (dz.country && zoneName.toLowerCase().includes(dz.country.toLowerCase()))
  );
  return match?.id || null;
}

function scoreToLevel(credScore: number, rawLevel: number): number {
  // Pondérer le niveau brut par le score de crédibilité
  const credMultiplier = credScore / 100;
  const weightedLevel = rawLevel * credMultiplier;
  return Math.round(Math.min(10, Math.max(1, weightedLevel)));
}

// ── GET messages buffer ───────────────────────────────────────────
export async function PATCH() {
  return NextResponse.json({
    messages: messageBuffer.slice(0, 200),
    stats: Object.fromEntries(channelStats),
    eventClusters: Array.from(eventClusters.entries()).map(([hash, msgs]) => ({
      hash,
      count: msgs.length,
      firstChannel: msgs.sort((a,b) => a.msg_id - b.msg_id)[0]?.channel,
      zone: msgs[0]?.zone,
    })),
  });
}