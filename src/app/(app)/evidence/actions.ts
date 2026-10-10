"use server";

import { redirect } from "next/navigation";
import { evidenceHref } from "@/lib/evidence";
import prisma from "@/lib/prisma";
import { startCapture } from "@/server/capture-run";
import { deleteObject, keyFromRef } from "@/server/storage";
import { getCurrentUser } from "@/server/users";

/**
 * Capture a page from the vault: starts the run, then the page shows it live. A refusal hands
 * the typed address back, because React clears an uncontrolled form once its action finishes.
 */
export async function startVaultCapture(_prev: { error?: string; url?: string } | undefined, form: FormData) {
  const url = String(form.get("url") ?? "");
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first.", url };
  const result = await startCapture(user, url, "evidence");
  if (!result.ok) return { error: result.error, url };
  redirect(evidenceHref({ capture: result.id }));
}

/**
 * Removes one of the user's items and its file. An item a report cites stays, so a published
 * report never points at a missing picture.
 */
export async function deleteEvidence(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const item = await prisma.evidence.findFirst({
    where: { id, ownerId: user.id, deletedAt: null },
    select: { id: true, storageUrl: true, _count: { select: { reports: true } } },
  });
  if (!item) return { ok: false, error: "That item no longer exists." };
  if (item._count.reports > 0) return { ok: false, error: "A report cites this item, so it cannot be deleted." };

  await prisma.evidence.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
  const key = keyFromRef(item.storageUrl);
  if (key) await deleteObject(key).catch(() => undefined);
  return { ok: true };
}
