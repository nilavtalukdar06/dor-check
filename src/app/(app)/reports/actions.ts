"use server";

import { redirect } from "next/navigation";
import { reportInputSchema, type ReportInput } from "@/lib/reports";
import { createReport, toggleFollow } from "@/server/reports";
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
