// ============================
// 10) lib/community/types.ts
// ============================
export type Role = 'user'|'tutor'|'admin';
export type UserMini = { id: string; name: string; handle: string; role: Role; country?: string };
export type Post = { id: string; userId: string; body: string; up: number; down: number; createdAt: number; accepted?: boolean };
export type Thread = { id: string; category: string; title: string; userId: string; createdAt: number; lastActivity: number; views: number; posts: Post[]; tags?: string[] };
export type PublicProfile = { id: string; name: string; handle: string; level: number; xp: number; badges: number; country?: string };


export type ThreadsQuery = { category?: string; q?: string; sort?: 'latest'|'views'; limit?: number; cursor?: string };
