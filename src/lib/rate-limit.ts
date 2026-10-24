/** A bounded, process-local limiter. Multiple replicas need a shared store. */
export class RateLimiter {
  private entries = new Map<string, { count: number; expires: number }>();
  private nextSweep = 0;
  constructor(private limit: number, private windowMs: number, private maxKeys = 10_000) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    if (now >= this.nextSweep) {
      for (const [key, entry] of this.entries) if (entry.expires <= now) this.entries.delete(key);
      this.nextSweep = now + Math.min(this.windowMs, 60_000);
    }
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= now) {
      if (!entry && this.entries.size >= this.maxKeys) return { allowed: false, retryAfterSeconds: 60 };
      entry = { count: 0, expires: now + this.windowMs };
      this.entries.set(key, entry);
    }
    const allowed = entry.count < this.limit;
    if (allowed) entry.count++;
    return { allowed, retryAfterSeconds: Math.max(1, Math.ceil((entry.expires - now) / 1000)) };
  }

  clear(key: string) { this.entries.delete(key); }
}
