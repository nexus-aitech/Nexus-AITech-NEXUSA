// ============================================================
// 1) app/api/community/threads/route.ts
// ============================================================
import { NextRequest } from 'next/server';
import { db } from '@/lib/community/db';
import { getSessionUser, requireAuth } from '@/lib/community/auth';
import { isToxic, rateLimit } from '@/lib/community/antiabuse';
import { publish } from '@/lib/community/events';


export async function GET(req: NextRequest){
const { searchParams } = new URL(req.url);
const category = searchParams.get('category') || undefined;
const q = searchParams.get('q') || undefined;
const sort = (searchParams.get('sort') as 'latest'|'views') || 'latest';
const limit = Number(searchParams.get('limit')||'20');
const cursor = searchParams.get('cursor') || undefined;
const data = await db.listThreads({ category, q, sort, limit, cursor });
return Response.json(data);
}


export async function POST(req: NextRequest){
const u = await getSessionUser();
requireAuth(u);
const ip = req.headers.get('x-forwarded-for') || 'local';
rateLimit('thread:'+ip, 30);


const body = await req.json();
const { category, title, content } = body || {};
if (!category || !title || !content) return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
if (String(title).length < 6 || String(content).length < 12) return new Response(JSON.stringify({ error: 'too_short' }), { status: 400 });
if (isToxic(String(title)+'\n'+String(content))) return new Response(JSON.stringify({ error: 'toxic' }), { status: 422 });


const th = await db.createThread({ userId: u!.id, category, title, body: content });
publish({ type: 'system', threadId: th.id, message: 'new_thread', from: u!.id });
return Response.json(th, { status: 201 });
}