import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** One line in the audit log for anything a moderator or admin changes. */
export async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actorId, action, entityType, entityId, metadata: metadata ?? undefined } });
}
