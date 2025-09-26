// ============================
// 8) lib/community/antiabuse.ts
// ============================
const banned = [/\bshit\b/i,/\bfuck\b/i,/\bidiot\b/i];
export function isToxic(text: string){ return banned.some(re=> re.test(text)); }


// ultra‑simple IP rate limit (per minute)
const bucket = new Map<string, { count: number; ts: number }>();
export function rateLimit(key: string, limit = 60){
const now = Date.now();
const slot = Math.floor(now / 60000);
const k = key + ':' + slot;
const v = bucket.get(k) ?? { count: 0, ts: slot };
v.count += 1; bucket.set(k, v);
if (v.count > limit) throw new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 });
}