// ============================================================
// 3) app/api/community/accept/route.ts
// ============================================================
import { NextRequest } from 'next/server';
import { db } from '@/lib/community/db';
import { getSessionUser, requireRole } from '@/lib/community/auth';
import { publish } from '@/lib/community/events';


export async function POST(req: NextRequest){
const u = await getSessionUser();
// only tutor/admin may accept
requireRole(u, ['tutor','admin']);
const { threadId, postId } = await req.json();
if (!threadId || !postId) return new Response(JSON.stringify({ error: 'invalid' }), { status: 400 });
try{
const th = await db.accept({ threadId, postId });
publish({ type: 'reply', threadId, message: 'accepted', from: u!.id });
return Response.json({ ok: true, thread: th });
}catch(e){ return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }); }
}