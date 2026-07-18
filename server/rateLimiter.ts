/**
 * Minimal in-memory attempt limiter for PIN/access-code brute-force
 * protection. There is no server-side throttling at all today: a script
 * can try all 10,000 four-digit PIN combinations against any of the 40
 * fixed operator IDs (including the admin ID) with nothing to stop it.
 *
 * This is intentionally simple: an in-memory Map, not a DB table or Redis.
 * It resets on every server restart and does not coordinate across
 * multiple server instances — acceptable for this app's actual footprint
 * (a single Express process for a one-evening school festival), not a
 * general-purpose solution. If this app ever runs behind multiple
 * instances, this needs to move to a shared store.
 */
import type { Request } from "express";

type Bucket = { failures: number; lockedUntil: number };

const buckets = new Map<string, Bucket>();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const b = buckets.get(key);
  if (!b || b.lockedUntil <= Date.now()) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.ceil((b.lockedUntil - Date.now()) / 1000) };
}

export function recordFailure(key: string): void {
  const b = buckets.get(key) || { failures: 0, lockedUntil: 0 };
  b.failures += 1;
  if (b.failures >= MAX_ATTEMPTS) {
    b.lockedUntil = Date.now() + LOCKOUT_MS;
    b.failures = 0;
  }
  buckets.set(key, b);
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}

/**
 * Render (and most reverse-proxy hosts) sits in front of the app, so
 * req.socket.remoteAddress alone would just be the proxy's address.
 * x-forwarded-for's first entry is the original client IP.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}
