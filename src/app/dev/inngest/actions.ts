"use server";

import { inngest } from "@/inngest/client";
import { helloRequested } from "@/inngest/events";

/** Development only: send the hello-world event. Refuses in production. */
export async function sendHelloAction(name: string) {
  if (process.env.NODE_ENV === "production") return { ok: false as const, error: "Not available in production." };
  try {
    const result = await inngest.send(helloRequested.create({ name: name.trim().slice(0, 60) || "world" }));
    return { ok: true as const, ids: result.ids };
  } catch {
    return { ok: false as const, error: "Could not reach the Inngest dev server. Run `npm run inngest:dev`." };
  }
}
