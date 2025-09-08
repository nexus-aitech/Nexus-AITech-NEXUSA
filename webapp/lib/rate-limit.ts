// Very small in-memory token bucket (per process). Replace with Redis/Upstash in prod.
const buckets = new Map<string, { tokens: number; updated: number }>();


export default {
async limit(key: string, max: number, windowMs: number) {
const now = Date.now();
const b = buckets.get(key) || { tokens: max, updated: now };
const elapsed = now - b.updated;
const refill = Math.floor((elapsed / windowMs) * max);
b.tokens = Math.min(max, b.tokens + (refill > 0 ? refill : 0));
b.updated = refill > 0 ? now : b.updated;
if (b.tokens <= 0) { buckets.set(key, b); return { ok: false }; }
b.tokens -= 1; buckets.set(key, b); return { ok: true };
},
};