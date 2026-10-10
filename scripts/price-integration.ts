// Live check of the price workflow: real Mapbox, Firecrawl, Gemini, and the Inngest dev server.
// Needs `npm run dev` and `npm run inngest:dev` running. Uses credits.
// Creates a throwaway user, runs four checks through Inngest, prints what each tier returned,
// then cleans up.
import { inngest } from "../src/inngest/client";
import { priceCheckRequested } from "../src/inngest/events";
import type { PriceCheckInput } from "../src/lib/price-schema";
import prisma from "../src/lib/prisma";
import { getPricePage } from "../src/server/price-check";
import { createPriceRun } from "../src/server/price-pipeline";

async function run(label: string, userId: string, workspaceId: string, input: PriceCheckInput) {
  const t = Date.now();
  const id = await createPriceRun(userId, workspaceId, input);
  await inngest.send(priceCheckRequested.create({ investigationId: id, userId }, { id: `price-check-${id}` }));
  const created = Date.now() - t;

  let status = "RUNNING";
  while (status === "RUNNING" && Date.now() - t < 180_000) {
    await new Promise((r) => setTimeout(r, 1000));
    status = (await prisma.investigation.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
  }
  const page = await getPricePage(userId, id);
  const v = page?.status === "completed" ? page.view : null;
  const steps = await prisma.runStep.findMany({ where: { run: { investigationId: id } }, orderBy: { order: "asc" }, select: { key: true, status: true, durationMs: true } });
  console.log(`\n${label}: created in ${created} ms, ${status} after ${Date.now() - t} ms`);
  console.log("  steps:", steps.map((s) => `${s.key}=${s.status}${s.durationMs ? `(${s.durationMs}ms)` : ""}`).join(" "));
  console.log("  result:", v && JSON.stringify({ band: v.band, basis: v.basis, confidence: v.confidence, low: v.lowInr, high: v.highInr, reversed: v.reversed, km: v.distanceKm, sources: v.sources.length }));
  console.log("  why:", v?.explanation);
}

async function main() {
  const user = await prisma.user.create({ data: { clerkId: `pipeline_${Date.now()}`, email: "ttd-e2e-pipeline@example.com", name: "Pipeline test" } });
  const ws = await prisma.workspace.create({ data: { ownerId: user.id, members: { create: { userId: user.id, role: "OWNER" } } } });
  try {
    await run("(a) Shillong to Guwahati airport, sedan, Rs 2,600", user.id, ws.id, { service: "TAXI", quotedInr: 2600, origin: "Shillong, Police Bazar", destination: "Guwahati airport", vehicle: "SEDAN" });
    await run("(b) Tezpur to Bomdila, sedan, Rs 5,500", user.id, ws.id, { service: "TAXI", quotedInr: 5500, origin: "Tezpur", destination: "Bomdila", vehicle: "SEDAN" });
    await run("(c) Homestay in Ziro, Rs 1,500 a night", user.id, ws.id, { service: "STAY", quotedInr: 1500, location: "Ziro", qualifier: "Homestay" });
    await run("(d) Tezpur to Bomdila again (saved research)", user.id, ws.id, { service: "TAXI", quotedInr: 5500, origin: "Tezpur", destination: "Bomdila", vehicle: "SEDAN" });
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}
main().finally(() => prisma.$disconnect());
