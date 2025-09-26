// ============================
// 7) lib/community/auth.ts
// ============================
import { headers } from 'next/headers';
import { cookies } from 'next/headers';
import type { Role } from './types';


export type SessionUser = { id: string; name: string; handle: string; role: Role } | null;


export async function getSessionUser(): Promise<SessionUser> {
// TODO: swap with your real auth (NextAuth, Clerk, custom JWT)
const cookie = (await cookies()).get('demo_user');
if (cookie?.value) {
const obj = JSON.parse(cookie.value);
return { id: obj.id, name: obj.name, handle: obj.handle, role: obj.role };
}
// Fallback to anonymous (null)
return null;
}


export function requireAuth(u: SessionUser){
if (!u) throw new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
}


export function requireRole(u: SessionUser, roles: Role[]){
requireAuth(u);
if (!u) return; // TS
if (!roles.includes(u.role)) throw new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
}