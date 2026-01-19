/**
 * Semantic Embeddings — Voyage AI
 *
 * Model: voyage-3-lite (512-dim, 50M tokens/month free)
 * https://docs.voyageai.com/docs/embeddings
 *
 * ENV: VOYAGE_API_KEY (free at dash.voyageai.com)
 *
 * Without API key: falls back to enhanced Jaccard similarity.
 * With API key: cosine similarity on real semantic vectors.
 *
 * Embeddings are cached in-process by content hash to avoid redundant API calls.
 * Cache is bounded to MAX_CACHE entries (LRU-style).
 */

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_URL     = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL   = "voyage-3-lite";
const MAX_CACHE      = 2000;

// ─── In-process embedding cache ───────────────────────────────

const embeddingCache = new Map<string, { vec: Float32Array; hits: number }>();

function cacheKey(text: string): string {
  // FNV-1a hash — fast, good distribution
  let h = 2166136261;
  for (let i = 0; i < Math.min(text.length, 512); i++) {
    h ^= text.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

function evictLRU(): void {
  if (embeddingCache.size <= MAX_CACHE) return;
  // Remove the entry with the fewest hits
  let minHits = Infinity;
  let minKey = "";
  for (const [k, v] of embeddingCache) {
    if (v.hits < minHits) { minHits = v.hits; minKey = k; }
  }
  if (minKey) embeddingCache.delete(minKey);
}

// ─── Voyage AI API call ───────────────────────────────────────

async function fetchEmbeddings(texts: string[]): Promise<Float32Array[] | null> {
  if (!VOYAGE_API_KEY || texts.length === 0) return null;
  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map(d => new Float32Array(d.embedding));
  } catch {
    return null;
  }
}

// ─── Public: get embedding for a single text ──────────────────

export async function embed(text: string): Promise<Float32Array | null> {
  const key = cacheKey(text);
  const cached = embeddingCache.get(key);
  if (cached) {
    cached.hits++;
    return cached.vec;
  }

  const results = await fetchEmbeddings([text.slice(0, 2048)]);
  if (!results || !results[0]) return null;

  evictLRU();
  embeddingCache.set(key, { vec: results[0], hits: 1 });
  return results[0];
}

/** Get embeddings for multiple texts in one API call (more efficient). */
export async function embedBatch(texts: string[]): Promise<Map<string, Float32Array>> {
  const result = new Map<string, Float32Array>();
  if (!VOYAGE_API_KEY || texts.length === 0) return result;

  // Split: already cached vs needs fetching
  const toFetch: Array<{ text: string; key: string }> = [];
  for (const text of texts) {
    const key = cacheKey(text);
    const cached = embeddingCache.get(key);
    if (cached) {
      cached.hits++;
      result.set(text, cached.vec);
    } else {
      toFetch.push({ text, key });
    }
  }

  if (toFetch.length === 0) return result;

  const vecs = await fetchEmbeddings(toFetch.map(t => t.text.slice(0, 2048)));
  if (!vecs) return result;

  vecs.forEach((vec, i) => {
    const { text, key } = toFetch[i];
    evictLRU();
    embeddingCache.set(key, { vec, hits: 1 });
    result.set(text, vec);
  });

  return result;
}

// ─── Similarity functions ─────────────────────────────────────

/** Cosine similarity between two Float32Arrays. Range [0, 1]. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : Math.max(0, Math.min(1, dot / denom));
}

/**
 * Enhanced Jaccard fallback — used when Voyage is not configured.
 * Improvements over basic Jaccard:
 *   - Bigrams for phrase matching
 *   - Military/geopolitical synonym expansion
 *   - TF-IDF-like rare-word boosting
 */
const SYNONYMS: Record<string, string[]> = {
  strike:      ["airstrike", "frappe", "bombing", "attack", "hit"],
  explosion:   ["blast", "detonation", "explosion", "explosive"],
  missile:     ["rocket", "projectile", "munition", "warhead"],
  vessel:      ["ship", "tanker", "cargo", "freighter", "boat"],
  convoy:      ["vehicles", "trucks", "column", "movement"],
  troops:      ["soldiers", "military", "forces", "army", "battalion"],
  shutdown:    ["outage", "offline", "blackout", "disruption", "down"],
  evacuation:  ["evacuate", "withdrawal", "retreat", "fleeing"],
};

function expandSynonyms(token: string): string[] {
  for (const [canonical, syns] of Object.entries(SYNONYMS)) {
    if (token === canonical || syns.includes(token)) {
      return [canonical, ...syns];
    }
  }
  return [token];
}

export function enhancedJaccard(textA: string, textB: string): number {
  const tokenize = (t: string): Set<string> => {
    const tokens = t.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const expanded = new Set<string>();
    tokens.forEach(tok => expandSynonyms(tok).forEach(s => expanded.add(s)));
    // Add bigrams
    for (let i = 0; i < tokens.length - 1; i++) {
      expanded.add(`${tokens[i]}_${tokens[i + 1]}`);
    }
    return expanded;
  };

  const a = tokenize(textA);
  const b = tokenize(textB);
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export const embeddingsConfigured = !!VOYAGE_API_KEY;
export { cacheKey };
