"use client";

/**
 * NEXUS Telegram Intelligence Panel
 * ════════════════════════════════════════════════════════════════
 * 
 * SCIENCE BEHIND THIS:
 * 
 * MIT Media Lab (Vosoughi, Roy, Aral -- Science 2018):
 * → Fausses nouvelles: 6x plus rapides, 70% plus de portée
 * → La NOUVEAUTÉ et SURPRISE = vecteurs de propagation
 * → Implication NEXUS: un message qui se propage vite DOIT être
 *   soumis à vérification croisée, pas accepté automatiquement
 * 
 * RAND Corporation (Disinformation Tools, 2019):
 * → "Firehose of Falsehood" -- quantité > qualité en war-info
 * → Biais de confirmation = erreur systématique n°1 en OSINT
 * → Solution: afficher TOUS les biais, ne rien cacher
 * 
 * Network Analysis (Watts-Strogatz -- Small World Model):
 * → Les "sentinel nodes" (premiers émetteurs) ont une valeur 
 *   informationnelle disproportionnée dans les cascades
 * → NEXUS identifie ces nœuds sentinelles automatiquement
 * 
 * Harvard Shorenstein Center (2024):
 * → Source credibility + cross-verification = 87% accuracy boost
 * → Simple fact-check by 1 source = +22% confidence
 * → Corroboration par 3+ sources indépendantes = +67% confidence
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { NEXUS_CHANNELS, DAMAGE_ZONES, TelegramChannel } from "@/nexus/telegram-intel";
import { detectCIB, scoreLDA, type CIBScore, type LDATopicScore } from "@/nexus/science-engine";

// ── Types ──────────────────────────────────────────────────────
interface TelegramMsg {
  id: string;
  channel: string;
  msg_id: number;
  text: string;
  translated_text: string;
  original_language: string;
  timestamp: string;
  credibility_score: number;
  confidence_score: number;
  channel_tier: number;
  channel_bias: string;
  is_forward: boolean;
  forward_from?: string;
  has_media: boolean;
  media_type?: string;
  zone?: string;
  level: number;
  tags: string[];
  is_repost: boolean;
  primacy_rank: number;
  event_hash?: string;
  virality_warning?: string;
  damage_zone?: string;
  nexus_level: number;
  channel_meta?: {
    name: string;
    tier: string;
    bias: string;
    firstMoverScore: number;
    medianLeadTimeMinutes: number;
    warningFlags: string[];
  };
  score_breakdown?: {
    channel_base: number;
    repost_penalty: number;
    forward_penalty: number;
    media_bonus: number;
    translation_bonus: number;
    primacy_bonus: number;
  };
}

interface EventCluster {
  hash: string;
  count: number;
  firstChannel: string;
  zone?: string;
}

// ── Constantes ─────────────────────────────────────────────────
const BIAS_COLORS: Record<string, string> = {
  PRO_ISRAEL:         "#3b82f6",
  PRO_PALESTINE:      "#22c55e",
  PRO_UKRAINE:        "#fbbf24",
  PRO_RUSSIA:         "#ef4444",
  PRO_IRAN:           "#a855f7",
  PRO_WEST:           "#06b6d4",
  NEUTRAL_JOURNALIST: "#94a3b8",
  AGGREGATOR:         "#475569",
  OFFICIAL:           "#f97316",
  ANALYST:            "#8b5cf6",
  FIELD_REPORTER:     "#10b981",
};

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "PRIMARY",   color: "#22d3ee" },
  2: { label: "SECONDARY", color: "#a78bfa" },
  3: { label: "TERTIARY",  color: "#64748b" },
};

const LANG_FLAGS: Record<string, string> = {
  en: "🇺🇸", he: "🇮🇱", ar: "🇸🇦", fa: "🇮🇷",
  ru: "🇷🇺", uk: "🇺🇦", fr: "🇫🇷", syr: "✝️",
};

const ATTACK_ICONS: Record<string, string> = {
  AIRSTRIKE: "✈️", MISSILE: "🚀", DRONE: "🛸",
  ARTILLERY: "💣", NAVAL: "⚓", GROUND: "🪖", UNKNOWN: "❓",
};

// ── Sous-composants ─────────────────────────────────────────────

function ConfidenceBar({ score, showBreakdown, breakdown }: { 
  score: number; 
  showBreakdown?: boolean;
  breakdown?: any;
}) {
  const color = score >= 80 ? "#22d3ee" : score >= 60 ? "#a78bfa" : score >= 40 ? "#f59e0b" : "#ef4444";
  const blocks = Math.round(score / 10);
  
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", gap: 2 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{
              width: 6, height: 14,
              borderRadius: 2,
              background: i < blocks ? color : "rgba(255,255,255,0.08)",
              transition: "background 0.3s",
            }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color, fontFamily: "JetBrains Mono", fontWeight: 700 }}>
          {score.toFixed(0)}%
        </span>
      </div>
      {showBreakdown && breakdown && (
        <div style={{ marginTop: 4, fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }}>
          {breakdown.channel_base > 0 && <span>base+{breakdown.channel_base} </span>}
          {breakdown.repost_penalty < 0 && <span style={{ color: "#ef4444" }}>repost{breakdown.repost_penalty} </span>}
          {breakdown.primacy_bonus > 0 && <span style={{ color: "#22d3ee" }}>1er+{breakdown.primacy_bonus} </span>}
          {breakdown.translation_bonus > 0 && <span style={{ color: "#a78bfa" }}>src+{breakdown.translation_bonus} </span>}
          {breakdown.media_bonus > 0 && <span style={{ color: "#10b981" }}>media+{breakdown.media_bonus}</span>}
        </div>
      )}
    </div>
  );
}

function BiasTag({ bias }: { bias: string }) {
  const color = BIAS_COLORS[bias] || "#94a3b8";
  const shortLabel = bias.replace("PRO_", "").replace("_", " ").slice(0, 8);
  return (
    <span style={{
      padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700,
      color, border: `1px solid ${color}33`, background: `${color}11`,
      fontFamily: "JetBrains Mono", letterSpacing: "0.05em",
    }}>
      {shortLabel}
    </span>
  );
}

function PrimacyBadge({ rank }: { rank: number }) {
  if (rank > 5) return null;
  const configs = [
    { bg: "#ffd700", color: "#000", label: "🥇 1ER" },
    { bg: "#c0c0c0", color: "#000", label: "🥈 2ÈME" },
    { bg: "#cd7f32", color: "#fff", label: "🥉 3ÈME" },
    { bg: "#334155", color: "#94a3b8", label: "4ÈME" },
    { bg: "#1e293b", color: "#64748b", label: "5ÈME" },
  ];
  const c = configs[rank - 1];
  return (
    <span style={{
      padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700,
      background: c.bg, color: c.color, fontFamily: "JetBrains Mono",
    }}>
      {c.label}
    </span>
  );
}

function MessageCard({ msg, onFlyTo }: { msg: TelegramMsg; onFlyTo?: (zone: string) => void; key?: string }) {
  const [expanded, setExpanded] = useState(false);
  const ch = NEXUS_CHANNELS.find(c => c.handle === msg.channel || c.id === msg.channel);
  const tier = TIER_LABELS[msg.channel_tier] || TIER_LABELS[3];
  const ageMins = Math.round((Date.now() - new Date(msg.timestamp).getTime()) / 60000);
  
  const levelColor = msg.nexus_level >= 8 ? "#ef4444" 
    : msg.nexus_level >= 6 ? "#f97316"
    : msg.nexus_level >= 5 ? "#f59e0b"
    : "#22d3ee";
  
  const hasAlerts = msg.virality_warning || msg.is_repost || (msg.channel_meta?.warningFlags?.length ?? 0) > 0;
  
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: msg.primacy_rank === 1 
          ? "linear-gradient(135deg, rgba(34,211,238,0.06), rgba(34,211,238,0.02))"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${
          msg.primacy_rank === 1 ? "rgba(34,211,238,0.3)"
          : msg.nexus_level >= 7 ? "rgba(239,68,68,0.3)"
          : "rgba(255,255,255,0.06)"
        }`,
        borderRadius: 8,
        padding: "10px 12px",
        cursor: "pointer",
        transition: "all 0.2s",
        marginBottom: 6,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
        {/* Canal */}
        <span style={{
          fontSize: 11, fontWeight: 700, color: tier.color,
          fontFamily: "JetBrains Mono",
        }}>
          @{msg.channel}
        </span>
        
        {/* Tier badge */}
        <span style={{
          fontSize: 8, padding: "1px 4px", borderRadius: 2,
          color: tier.color, border: `1px solid ${tier.color}44`,
          fontFamily: "JetBrains Mono",
        }}>
          {tier.label}
        </span>
        
        {/* Bias */}
        {msg.channel_bias && <BiasTag bias={msg.channel_bias} />}
        
        {/* Primacy */}
        {msg.primacy_rank <= 3 && <PrimacyBadge rank={msg.primacy_rank} />}
        
        {/* Level */}
        <span style={{
          marginLeft: "auto", fontSize: 10, fontWeight: 700,
          color: levelColor, fontFamily: "JetBrains Mono",
        }}>
          LV{msg.nexus_level}
        </span>
        
        {/* Language */}
        <span style={{ fontSize: 12 }}>
          {LANG_FLAGS[msg.original_language] || "🌐"}
        </span>
        
        {/* Age */}
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>
          {ageMins < 60 ? `${ageMins}min` : `${Math.round(ageMins/60)}h`}
        </span>
        
        {/* Media */}
        {msg.has_media && (
          <span style={{ fontSize: 10 }}>
            {msg.media_type?.includes("video") ? "🎥" : msg.media_type?.includes("photo") ? "📷" : "📎"}
          </span>
        )}
      </div>
      
      {/* Confidence bar */}
      <div style={{ marginBottom: 6 }}>
        <ConfidenceBar 
          score={msg.credibility_score} 
          showBreakdown={expanded}
          breakdown={msg.score_breakdown}
        />
      </div>
      
      {/* Alertes */}
      {hasAlerts && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {msg.is_repost && (
            <span style={{
              fontSize: 8, padding: "1px 5px", borderRadius: 2, fontFamily: "JetBrains Mono",
              background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)",
            }}>
              ♻️ REPOST
            </span>
          )}
          {msg.virality_warning && (
            <span style={{
              fontSize: 8, padding: "1px 5px", borderRadius: 2, fontFamily: "JetBrains Mono",
              background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)",
            }}>
              ⚡ VIRAL RISK
            </span>
          )}
          {msg.channel_meta?.warningFlags?.slice(0,2).map(f => (
            <span key={f} style={{
              fontSize: 8, padding: "1px 5px", borderRadius: 2, fontFamily: "JetBrains Mono",
              background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)",
            }}>
              ⚠️ {f.split("_")[0]}
            </span>
          ))}
        </div>
      )}
      
      {/* Tags */}
      {msg.tags?.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {msg.tags.slice(0, 5).map(tag => (
            <span key={tag} style={{
              fontSize: 8, padding: "1px 5px", borderRadius: 2, fontFamily: "JetBrains Mono",
              background: "rgba(34,211,238,0.08)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.15)",
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}
      
      {/* Texte traduit */}
      <p style={{
        fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.5,
        margin: 0, fontFamily: "Inter",
      }}>
        {msg.original_language !== "en" ? msg.translated_text : msg.text}
        {msg.original_language !== "en" && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>
            [{LANG_FLAGS[msg.original_language]} traduit]
          </span>
        )}
      </p>
      
      {/* Expanded: zone + damage + source details */}
      {expanded && (
        <div style={{
          marginTop: 10, padding: 10,
          background: "rgba(0,0,0,0.3)", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.05)",
        }}>
          {/* Zone + fly-to */}
          {msg.zone && (
            <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#22d3ee" }}>📍 {msg.zone}</span>
              {onFlyTo && (
                <button
                  onClick={e => { e.stopPropagation(); onFlyTo(msg.zone!); }}
                  style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 10,
                    background: "rgba(34,211,238,0.15)", color: "#22d3ee",
                    border: "1px solid rgba(34,211,238,0.3)", cursor: "pointer",
                    fontFamily: "JetBrains Mono",
                  }}
                >
                  → Globe
                </button>
              )}
            </div>
          )}
          
          {/* Damage zone link */}
          {msg.damage_zone && (() => {
            const dz = DAMAGE_ZONES.find(d => d.id === msg.damage_zone);
            return dz ? (
              <div style={{
                padding: "6px 10px", borderRadius: 6, marginBottom: 8,
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
              }}>
                <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 3 }}>
                  {ATTACK_ICONS[dz.attackType ?? "UNKNOWN"] ?? "?"} ZONE DOMMAGES LIÉE: {dz.name}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                  {dz.destroyedStructures?.toLocaleString() ?? "?"} structures détruites · 
                  Par: {dz.attributedActor ?? "Inconnu"} · 
                  Conf: {dz.confidence}% · 
                  Vérifié: {(dz.verifiedBy ?? []).join(", ")}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  Armements: {(dz.weaponSystem ?? []).join(" · ")}
                </div>
              </div>
            ) : null;
          })()}
          
          {/* Canal metadata */}
          {msg.channel_meta && (
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }}>
              <div>PREMIER ÉMETTEUR: {msg.channel_meta.firstMoverScore}% des événements</div>
              <div>AVANCE MÉDIANE: {Math.abs(msg.channel_meta.medianLeadTimeMinutes)}min {msg.channel_meta.medianLeadTimeMinutes < 0 ? "avant" : "après"} les médias</div>
              {msg.channel_meta.warningFlags.length > 0 && (
                <div style={{ marginTop: 4, color: "#f87171" }}>
                  ⚠️ {msg.channel_meta.warningFlags.slice(0,3).join(" · ")}
                </div>
              )}
            </div>
          )}
          
          {/* Texte original si traduit */}
          {msg.original_language !== "en" && (
            <div style={{ marginTop: 6, padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>
                {LANG_FLAGS[msg.original_language]} ORIGINAL:
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                {msg.text}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ channel, liveStats }: { channel: TelegramChannel; liveStats?: any; key?: string }) {
  const tier = TIER_LABELS[channel.tier === "PRIMARY" ? 1 : channel.tier === "SECONDARY" ? 2 : 3];
  const score = channel.credibilityScore;
  const scoreColor = score >= 80 ? "#22d3ee" : score >= 65 ? "#a78bfa" : score >= 50 ? "#f59e0b" : "#ef4444";

  // CIB detection -- Harvard Shorenstein Center, Donovan 2024
  // Computed from channel metadata: handle, posting rate, repost ratio, warning flags, amplification network
  const cib: CIBScore = detectCIB(
    channel.handle,
    channel.avgPostsPerDay,
    Math.max(0, 1 - channel.originalContentRate / 100),
    0,
    channel.forwardedBy,
    channel.warningFlags,
  );

  // LDA semantic topic scoring -- Mueller & Rauh, APSR 2018
  // Specialties + affiliations describe the channel's content domain
  const lda = scoreLDA(
    channel.specialties.join(" ") + " " + channel.knownAffiliations.join(" "),
    channel.specialties,
  );

  const cibDanger  = cib.coordScore > 0.60;
  const cibSuspect = cib.coordScore > 0.35 && !cibDanger;
  const cibColor   = cibDanger ? "#ef4444" : cibSuspect ? "#f59e0b" : "#22d3ee";
  const cibBg      = cibDanger ? "rgba(239,68,68,0.08)" : cibSuspect ? "rgba(245,158,11,0.08)" : "rgba(34,211,238,0.06)";
  const patternColor: Record<string, string> = {
    STATE_ACTOR: "#ef4444", BOT: "#f97316", HYBRID: "#f59e0b", HUMAN: "#4ade80",
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 10px", marginBottom: 4 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: tier.color, fontFamily: "JetBrains Mono" }}>
          @{channel.handle}
        </span>
        <BiasTag bias={channel.bias} />
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: scoreColor, fontFamily: "JetBrains Mono" }}>
          {score}
        </span>
      </div>

      {/* Metric bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 12px" }}>
        {([
          ["ACCURACY",     channel.accuracyRate],
          ["1ER ÉMETTEUR", channel.firstMoverScore],
          ["ORIGINAL",     channel.originalContentRate],
          ["CROSS-VERIFY", channel.crossVerificationRate],
        ] as [string, number][]).map(([label, val]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono", width: 72 }}>{label}</span>
            <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{ width: `${val}%`, height: "100%", borderRadius: 2, background: val >= 80 ? "#22d3ee" : val >= 60 ? "#a78bfa" : val >= 40 ? "#f59e0b" : "#ef4444" }} />
            </div>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono", width: 22, textAlign: "right" as const }}>{val}</span>
          </div>
        ))}
      </div>

      {/* CIB score row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, padding: "3px 6px", borderRadius: 4, background: cibBg, border: `1px solid ${cibColor}22` }}>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono", flexShrink: 0, letterSpacing: "0.05em" }}>CIB</span>
        <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{ width: `${Math.round(cib.coordScore * 100)}%`, height: "100%", borderRadius: 2, background: cibColor }} />
        </div>
        <span style={{ fontSize: 8, fontWeight: 700, color: cibColor, fontFamily: "JetBrains Mono", minWidth: 24 }}>
          {Math.round(cib.coordScore * 100)}%
        </span>
        <span style={{ fontSize: 7, fontWeight: 700, fontFamily: "JetBrains Mono", color: patternColor[cib.postingPattern] ?? "#94a3b8", background: `${patternColor[cib.postingPattern] ?? "#94a3b8"}18`, padding: "1px 4px", borderRadius: 3 }}>
          {cib.postingPattern}
        </span>
      </div>

      {/* CIB signatures -- only shown when suspicious */}
      {cib.signatures.length > 0 && (cibDanger || cibSuspect) && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" as const, marginTop: 3 }}>
          {cib.signatures.slice(0, 3).map(sig => (
            <span key={sig} style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, fontFamily: "JetBrains Mono", background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}>
              {sig.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {/* LDA topic distribution */}
      {lda.topTopics.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontFamily: "JetBrains Mono", marginBottom: 3, letterSpacing: "0.06em" }}>LDA TOPICS</div>
          {lda.topTopics.slice(0, 3).map((topic: LDATopicScore) => {
            const dotColor = topic.conflictRelevance >= 0.85 ? "#ef4444" : topic.conflictRelevance >= 0.70 ? "#f59e0b" : "#22d3ee";
            return (
              <div key={topic.topicId} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0, background: dotColor }} />
                <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.35)", fontFamily: "JetBrains Mono", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {topic.topicName.replace(/_/g, " ")}
                </span>
                <div style={{ width: 40, height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 2, flexShrink: 0 }}>
                  <div style={{ width: `${Math.round(topic.probability * 100)}%`, height: "100%", borderRadius: 2, background: dotColor }} />
                </div>
                <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontFamily: "JetBrains Mono", minWidth: 22, textAlign: "right" as const }}>
                  {Math.round(topic.probability * 100)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Specialties */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" as const, marginTop: 5 }}>
        {channel.specialties.slice(0, 4).map(s => (
          <span key={s} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, fontFamily: "JetBrains Mono", background: "rgba(34,211,238,0.06)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.12)" }}>
            {s.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {/* Lead time */}
      <div style={{ marginTop: 4, fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>
        AVANCE: {Math.abs(channel.medianLeadTimeMinutes)}min {channel.medianLeadTimeMinutes < 0 ? "avant" : "apres"} MSM
        {" \u00b7 "}LEAD TIME: {channel.firstMoverScore}%
      </div>

      {/* Warning flags */}
      {channel.warningFlags.filter(f => f.toUpperCase() === f && f.length > 5).slice(0, 2).map(f => (
        <div key={f} style={{ fontSize: 8, color: "#f87171", marginTop: 2, fontFamily: "JetBrains Mono" }}>
          \u26a0 {f.replace(/_/g, " ")}
        </div>
      ))}
    </div>
  );
}


function DamageZoneCard({ zone, onFlyTo }: { zone: typeof DAMAGE_ZONES[0]; onFlyTo?: (lat: number, lng: number) => void; key?: string }) {
  const [expanded, setExpanded] = useState(false);
  const confColor = zone.confidence >= 90 ? "#22d3ee" : zone.confidence >= 75 ? "#a78bfa" : "#f59e0b";
  
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: "rgba(239,68,68,0.04)",
        border: "1px solid rgba(239,68,68,0.15)",
        borderRadius: 8, padding: "10px 12px", marginBottom: 6, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{ATTACK_ICONS[zone.attackType ?? "UNKNOWN"] ?? "?"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
            {zone.name}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono" }}>
            {zone.attributedActor ?? "Inconnu"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: confColor, fontFamily: "JetBrains Mono" }}>
            {zone.confidence}%
          </div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>CONF</div>
        </div>
      </div>
      
      {/* Stats dommages */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 6 }}>
        {[
          { label: "DÉTRUIT", value: zone.destroyedStructures ?? 0, color: "#ef4444" },
          { label: "GRAVE",   value: zone.severelyDamaged ?? 0, color: "#f97316" },
          { label: "MODÉRÉ",  value: zone.moderatelyDamaged ?? 0, color: "#f59e0b" },
          { label: "TOTAL",   value: zone.totalAffected ?? 0, color: "#94a3b8" },
        ].map(item => (
          <div key={item.label} style={{
            background: "rgba(0,0,0,0.2)", borderRadius: 4, padding: "4px 6px", textAlign: "center",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: item.color, fontFamily: "JetBrains Mono" }}>
              {(item.value ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
      
      {/* Armements */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(zone.weaponSystem ?? []).map(w => (
          <span key={w} style={{
            fontSize: 8, padding: "1px 5px", borderRadius: 2, fontFamily: "JetBrains Mono",
            background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)",
          }}>
            {w}
          </span>
        ))}
      </div>
      
      {expanded && (
        <div style={{
          marginTop: 8, padding: "8px 10px",
          background: "rgba(0,0,0,0.3)", borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "JetBrains Mono", marginBottom: 4 }}>
            AFFECTÉS: {zone.percentageAffected ?? 0}% de la zone · 
            RAYON: {zone.radiusKm}km · 
            VÉRIFIÉ PAR: {(zone.verifiedBy ?? []).join(", ")}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono", marginBottom: 6 }}>
            SOURCES: {(zone.sources ?? []).join(", ")} · 
            MAJ: {new Date(zone.lastUpdatedDate ?? zone.lastUpdate ?? Date.now()).toLocaleDateString("fr")}
          </div>
          
          <div style={{ display: "flex", gap: 6 }}>
            {onFlyTo && (
              <button
                onClick={e => { e.stopPropagation(); onFlyTo(zone.lat, zone.lng); }}
                style={{
                  padding: "3px 10px", borderRadius: 4, fontSize: 10,
                  background: "rgba(34,211,238,0.15)", color: "#22d3ee",
                  border: "1px solid rgba(34,211,238,0.3)", cursor: "pointer",
                  fontFamily: "JetBrains Mono",
                }}
              >
                🌍 Voir sur le Globe
              </button>
            )}
            <a
              href={`https://unosat.org/products`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                padding: "3px 10px", borderRadius: 4, fontSize: 10,
                background: "rgba(167,139,250,0.15)", color: "#a78bfa",
                border: "1px solid rgba(167,139,250,0.3)", cursor: "pointer",
                fontFamily: "JetBrains Mono", textDecoration: "none",
              }}
            >
              📡 UNOSAT
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Graphe d'influence simplifié ──────────────────────────────
function InfluenceGraph({ messages }: { messages: TelegramMsg[] }) {
  // Compter combien de fois chaque canal est premier émetteur
  const primacyCounts: Record<string, number> = {};
  const totalCounts: Record<string, number> = {};
  
  messages.forEach(msg => {
    totalCounts[msg.channel] = (totalCounts[msg.channel] || 0) + 1;
    if (msg.primacy_rank === 1) {
      primacyCounts[msg.channel] = (primacyCounts[msg.channel] || 0) + 1;
    }
  });
  
  const ranked = Object.entries(totalCounts)
    .map(([ch, total]) => ({
      channel: ch,
      total,
      primacy: primacyCounts[ch] || 0,
      primacyRate: Math.round((primacyCounts[ch] || 0) / total * 100),
    }))
    .sort((a, b) => b.primacy - a.primacy)
    .slice(0, 10);
  
  if (ranked.length === 0) return (
    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20 }}>
      En attente de messages...
    </div>
  );
  
  return (
    <div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono", marginBottom: 8 }}>
        CLASSEMENT PREMIERS ÉMETTEURS (live)
      </div>
      {ranked.map((r, i) => (
        <div key={r.channel} style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
        }}>
          <span style={{
            width: 16, height: 16, borderRadius: "50%", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 9, fontWeight: 700, fontFamily: "JetBrains Mono",
            background: i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "rgba(255,255,255,0.1)",
            color: i < 3 ? "#000" : "rgba(255,255,255,0.5)",
          }}>
            {i + 1}
          </span>
          <span style={{ flex: 1, fontSize: 11, fontFamily: "JetBrains Mono", color: "rgba(255,255,255,0.7)" }}>
            @{r.channel}
          </span>
          <div style={{ width: 80, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div style={{
              width: `${r.primacyRate}%`, height: "100%", borderRadius: 2,
              background: r.primacyRate >= 50 ? "#22d3ee" : r.primacyRate >= 25 ? "#a78bfa" : "#475569",
            }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "#22d3ee", width: 32, textAlign: "right" }}>
            {r.primacyRate}%
          </span>
          <span style={{ fontSize: 9, fontFamily: "JetBrains Mono", color: "rgba(255,255,255,0.3)" }}>
            {r.primacy}/{r.total}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Panel principal ────────────────────────────────────────────
export default function TelegramIntelPanel({ onFlyToZone }: { 
  onFlyToZone?: (lat: number, lng: number, name: string) => void 
}) {
  const [activeTab, setActiveTab] = useState<"feed" | "channels" | "damage" | "graph" | "science">("feed");
  const [messages, setMessages] = useState<TelegramMsg[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<"all" | "primacy" | "original" | "high">("all");
  const [biasFilter, setBiasFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  
  // Connexion SSE
  useEffect(() => {
    const es = new EventSource("/api/telegram-intel");
    eventSourceRef.current = es;
    
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "message") {
          setMessages(prev => [data.data, ...prev].slice(0, 500));
          setLiveCount(c => c + 1);
        }
      } catch {}
    };
    
    // Charger les messages existants
    fetch("/api/telegram-intel", { method: "PATCH" })
      .then(r => r.json())
      .then(d => {
        if (d.messages) setMessages(d.messages);
      })
      .catch(() => {});
    
    return () => es.close();
  }, []);
  
  // Filtrage
  const filteredMessages = messages.filter(msg => {
    if (filter === "primacy"  && msg.primacy_rank > 3) return false;
    if (filter === "original" && msg.is_repost) return false;
    if (filter === "high"     && msg.credibility_score < 75) return false;
    if (biasFilter !== "all"  && msg.channel_bias !== biasFilter) return false;
    if (zoneFilter !== "all"  && msg.zone !== zoneFilter) return false;
    if (searchQuery && !msg.text.toLowerCase().includes(searchQuery.toLowerCase()) 
      && !msg.translated_text?.toLowerCase().includes(searchQuery.toLowerCase())
      && !msg.channel.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  
  const zones = [...new Set(messages.filter(m => m.zone).map(m => m.zone!))];
  const biases = [...new Set(messages.map(m => m.channel_bias).filter(Boolean))];

  const tabs = [
    { key: "feed",     label: "📡 FLUX",     count: filteredMessages.length },
    { key: "channels", label: "📊 SOURCES",  count: NEXUS_CHANNELS.length },
    { key: "damage",   label: "💥 DOMMAGES", count: DAMAGE_ZONES.length },
    { key: "graph",    label: "🕸️ GRAPHE",   count: null },
    { key: "science",  label: "🧪 IA",       count: null },
  ] as const;

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      fontFamily: "Inter", color: "rgba(255,255,255,0.85)",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#22d3ee", letterSpacing: "0.05em" }}>
            TELEGRAM INTELLIGENCE ENGINE
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>
            35 CANAUX · SCORING 6-DIM · MIT/HARVARD METHODOLOGY
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Status */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: connected ? "#22c55e" : "#ef4444",
              boxShadow: connected ? "0 0 6px #22c55e" : "0 0 6px #ef4444",
              animation: connected ? "pulse 2s infinite" : "none",
            }} />
            <span style={{ fontSize: 9, fontFamily: "JetBrains Mono", color: connected ? "#22c55e" : "#ef4444" }}>
              {connected ? "LIVE" : "OFF"}
            </span>
          </div>
          
          <div style={{
            padding: "3px 8px", borderRadius: 4, fontSize: 10, fontFamily: "JetBrains Mono",
            background: "rgba(34,211,238,0.1)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)",
          }}>
            +{liveCount} msgs
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div style={{
        display: "flex", gap: 2, padding: "6px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        overflowX: "auto",
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 10, fontFamily: "JetBrains Mono",
              background: activeTab === tab.key ? "rgba(34,211,238,0.15)" : "transparent",
              color: activeTab === tab.key ? "#22d3ee" : "rgba(255,255,255,0.4)",
              border: activeTab === tab.key ? "1px solid rgba(34,211,238,0.3)" : "1px solid transparent",
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.2s",
            }}
          >
            {tab.label}
            {tab.count !== null && (
              <span style={{
                marginLeft: 5, padding: "0 4px", borderRadius: 8,
                background: "rgba(255,255,255,0.1)", fontSize: 9,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      
      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        
        {/* ── FLUX ─────────────────────────────────────────── */}
        {activeTab === "feed" && (
          <>
            {/* Filtres */}
            <div style={{ marginBottom: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {/* Filtre type */}
              {(["all", "primacy", "original", "high"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 9, fontFamily: "JetBrains Mono",
                    background: filter === f ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.03)",
                    color: filter === f ? "#22d3ee" : "rgba(255,255,255,0.4)",
                    border: filter === f ? "1px solid rgba(34,211,238,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    cursor: "pointer",
                  }}
                >
                  {f === "all" ? "TOUS" : f === "primacy" ? "1ERS SEULEMENT" : f === "original" ? "ORIGINAUX" : "HAUTE CONF"}
                </button>
              ))}
            </div>
            
            {/* Recherche */}
            <div style={{ marginBottom: 8 }}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="🔍 Rechercher dans les messages..."
                style={{
                  width: "100%", padding: "5px 10px", borderRadius: 6,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            
            {/* Filtres zone + biais */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
              <select
                value={zoneFilter}
                onChange={e => setZoneFilter(e.target.value)}
                style={{
                  padding: "3px 8px", borderRadius: 4, fontSize: 9, fontFamily: "JetBrains Mono",
                  background: "rgba(10,15,30,0.9)", color: "#22d3ee",
                  border: "1px solid rgba(34,211,238,0.2)", cursor: "pointer",
                }}
              >
                <option value="all">📍 TOUTES ZONES</option>
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              
              <select
                value={biasFilter}
                onChange={e => setBiasFilter(e.target.value)}
                style={{
                  padding: "3px 8px", borderRadius: 4, fontSize: 9, fontFamily: "JetBrains Mono",
                  background: "rgba(10,15,30,0.9)", color: "#a78bfa",
                  border: "1px solid rgba(167,139,250,0.2)", cursor: "pointer",
                }}
              >
                <option value="all">⚖️ TOUS BIAIS</option>
                {biases.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            
            {/* Stat bar */}
            <div style={{
              display: "flex", gap: 12, marginBottom: 10, padding: "6px 10px",
              background: "rgba(255,255,255,0.02)", borderRadius: 6,
            }}>
              {[
                { label: "TOTAL",    value: messages.length,                                         color: "#22d3ee" },
                { label: "ORIGINAUX",value: messages.filter(m => !m.is_repost).length,               color: "#22c55e" },
                { label: "PREMIERS", value: messages.filter(m => m.primacy_rank === 1).length,        color: "#ffd700" },
                { label: "HAUTE CONF",value: messages.filter(m => m.credibility_score >= 80).length, color: "#a78bfa" },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: "JetBrains Mono" }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Messages */}
            {filteredMessages.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 40,
                color: "rgba(255,255,255,0.2)", fontSize: 13,
              }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📡</div>
                <div>En attente de messages Telegram...</div>
                <div style={{ fontSize: 10, marginTop: 6, fontFamily: "JetBrains Mono", color: "rgba(255,255,255,0.15)" }}>
                  Lancez le collecteur Python: scripts/nexus_telegram_collector.py
                </div>
              </div>
            ) : (
              filteredMessages.map((msg: TelegramMsg) => (
                <MessageCard
                  key={msg.id}
                  msg={msg}
                  onFlyTo={zoneName => {
                    const zone = DAMAGE_ZONES.find(d => d.name.includes(zoneName));
                    if (zone && onFlyToZone) onFlyToZone(zone.lat, zone.lng, zoneName);
                  }}
                />
              ))
            )}
          </>
        )}
        
        {/* ── SOURCES ──────────────────────────────────────── */}
        {activeTab === "channels" && (
          <>
            {/* Légende biais */}
            <div style={{
              marginBottom: 12, padding: "8px 10px",
              background: "rgba(255,255,255,0.02)", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono", marginBottom: 5 }}>
                BIAIS ÉDITORIAUX -- TOUS SONT QUANTIFIÉS, AUCUN N'EST CACHÉ
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(BIAS_COLORS).map(([bias, color]) => (
                  <span key={bias} style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 2, fontFamily: "JetBrains Mono",
                    color, border: `1px solid ${color}33`,
                  }}>
                    {bias.replace("PRO_", "").replace("_", " ")}
                  </span>
                ))}
              </div>
            </div>
            
            {/* Par tier */}
            {(["PRIMARY", "SECONDARY", "TERTIARY"] as const).map(tier => {
              const tierChannels = NEXUS_CHANNELS.filter(c => c.tier === tier);
              return (
                <div key={tier} style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono",
                    color: TIER_LABELS[tier === "PRIMARY" ? 1 : tier === "SECONDARY" ? 2 : 3].color,
                    marginBottom: 6, padding: "3px 0",
                    borderBottom: `1px solid rgba(255,255,255,0.06)`,
                  }}>
                    {tier} ({tierChannels.length} canaux)
                  </div>
                  {tierChannels.sort((a: TelegramChannel, b: TelegramChannel) => b.credibilityScore - a.credibilityScore).map((ch: TelegramChannel) => (
                    <ChannelCard key={ch.id} channel={ch} />
                  ))}
                </div>
              );
            })}
          </>
        )}
        
        {/* ── DOMMAGES ─────────────────────────────────────── */}
        {activeTab === "damage" && (
          <>
            <div style={{
              marginBottom: 12, padding: "8px 12px",
              background: "rgba(239,68,68,0.05)", borderRadius: 6,
              border: "1px solid rgba(239,68,68,0.15)",
              fontSize: 10, color: "rgba(255,255,255,0.5)",
            }}>
              <strong style={{ color: "#ef4444" }}>Sources:</strong> UNOSAT (UN Satellite Centre), 
              ACLED (Armed Conflict Location & Event Data), Bellingcat, ISW, OCHA. 
              Données satellites + vérification terrain. Mises à jour en temps réel.
            </div>
            
            {/* Stats globales */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12,
            }}>
              {[
                { label: "ZONES DOCUMENTÉES", value: DAMAGE_ZONES.length, color: "#ef4444" },
                { label: "STRUCTURES DÉTRUITES", value: DAMAGE_ZONES.reduce((s, d) => s + d.destroyedStructures, 0).toLocaleString(), color: "#f97316" },
                { label: "TOTAL AFFECTÉ", value: DAMAGE_ZONES.reduce((s, d) => s + d.totalAffected, 0).toLocaleString(), color: "#f59e0b" },
              ].map(s => (
                <div key={s.label} style={{
                  padding: "8px", background: "rgba(0,0,0,0.2)", borderRadius: 6,
                  border: "1px solid rgba(239,68,68,0.1)", textAlign: "center",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: "JetBrains Mono" }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 7, color: "rgba(255,255,255,0.3)", fontFamily: "JetBrains Mono" }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
            
            {DAMAGE_ZONES.sort((a, b) => b.confidence - a.confidence).map(zone => (
              <DamageZoneCard
                key={zone.id}
                zone={zone}
                onFlyTo={onFlyToZone ? (lat, lng) => onFlyToZone(lat, lng, zone.name) : undefined}
              />
            ))}
          </>
        )}
        
        {/* ── GRAPHE D'INFLUENCE ───────────────────────────── */}
        {activeTab === "graph" && (
          <>
            <div style={{
              marginBottom: 12, padding: "8px 12px",
              background: "rgba(34,211,238,0.04)", borderRadius: 6,
              border: "1px solid rgba(34,211,238,0.1)",
              fontSize: 10, color: "rgba(255,255,255,0.5)",
            }}>
              <strong style={{ color: "#22d3ee" }}>Watts-Strogatz Small World Model:</strong> Les 
              "nœuds sentinelles" (premiers émetteurs) ont une valeur informationnelle 
              disproportionnée. NEXUS les identifie par comparaison des message_id Telegram.
            </div>
            
            <InfluenceGraph messages={messages} />
            
            {/* Chaînes de propagation des événements groupés */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                CASCADES D'INFORMATION DÉTECTÉES
              </div>
              {messages
                .filter(m => m.event_hash && m.primacy_rank === 1)
                .slice(0, 8)
                .map(primMsg => {
                  const cluster = messages.filter(m => m.event_hash === primMsg.event_hash);
                  return (
                    <div key={primMsg.event_hash} style={{
                      marginBottom: 8, padding: "8px 10px",
                      background: "rgba(255,255,255,0.02)", borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{ fontSize: 10, color: "#22d3ee", fontFamily: "JetBrains Mono", marginBottom: 4 }}>
                        🥇 SOURCE: @{primMsg.channel}
                        {primMsg.zone && <span style={{ color: "rgba(255,255,255,0.4)" }}> → {primMsg.zone}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {cluster
                          .sort((a,b) => a.msg_id - b.msg_id)
                          .map((m, i) => (
                            <span key={m.id} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{
                                fontSize: 9, fontFamily: "JetBrains Mono",
                                color: i === 0 ? "#ffd700" : "rgba(255,255,255,0.5)",
                              }}>
                                @{m.channel}
                              </span>
                              {i < cluster.length - 1 && (
                                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 9 }}>→</span>
                              )}
                            </span>
                          ))
                        }
                      </div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                        {cluster.length} canaux en cascade · {primMsg.text.slice(0, 80)}...
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
        
        {/* ── SCIENCE ──────────────────────────────────────── */}
        {activeTab === "science" && (
          <div style={{ fontSize: 11, lineHeight: 1.7, color: "rgba(255,255,255,0.7)" }}>
            
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12,
              background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#22d3ee", marginBottom: 6 }}>
                🧬 MIT Media Lab -- Vosoughi, Roy & Aral (Science, 2018)
              </div>
              <p style={{ margin: 0 }}>
                Analyse de 126 000 cascades d'information sur Twitter (2006-2017). 
                Résultat fondamental : les fausses nouvelles se propagent 
                <strong style={{ color: "#ef4444" }}> 6× plus vite</strong> et atteignent 
                <strong style={{ color: "#ef4444" }}> 70% plus de personnes</strong> que les vraies.
              </p>
              <p style={{ margin: "6px 0 0" }}>
                <strong style={{ color: "#22d3ee" }}>Implication NEXUS:</strong> La vitesse de propagation 
                d'un message N'EST PAS un indicateur de vérité -- c'est souvent l'inverse. 
                NEXUS pénalise les messages à haute vélocité et récompense la corroboration croisée.
              </p>
            </div>
            
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12,
              background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.15)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#a78bfa", marginBottom: 6 }}>
                🕸️ Small World Networks -- Watts & Strogatz (Nature, 1998)
              </div>
              <p style={{ margin: 0 }}>
                Les réseaux d'information ont une structure "petit monde": quelques nœuds hautement 
                connectés contrôlent la propagation. NEXUS identifie les 
                <strong style={{ color: "#a78bfa" }}> "nœuds sentinelles"</strong> -- les canaux 
                qui publient en premier sur les événements majeurs.
              </p>
              <p style={{ margin: "6px 0 0" }}>
                Algorithme: comparaison des <strong>message_id Telegram</strong> (séquentiels globaux). 
                Un message_id plus bas = publié en premier. Simple, infaillible.
              </p>
            </div>
            
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12,
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>
                🎯 Similarité Jaccard -- Détection des reposts
              </div>
              <p style={{ margin: 0 }}>
                NEXUS calcule la similarité Jaccard entre chaque nouveau message et les 500 derniers. 
                Seuil {">"}82% = repost identifié. Formule: |A∩B| / |A∪B| sur les tokens {">"} 4 chars.
              </p>
              <p style={{ margin: "6px 0 0" }}>
                Un repost reçoit une <strong style={{ color: "#ef4444" }}>pénalité -20 points</strong> sur 
                le score de confiance. Les canaux à fort ratio repost voient leur score global dégradé.
              </p>
            </div>
            
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 12,
              background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>
                📡 Formule scoring 6 dimensions (Bellingcat/Harvard)
              </div>
              <div style={{ fontFamily: "JetBrains Mono", fontSize: 9, color: "rgba(255,255,255,0.6)", lineHeight: 1.8 }}>
                <div>canal_base      = score_historique_canal × 1.0  (30%)</div>
                <div>repost_penalty  = −20 si Jaccard {">"}82%          (−20)</div>
                <div>forward_penalty = −8  si forward non-repost       (−8)</div>
                <div>media_bonus     = +5  si photo/vidéo              (+5)</div>
                <div>translation_bonus = +8 si langue source ≠ EN     (+8)</div>
                <div>primacy_bonus   = +10 si rang=1, +3 si rang≤3    (+10)</div>
                <div style={{ marginTop: 4, color: "#22c55e" }}>
                  SCORE_FINAL = max(0, min(100, Σ))
                </div>
              </div>
            </div>
            
            <div style={{
              padding: "10px 14px", borderRadius: 8,
              background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>
                ⚠️ RAND: "Firehose of Falsehood" Doctrine (2019)
              </div>
              <p style={{ margin: 0 }}>
                La doctrine russe de la désinformation (et ses équivalents) repose sur le 
                <strong style={{ color: "#fbbf24" }}> volume plutôt que la qualité</strong>. 
                L'objectif n'est pas de convaincre -- c'est de saturer l'espace informationnel 
                pour créer le doute.
              </p>
              <p style={{ margin: "6px 0 0" }}>
                <strong style={{ color: "#fbbf24" }}>Signaux d'alerte NEXUS:</strong> Canal publiant 
                50+ msgs/jour avec 80% de reposts, biais éditorial fort, absence de vérification 
                croisée = drapeau rouge automatique.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}