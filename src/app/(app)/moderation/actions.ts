"use server";

import { revalidatePath } from "next/cache";
import { reindexDirectory } from "@/server/directory-sync";
import { decideListing } from "@/server/directory";
import { decideComment, getReview, isReportStatus, reviewReport, setReportHidden, type ReviewView } from "@/server/moderation";
import { requireRole } from "@/server/roles";
import { decideResearched, retireBenchmark, saveBenchmark, saveBoard, type BenchmarkInput, type BoardInput } from "@/server/tariffs-admin";
import { getCurrentUser } from "@/server/users";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Every moderation action starts here: the real role check, then who is acting. */
async function staff() {
  const role = (await requireRole("MODERATOR")) as "MODERATOR" | "ADMIN";
  const user = await getCurrentUser();
  if (!user) throw new Error("No user");
  return { id: user.id, role, name: user.name, displayName: user.displayName };
}

const done = (r: Result) => {
  if (r.ok) revalidatePath("/moderation");
  return r;
};

export async function getReviewAction(reference: string): Promise<ReviewView | null> {
  return getReview(await staff(), reference);
}

export async function reviewReportAction(reference: string, input: { to?: string; note?: string; finding?: string }): Promise<Result> {
  const s = await staff();
  if (input.to && !isReportStatus(input.to)) return { ok: false, error: "Unknown status." };
  const r = await reviewReport(s, reference, { to: input.to as never, note: input.note, finding: input.finding });
  if (r.ok) revalidatePath(`/reports/${reference}`);
  return done(r);
}

export async function setReportHiddenAction(reference: string, hidden: boolean, note?: string): Promise<Result> {
  const r = await setReportHidden(await staff(), reference, hidden, note);
  if (r.ok) revalidatePath(`/reports/${reference}`);
  return done(r);
}

export async function decideCommentAction(commentId: string, action: "approve" | "remove"): Promise<Result> {
  return done(await decideComment(await staff(), commentId, action));
}

export async function decideListingAction(id: string, decision: "list" | "verify" | "reject", reason?: string): Promise<Result> {
  const s = await staff();
  if (decision === "reject" && !reason?.trim()) return { ok: false, error: "Say why, so the business knows what to fix." };
  try {
    await decideListing(s.id, id, decision, reason);
  } catch (e) {
    return { ok: false, error: e instanceof Error && /already decided/.test(e.message) ? e.message : "Something went wrong. Please try again." };
  }
  revalidatePath("/directory");
  revalidatePath("/map");
  if (decision !== "reject") await reindexDirectory(s.id);
  return done({ ok: true });
}

export async function saveBoardAction(id: string | null, input: BoardInput): Promise<Result> {
  const r = await saveBoard((await staff()).id, id, input);
  return done(r.ok ? { ok: true } : r);
}

export async function saveBenchmarkAction(id: string | null, input: BenchmarkInput): Promise<Result> {
  const r = await saveBenchmark((await staff()).id, id, input);
  return done(r.ok ? { ok: true } : r);
}

export async function retireBenchmarkAction(id: string): Promise<Result> {
  await retireBenchmark((await staff()).id, id);
  return done({ ok: true });
}

export async function decideResearchedAction(id: string, approve: boolean): Promise<Result> {
  try {
    await decideResearched((await staff()).id, id, approve);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
  return done({ ok: true });
}
