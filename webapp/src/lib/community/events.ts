// ============================
// 9) lib/community/events.ts
// ============================
// Very small in‑memory SSE hub. For multi‑instance, move to Redis pub/sub.


export type EventPayload = { type: 'reply'|'mention'|'system'; threadId?: string; message?: string; from?: string };


const listeners = new Set<(ev: EventPayload)=>void>();
export function subscribe(onEvent: (ev: EventPayload)=>void){ listeners.add(onEvent); return ()=> listeners.delete(onEvent); }
export function publish(ev: EventPayload){ for (const l of listeners) try { l(ev); } catch {} }