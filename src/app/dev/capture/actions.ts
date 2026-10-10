"use server";

import { redirect } from "next/navigation";
import { startCapture } from "@/server/capture-run";
import { getCurrentUser } from "@/server/users";

/** Development only: capture a page as evidence and watch it live. */
export async function startDevCapture(_prev: { error?: string } | undefined, form: FormData) {
  if (process.env.NODE_ENV === "production") return { error: "Not available in production." };
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const result = await startCapture(user, String(form.get("url") ?? ""), "dev-capture");
  if (!result.ok) return { error: result.error };
  redirect(`/dev/capture?id=${result.id}`);
}
