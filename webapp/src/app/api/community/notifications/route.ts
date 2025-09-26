// ============================================================
// 4) app/api/community/notifications/route.ts (SSE)
// ============================================================
import type { NextRequest } from 'next/server';
import { subscribe } from '@/lib/community/events';


export async function GET(req: NextRequest){
const stream = new ReadableStream({
start(controller){
const encoder = new TextEncoder();
const send = (obj: any)=> controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
const unsub = subscribe(ev => send(ev));
// heartbeat
const hb = setInterval(()=> controller.enqueue(encoder.encode(': ping\n\n')), 30000);
// kick
send({ type: 'system', message: 'connected' });
return ()=> { clearInterval(hb); unsub(); };
}
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' }});
}