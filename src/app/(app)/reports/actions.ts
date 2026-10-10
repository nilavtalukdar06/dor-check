"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { reportInputSchema, type ReportInput } from "@/lib/reports";
import { flagComment, moderateComment, postComment, publishFinding, retractFinding, type PostResult } from "@/server/comments";
import { createReport, toggleFollow } from "@/server/reports";
import { getRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";

export type SubmitState = { ok: false; error: string; fields?: Record<string, string> };

/** Save a report, then show it. Field problems come back by field so the form can point at them. */
export async function submitReportAction(input: ReportInput): Promise<SubmitState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fields };
  }

  const result = await createReport(user, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };
  redirect(`/reports/${result.reference}`);
}

/** Follow or unfollow a report. */
export async function toggleFollowAction(reference: string): Promise<{ ok: true; following: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };
  return toggleFollow(user.id, reference);
}

// ───────────────────────── Discussion ─────────────────────────

async function actor() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { id: user.id, role: (await getRole()) ?? ("TRAVELLER" as const), name: user.name, displayName: user.displayName };
}

/** Post a comment under a report. */
export async function postCommentAction(reference: string, body: string): Promise<PostResult> {
  const a = await actor();
  if (!a) return { ok: false, error: "Sign in first." };
  return postComment(a, reference, body);
}

/** Flag someone else's comment for a moderator. */
export async function flagCommentAction(commentId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor();
  if (!a) return { ok: false, error: "Sign in first." };
  return flagComment(a, commentId, reason);
}

/** Moderators: approve a flagged or held comment, or take it down. */
export async function moderateCommentAction(commentId: string, action: "approve" | "remove"): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor();
  if (!a) return { ok: false, error: "Sign in first." };
  const result = await moderateComment(a, commentId, action);
  if (result.ok) revalidatePath("/reports/[ref]", "page");
  return result;
}

/** Moderators: publish an official finding. */
export async function publishFindingAction(reference: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor();
  if (!a) return { ok: false, error: "Sign in first." };
  const result = await publishFinding(a, reference, body);
  if (result.ok) revalidatePath("/reports/[ref]", "page");
  return result.ok ? { ok: true } : result;
}

/** Moderators: withdraw an official finding. */
export async function retractFindingAction(findingId: string, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor();
  if (!a) return { ok: false, error: "Sign in first." };
  const result = await retractFinding(a, findingId, note);
  if (result.ok) revalidatePath("/reports/[ref]", "page");
  return result;
}
