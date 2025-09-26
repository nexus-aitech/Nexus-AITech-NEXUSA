// ============================
// 6) lib/community/db.ts
// ============================
import type { Thread, Post, PublicProfile } from './types';


// In‑memory store for demo. Replace with Prisma calls in production.
const store = {
threads: new Map<string, Thread>(),
users: new Map<string, PublicProfile>(),
};


// Seed a couple users
(function seed(){
const users: PublicProfile[] = [
{ id: 'u_you', name: 'You', handle: '@you', level: 7, xp: 3240, badges: 6, country: 'SE' },
{ id: 'u_tutor', name: 'Tutor', handle: '@tutor', level: 12, xp: 9200, badges: 14, country: 'DE' },
{ id: 'u_admin', name: 'Admin', handle: '@admin', level: 20, xp: 25000, badges: 30, country: 'US' },
];
users.forEach(u=> store.users.set(u.id, u));
})();


export const db = {
async listThreads({ category, q, sort='latest', limit = 20, cursor }: { category?: string; q?: string; sort?: 'latest'|'views'; limit?: number; cursor?: string }){
let arr = Array.from(store.threads.values());
if (category) arr = arr.filter(t=> t.category === category);
if (q) arr = arr.filter(t=> t.title.toLowerCase().includes(q.toLowerCase()));
arr.sort((a,b)=> sort==='latest' ? b.lastActivity - a.lastActivity : b.views - a.views);
// simple cursor by createdAt
if (cursor){ const c = Number(cursor); arr = arr.filter(t=> t.createdAt < c); }
const items = arr.slice(0, limit);
const nextCursor = arr.length > limit ? String(items[items.length-1]?.createdAt ?? '') : null;
return { items, nextCursor };
},


async createThread({ userId, category, title, body }: { userId: string; category: string; title: string; body: string }){
const id = 'th_' + Math.random().toString(36).slice(2);
const now = Date.now();
const post: Post = { id: 'p_'+Math.random().toString(36).slice(2), userId, body, up: 0, down: 0, createdAt: now };
const thread: Thread = { id, category, title, userId, createdAt: now, lastActivity: now, views: 0, posts: [post] };
store.threads.set(id, thread);
return thread;
},


async vote({ threadId, delta }: { threadId: string; delta: 1|-1 }){
const t = store.threads.get(threadId); if (!t) throw new Error('not_found');
const p0 = t.posts[0]; if (!p0) throw new Error('empty');
if (delta>0) p0.up += 1; else p0.down += 1;
t.lastActivity = Date.now();
return t;
},


async accept({ threadId, postId }: { threadId: string; postId: string }){
const t = store.threads.get(threadId); if (!t) throw new Error('not_found');
t.posts = t.posts.map(p=> ({ ...p, accepted: p.id === postId }));
t.lastActivity = Date.now();
return t;
},


async getProfile(userId: string){