// ==============================================
// File: webapp/lib/db.ts
// Prisma client singleton (safe for Next.js dev HMR)
// ==============================================
import { PrismaClient } from "@prisma/client";


const g = global as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;