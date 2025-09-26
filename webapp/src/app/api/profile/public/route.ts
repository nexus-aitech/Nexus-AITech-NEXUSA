// ============================================================
// 5) app/api/profile/public/route.ts
// ============================================================
import { NextRequest } from 'next/server';
import { db } from '@/lib/community/db';


export async function GET(req: NextRequest){
const { searchParams } = new URL(req.url);
const userId = searchParams.get('userId');
if (!userId) return new Response(JSON.stringify({ error: 'missing_userId' }), { status: 400 });
const profile = await db.getProfile(userId);
if (!profile) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
return Response.json(profile);
}