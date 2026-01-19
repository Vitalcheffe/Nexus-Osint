/**
 * Key-Value persistence layer
 *
 * Backend: Upstash Redis REST API (free tier: 10K commands/day, 256MB)
 *   https://upstash.com/docs/redis/overall/getstarted
 *
 * Without credentials: all writes are no-ops, reads return null.
 * The system still functions — just loses state on restart.
 *
 * ENV:
 *   UPSTASH_REDIS_REST_URL    — from Upstash console
 *   UPSTASH_REDIS_REST_TOKEN  — from Upstash console
 *
 * API is pure REST (no SDK, no native modules). Works on Render, Vercel, Fly, anywhere.
 */

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const configured = !!UPSTASH_URL && !!UPSTASH_TOKEN;

// ─── In-memory fallback ────────────────────────────────────────
// When Upstash is not configured, all data lives here.
// Useful for development. Data lost on process restart.

const memStore = new Map<string, string>();

// ─── Low-level REST call ───────────────────────────────────────

async function upstash(command: string[]): Promise<unknown> {
  if (!configured) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { result: unknown };
    return data.result ?? null;
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────

/** Store a JSON-serializable value. Optional TTL in seconds. */
export async function kvSet(key: string, value: unknown, ttlSec?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (configured) {
    if (ttlSec) {
      await upstash(["SET", key, serialized, "EX", String(ttlSec)]);
    } else {
      await upstash(["SET", key, serialized]);
    }
  } else {
    memStore.set(key, serialized);
  }
}

/** Retrieve a value. Returns null if not found. */
export async function kvGet<T = unknown>(key: string): Promise<T | null> {
  let raw: string | null = null;
  if (configured) {
    raw = (await upstash(["GET", key])) as string | null;
  } else {
    raw = memStore.get(key) ?? null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Prepend a JSON value to a list and trim to maxLen. */
export async function kvLPush(key: string, value: unknown, maxLen = 500): Promise<void> {
  const serialized = JSON.stringify(value);
  if (configured) {
    await upstash(["LPUSH", key, serialized]);
    await upstash(["LTRIM", key, "0", String(maxLen - 1)]);
  } else {
    const existing = memStore.get(`list:${key}`);
    const arr: string[] = existing ? JSON.parse(existing) : [];
    arr.unshift(serialized);
    if (arr.length > maxLen) arr.length = maxLen;
    memStore.set(`list:${key}`, JSON.stringify(arr));
  }
}

/** Get a range from a list. */
export async function kvLRange<T = unknown>(key: string, start = 0, end = 99): Promise<T[]> {
  if (configured) {
    const result = (await upstash(["LRANGE", key, String(start), String(end)])) as string[] | null;
    if (!result) return [];
    return result.map(r => {
      try { return JSON.parse(r) as T; } catch { return null as unknown as T; }
    }).filter(Boolean);
  } else {
    const existing = memStore.get(`list:${key}`);
    if (!existing) return [];
    const arr = JSON.parse(existing) as string[];
    return arr.slice(start, end + 1).map(r => {
      try { return JSON.parse(r) as T; } catch { return null as unknown as T; }
    }).filter(Boolean);
  }
}

/** Increment a counter and return the new value. */
export async function kvIncr(key: string): Promise<number> {
  if (configured) {
    const result = await upstash(["INCR", key]);
    return typeof result === "number" ? result : 0;
  } else {
    const current = parseInt(memStore.get(key) ?? "0", 10);
    const next = current + 1;
    memStore.set(key, String(next));
    return next;
  }
}

/** Delete a key. */
export async function kvDel(key: string): Promise<void> {
  if (configured) {
    await upstash(["DEL", key]);
  } else {
    memStore.delete(key);
    memStore.delete(`list:${key}`);
  }
}

export const kvConfigured = configured;
