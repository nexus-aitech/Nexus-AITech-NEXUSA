// ============================================================
// 2) app/api/community/vote/route.ts
// ============================================================
import { NextRequest } from 'next/server';
import { db } from '@/lib/community/db';
import { getSessionUser, requireAuth } from '@/lib/community/auth';
import { rateLimit } from '@/lib/community/antiabuse';
import { publish } from '@/lib/community/events';


export async function POST(req: NextRequest){
const u = await getSessionUser();
requireAuth(u);
const ip = req.headers.get('x-forwarded-for') || 'local';
rateLimit('vote:'+ip, 180);


const { threadId, delta } = await req.json();
if (!threadId || ![1,-1].includes(delta)) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
try{
const th = await db.vote({ threadId, delta });
publish({ type: 'system', threadId, message: 'vote' , from: u!.id});
return Response.json({ ok: true, thread: th });
}catch(e){ return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }); }
}