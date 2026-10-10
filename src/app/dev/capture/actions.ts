"use server";

import { redirect } from "next/navigation";
import { inngest } from "@/inngest/client";
import { captureRequested } from "@/inngest/events";
import { hostOf, isSafePublicUrl } from "@/lib/research-policy";
import prisma from "@/lib/prisma";
import { getCurrentUser, getPersonalWorkspace } from "@/server/users";

/** Development only: capture a page as evidence and watch it live. */
export async function startDevCapture(_prev: { error?: string } | undefined, form: FormData) {
  if (process.env.NODE_ENV === "production") return { error: "Not available in production." };
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const raw = String(form.get("url") ?? "").trim();
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (!isSafePublicUrl(url)) return { error: "Enter a public http or https address." };

  const workspace = await getPersonalWorkspace(user.id);
  const inv = await prisma.investigation.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      kind: "BOOKING",
      inputType: "LINK",
      title: hostOf(url),
      input: url,
      status: "RUNNING",
      runCapture: true,
      runResearch: false,
      runKnowledge: false,
      totalSteps: 1,
      startedAt: new Date(),
      createdVia: "form",
      workflowRuns: { create: { runCode: `run_${Math.random().toString(36).slice(2, 8).toUpperCase()}`, type: "capture", subject: hostOf(url), status: "QUEUED", userId: user.id, stepsTotal: 1 } },
    },
    select: { id: true },
  });
  try {
    await inngest.send(captureRequested.create({ investigationId: inv.id }, { id: `capture-${inv.id}` }));
  } catch {
    await prisma.investigation.update({ where: { id: inv.id }, data: { status: "FAILED", error: "Worker unreachable" } });
    return { error: "Could not reach the Inngest dev server. Run `npm run inngest:dev`." };
  }
  redirect(`/dev/capture?id=${inv.id}`);
}
