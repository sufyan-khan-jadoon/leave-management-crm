import { PrismaClient } from "@prisma/client";

// Reuse the client across HMR reloads in development; Next.js re-evaluates
// modules on every change and would otherwise exhaust the connection pool.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
