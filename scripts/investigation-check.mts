// Live check of the investigation workflow: sends the event from a script and watches the run.
// Needs `npm run dev` and `npm run inngest:dev` running. Uses real Gemini, Pinecone, Firecrawl and
// (for one case) a Browserbase session. Cleans up everything it creates.
import prismaModule from "../src/lib/prisma";
// An ES module importing a CommonJS default export gets it wrapped one level deeper.
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { inngest } from "../src/inngest/client";
import { investigationRequested } from "../src/inngest/events";
import { INVESTIGATION_METRIC, INVESTIGATION_STEPS } from "../src/lib/investigation";
import { cancelInvestigation, completeInvestigation, finaliseInvestigation, startInvestigation, type StartInput } from "../src/server/investigation";
import { deleteObject, keyFromRef } from "../src/server/storage";
import type { AgentResult } from "../src/server/agent";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 600)}`);
  if (!ok) fails++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A momentary network drop between this machine and the database should not fail a check. */
async function steady<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (err) { if (i >= 4) throw err; await sleep(2000); }
  }
}
const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];

async function waitDone(id: string, ms = 240_000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const inv = await steady(() => prisma.investigation.findUniqueOrThrow({ where: { id }, select: { status: true } }));
    if (TERMINAL.includes(inv.status)) return inv.status;
    await sleep(1500);
  }
  return "TIMEOUT";
}

async function snapshot(id: string) {
  return prisma.investigation.findUniqueOrThrow({
    where: { id },
    include: {
      result: { include: { signals: { orderBy: { order: "asc" } } } },
      sources: true,
      reportMatches: { include: { report: { select: { reference: true } } } },
      identifiers: { include: { identifier: true } },
      evidence: true,
      workflowRuns: { include: { steps: { orderBy: { order: "asc" }, include: { toolCalls: true } }, events: { orderBy: { id: "asc" } }, toolCalls: true } },
    },
  });
}

async function servers() {
  try {
    const app = await fetch("http://localhost:3000/api/inngest", { method: "PUT" });
    const ing = await fetch("http://localhost:8288/");
    return app.ok && ing.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await servers())) {
    console.error("The app and the Inngest dev server must be running: `npm run dev` and `npm run inngest:dev`.");
    process.exit(1);
  }
  await sleep(3000); // let Inngest pick up the function list

  const user = await prisma.user.create({ data: { clerkId: `inv_${Date.now()}`, email: "ttd-e2e-investigation@example.com", name: "Investigation test" } });
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, isPersonal: true } });
  const ids: string[] = [];
  const usage = async () => Number((await prisma.usageRecord.findFirst({ where: { userId: user.id, metric: INVESTIGATION_METRIC } }))?.quantity ?? 0);
  const start = async (input: StartInput) => {
    const r = await startInvestigation(user, input);
    if (!r.ok) throw new Error(r.error);
    ids.push(r.id);
    return r.id;
  };
  const touched: string[] = [];

  try {
    // ---- Validation and limits before anything starts
    check("an empty input is refused", !(await startInvestigation(user, { inputType: "MESSAGE", input: " " })).ok);
    check("an unsafe address is refused", (await startInvestigation(user, { inputType: "LINK", input: "http://169.254.169.254/latest" })).ok === false);
    check("nothing was created by the refused requests", (await prisma.investigation.count({ where: { userId: user.id } })) === 0);

    // ---- 1. The seeded fake URL, end to end (the plan's "done when")
    const fake = "https://demohills-homestay-booking.example/book";
    const id1 = await start({ inputType: "LINK", input: fake, options: { capture: false } });
    const queued = await prisma.investigation.findUniqueOrThrow({ where: { id: id1 }, include: { workflowRuns: { include: { steps: { orderBy: { order: "asc" } } } } } });
    check("starting creates the investigation with a run and six queued steps", queued.workflowRuns[0]?.steps.length === 6 && queued.workflowRuns[0].steps.every((s) => s.status === "QUEUED") && queued.workflowRuns[0].steps.map((s) => s.key).join() === INVESTIGATION_STEPS.map((s) => s[0]).join(), queued.workflowRuns[0]?.steps.map((s) => s.key));
    const t1 = Date.now();
    const status1 = await waitDone(id1);
    console.log(`  finished in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
    const a = await snapshot(id1);
    const run = a.workflowRuns[0];
    check("the investigation and its run are COMPLETED, with a duration", status1 === "COMPLETED" && run.status === "COMPLETED" && !!a.durationMs && !!run.durationMs && a.currentStep === 6 && run.stepsDone === 6 && a.error === null, [status1, run.status, a.currentStep]);
    check("six step rows, in order, with the expected outcomes (capture was off, so it is SKIPPED)", run.steps.map((s) => `${s.key}:${s.status}`).join() === "parse-input:COMPLETED,search-sources:COMPLETED,capture-page:SKIPPED,retrieve-benchmarks:COMPLETED,analyse:COMPLETED,finalise:COMPLETED", run.steps.map((s) => `${s.key}:${s.status}`));
    check("every step has a start, an end and a duration", run.steps.every((s) => s.startedAt && s.finishedAt && s.durationMs !== null), run.steps.map((s) => [s.key, s.durationMs]));
    const types = run.events.map((e) => e.type);
    const order = ["request_parsed", "research_started", "sources_found", "capture_skipped", "benchmark_calculated", "analysis_completed", "verdict_saved"];
    check("the timeline has the plan's events, in order", order.every((t, i) => types.indexOf(t) >= 0 && (i === 0 || types.indexOf(t) > types.indexOf(order[i - 1]))), types);
    check("every event belongs to the step it describes", run.events.every((e) => run.steps.find((s) => s.id === e.stepId)) && run.events.find((e) => e.type === "sources_found")?.stepId === run.steps[1].id && run.events.find((e) => e.type === "verdict_saved")?.stepId === run.steps[5].id);
    console.log("  timeline:", run.events.map((e) => e.message).join(" | "));

    check("a complete result: verdict, summary, guidance, signals, prompt version and model id", !!a.result && a.result.summary.length > 20 && a.result.guidance.length >= 1 && a.result.signals.length >= 1 && !!a.result.promptVersion && !!a.result.modelId, a.result);
    check("at least two cited sources, each with a retrieval time", a.sources.length >= 2 && a.sources.every((s) => s.retrievedAt && (s.url || s.label)), a.sources.map((s) => [s.kind, s.label ?? s.url]));
    check("not a verified match (two reports name this website)", a.result?.verdict !== "VERIFIED_MATCH" && a.result?.concern !== "LOW", [a.result?.verdict, a.result?.concern]);
    const calls = run.steps.flatMap((s) => s.toolCalls.map((c) => `${s.key}/${c.name}`));
    check("tool calls are recorded against the steps that made them", calls.includes("search-sources/lookupDirectory") && calls.includes("search-sources/findSimilarReports") && calls.includes("retrieve-benchmarks/retrieveKnowledge") && run.toolCalls.every((c) => c.stepId), calls);
    check("the two community reports are linked as matches (same domain)", ["TTD-5F2K8W", "TTD-7K2M9Q"].every((r) => a.reportMatches.some((m) => m.report.reference === r && m.reason === "same_domain")), a.reportMatches.map((m) => [m.report.reference, m.reason]));
    check("the website is stored as an identifier of this investigation", a.identifiers.some((i) => i.identifier.kind === "DOMAIN" && i.identifier.value === "demohills-homestay-booking.example" && i.role === "subject"), a.identifiers.map((i) => i.identifier.value));
    check("this month's usage went up by one", (await usage()) === 1, await usage());
    const notes = await prisma.notification.findMany({ where: { userId: user.id } });
    check("the traveller got a notification that links to the check", notes.length === 1 && notes[0].type === "run_completed" && notes[0].href === `/investigate/${id1}` && notes[0].readAt === null, notes);

    // ---- Re-running the finishing work (as a retry would) does not double count
    const result: AgentResult = { verdict: { verdict: "INCONCLUSIVE", concern: "MEDIUM", confidence: "LOW", summary: "x. This is a signal, not a legal finding.", signals: [], guidance: ["g"], limitations: null, sources: [] }, ledger: [], adjustments: [], degraded: null, notes: "", steps: 0, toolCalls: 0, usage: { inputTokens: 0, outputTokens: 0 }, modelId: "m", promptVersion: "p" };
    const ref = { investigationId: id1, runId: run.id, userId: user.id, workspaceId: workspace.id, title: a.title, input: { inputType: "LINK" as const, input: fake }, stepIds: {} as never, startedAt: Date.now() };
    await finaliseInvestigation(ref, result, { urls: [], domains: [], phones: [], upis: [], emails: [] });
    await completeInvestigation(ref, result.verdict.summary, result.verdict.verdict);
    check("finishing the same run again changes neither usage nor notifications (retry-safe)", (await usage()) === 1 && (await prisma.notification.count({ where: { userId: user.id } })) === 1);
    await prisma.investigationResult.deleteMany({ where: { investigationId: id1 } }); // the re-run above replaced the verdict with a dummy

    // ---- The same event again is deduplicated
    await inngest.send(investigationRequested.create({ investigationId: id1, userId: user.id }, { id: `investigation-${id1}` }));
    await sleep(8000);
    check("sending the same event again starts nothing new", (await prisma.workflowRun.count({ where: { investigationId: id1 } })) === 1 && (await usage()) === 1);

    // ---- 2. A verified directory listing names the business
    const verifiedSlug = "shillong-hills-homestay";
    const prop = await prisma.property.findUniqueOrThrow({ where: { slug: verifiedSlug }, select: { id: true, domain: true } });
    const id2 = await start({ inputType: "LINK", input: `https://${prop.domain}/rooms`, options: { capture: false, research: false } });
    const s2 = await waitDone(id2);
    const b = await snapshot(id2);
    check("a verified listing: COMPLETED, and the business is recorded on the investigation", s2 === "COMPLETED" && b.matchedPropertyId === prop.id, [s2, b.matchedPropertyId]);
    check("  ...the verdict is not SUSPICIOUS, and usage is now 2", b.result?.verdict !== "SUSPICIOUS" && (await usage()) === 2, [b.result?.verdict, await usage()]);
    check("  ...web search was switched off, so no web tool ran", b.workflowRuns[0].toolCalls.every((c) => !["searchWeb", "scrapePage"].includes(c.name)), b.workflowRuns[0].toolCalls.map((c) => c.name));

    // ---- 3. Page capture: the live browser session is stored and the page is saved as evidence
    const id3 = await start({ inputType: "LINK", input: "https://example.com", options: { capture: true, research: false } });
    // The session id must appear while the run is still going, so the live view can attach.
    let sessionWhileRunning = false;
    const t3 = Date.now();
    while (Date.now() - t3 < 240_000) {
      const r = await steady(() => prisma.workflowRun.findFirst({ where: { investigationId: id3 }, select: { browserSessionId: true, status: true } }));
      if (r?.browserSessionId && r.status === "RUNNING") { sessionWhileRunning = true; break; }
      if (r && ["COMPLETED", "FAILED"].includes(r.status)) break;
      await sleep(700);
    }
    const s3 = await waitDone(id3);
    const c = await snapshot(id3);
    const evKeys = c.evidence.map((e) => keyFromRef(e.storageUrl)).filter((k): k is string => !!k);
    touched.push(...evKeys);
    check("capture: the Browserbase session id is stored while the run is still going", sessionWhileRunning && !!c.workflowRuns[0].browserSessionId, c.workflowRuns[0].browserSessionId);
    check("capture: the step COMPLETED and the page was saved as evidence on this investigation", s3 === "COMPLETED" && c.workflowRuns[0].steps[2].status === "COMPLETED" && c.evidence.some((e) => e.kind === "SCREENSHOT" && e.investigationId === id3), [s3, c.workflowRuns[0].steps[2].status, c.evidence.map((e) => e.kind)]);
    const ctypes = c.workflowRuns[0].events.map((e) => e.type);
    check("capture: one event per browser action, in order, under the capture step", ["browser_starting", "browser_session_started", "page_navigating", "page_navigated", "page_captured"].every((t, i, arr) => ctypes.indexOf(t) >= 0 && (i === 0 || ctypes.indexOf(t) > ctypes.indexOf(arr[i - 1]))) && c.workflowRuns[0].events.filter((e) => e.type.startsWith("page_") || e.type.startsWith("browser_")).every((e) => e.stepId === c.workflowRuns[0].steps[2].id), ctypes);
    check("capture: the verdict was still produced", !!c.result, c.result);

    // ---- 4. A page that cannot be opened costs confidence, not the run
    const id4 = await start({ inputType: "LINK", input: "https://this-domain-does-not-exist-ttd.example", options: { capture: true, research: false } });
    const s4 = await waitDone(id4);
    const d = await snapshot(id4);
    const dsteps = d.workflowRuns[0].steps;
    check("a failed capture: that step is FAILED but the run COMPLETED with a verdict", s4 === "COMPLETED" && dsteps[2].status === "FAILED" && !!dsteps[2].error && !!d.result && dsteps.filter((s) => s.key !== "capture-page").every((s) => s.status === "COMPLETED"), [s4, dsteps.map((s) => `${s.key}:${s.status}`)]);
    check("  ...the failure is on the timeline, and the limits say the page could not be opened", d.workflowRuns[0].events.some((e) => e.type === "capture_failed") && /could not be opened in a live browser/i.test(d.result?.limitations ?? ""), d.result?.limitations);
    check("  ...no evidence was saved for it", d.evidence.length === 0);

    // ---- 5. Cancelling a run
    const before = await usage();
    const id5 = await start({ inputType: "MESSAGE", input: "Driver says Rs 4000 from Guwahati airport to Shillong in a sedan", options: { capture: false } });
    await sleep(2500);
    const cancelled = await cancelInvestigation(user.id, id5);
    const s5 = await waitDone(id5, 30_000);
    await sleep(25_000); // a cancelled run must stay cancelled
    const e = await snapshot(id5);
    check("cancel: the investigation stays CANCELLED, with no verdict, no usage and no notification", cancelled.ok && s5 === "CANCELLED" && (await prisma.investigation.findUniqueOrThrow({ where: { id: id5 } })).status === "CANCELLED" && !e.result && (await usage()) === before && (await prisma.notification.count({ where: { userId: user.id, data: { path: ["investigationId"], equals: id5 } } })) === 0, [cancelled, s5, !!e.result, await usage(), before]);
    check("cancel: unfinished steps are not left running", e.workflowRuns[0].status === "CANCELLED" && e.workflowRuns[0].steps.every((s) => s.status !== "RUNNING" && s.status !== "QUEUED"), e.workflowRuns[0].steps.map((s) => s.status));
    check("cancel: only the owner can stop a run, and a finished run cannot be cancelled", !(await cancelInvestigation("someone-else", id1)).ok && !(await cancelInvestigation(user.id, id1)).ok);
  } finally {
    const linked = await prisma.investigationIdentifier.findMany({ where: { investigation: { userId: user.id } }, select: { identifierId: true } });
    const evidence = await prisma.evidence.findMany({ where: { ownerId: user.id }, select: { storageUrl: true } });
    for (const ev of evidence) { const k = keyFromRef(ev.storageUrl); if (k) await deleteObject(k).catch(() => undefined); }
    for (const k of touched) await deleteObject(k).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
    // identifiers this test created (nothing else refers to them) go too; the seeded ones stay
    await prisma.identifier.deleteMany({ where: { id: { in: linked.map((l) => l.identifierId) }, properties: { none: {} }, reports: { none: {} }, investigations: { none: {} } } });
    const left = (await prisma.investigation.count({ where: { userId: user.id } })) + (await prisma.evidence.count({ where: { ownerId: user.id } })) + (await prisma.usageRecord.count({ where: { userId: user.id } }));
    check("cleanup: nothing left behind", left === 0, left);
    void ids;
  }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll investigation workflow checks passed");
    process.exit(fails ? 1 : 0);
  });
