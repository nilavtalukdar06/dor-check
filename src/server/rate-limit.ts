import prisma from "@/lib/prisma";

/**
 * Fixed-window counter in Postgres. Returns false when `key` has used up `limit` calls in
 * the current window. Phase 29 can swap this for Upstash without changing callers.
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const windowStart = new Date(now - (now % (windowSeconds * 1000)));
  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  return bucket.count <= limit;
}
