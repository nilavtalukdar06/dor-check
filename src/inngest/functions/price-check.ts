import { inngest } from "../client";
import { priceRunChannel } from "../channels";
import { priceCheckRequested } from "../events";
import { combineResults, extractFromPage, searchPages, type PageResult, type ResearchResult } from "@/server/price-research";
import {
  compareStep,
  completeRun,
  estimateStep,
  failRun,
  loadRunRef,
  researchFailed,
  researchFinished,
  researchGate,
  researchNote,
  researchStarted,
  researchSubject,
  resolvePlacesStep,
  routeStep,
  saveResearchStep,
  skipStep,
  tariffStep,
  toolLogger,
  type Publish,
} from "@/server/price-pipeline";

/** Pages we ask the model to read per check. Keeps cost and free-tier usage predictable. */
const MAX_PAGES = 8;

/** Publish from inside a step.run (already a memoised step, so no step-in-step wrapping). */
const publisher =
  (investigationId: string): Publish =>
  (message) =>
    inngest.realtime.publish(priceRunChannel(investigationId).progress, { ...message, at: Date.now() }).then(() => undefined);

/**
 * A price check as a durable workflow. Every step is retried on its own, survives a restart,
 * and streams its progress to the browser through Inngest Realtime.
 */
export const runPriceCheck = inngest.createFunction(
  {
    id: "run-price-check",
    triggers: [priceCheckRequested],
    retries: 3,
    // Two checks at a time per user keeps research within Firecrawl and Gemini limits.
    concurrency: [{ key: "event.data.userId", limit: 2 }],
    timeouts: { finish: "5m" },
    onFailure: async ({ event, error }) => {
      const investigationId = (event.data.event.data as { investigationId?: string }).investigationId;
      if (!investigationId) return;
      await failRun(investigationId, error.message);
      await inngest.realtime.publish(priceRunChannel(investigationId).finished, { status: "FAILED", at: Date.now() });
    },
  },
  async ({ event, step }) => {
    const { investigationId } = event.data;
    const publish = publisher(investigationId);

    const ref = await step.run("load-run", () => loadRunRef(investigationId));
    const places = await step.run("resolve-places", () => resolvePlacesStep(ref, publish));
    const route = await step.run("route", () => routeStep(ref, places, publish));
    const tariff = await step.run("find-tariff", () => tariffStep(ref, places, publish));

    let researched: { lowInr: number; highInr: number; unit: string; benchmarkId: string; sampleSize: number } | null = null;
    let estimate = null;
    let pagesRead = 0;

    if (tariff.band === "NO_REFERENCE") {
      const gate = await step.run("research-gate", async () => {
        const g = await researchGate(ref, publish);
        if (!g.allowed) return { ...g, startedAt: 0 };
        await researchStarted(ref, places, route, publish);
        return { ...g, startedAt: Date.now() };
      });

      if (gate.allowed) {
        const researchStartedAt = gate.startedAt;
        const subject = researchSubject(ref, places, route);
        const log = toolLogger(ref);

        try {
          // 1. Find pages. Retries on its own if the search service is down.
          const pages = (
            await step.run("search-pages", async () => {
              const found = await searchPages(subject, log);
              await researchNote(ref, publish, "pages_found", `Read ${found.length} public page${found.length === 1 ? "" : "s"}`);
              return found;
            })
          ).slice(0, MAX_PAGES);
          pagesRead = pages.length;

          // 2. Read every page in parallel. A page that keeps failing is skipped, not fatal.
          const empty = (url: string): PageResult => ({ url, observations: [], extracted: 0, matching: 0, verified: 0 });
          const results = await Promise.all(
            pages.map((page, i) =>
              step.run(`read-page-${i}`, () => extractFromPage(subject, page, log)).catch(() => empty(page.url)),
            ),
          );

          // 3. Combine, record, and save the range if it is trustworthy.
          const research: ResearchResult = await step.run("combine-prices", async () => {
            const combined = combineResults(subject, results, pagesRead);
            await researchNote(
              ref,
              publish,
              "prices_found",
              `Found ${combined.stats.usable} verified price${combined.stats.usable === 1 ? "" : "s"}`,
            );
            await researchFinished(ref, publish, combined, researchStartedAt);
            return combined;
          });

          if (research.ok) {
            const benchmarkId = await step.run("save-research", () => saveResearchStep(ref, places, route, research));
            researched = {
              lowInr: research.lowInr,
              highInr: research.highInr,
              unit: research.unit,
              benchmarkId,
              sampleSize: research.kept.length,
            };
          }
        } catch {
          await step.run("research-failed", () => researchFailed(ref, publish, researchStartedAt));
        }
      }

      if (!researched) {
        estimate = await step.run("estimate", () => estimateStep(ref, route, publish));
      }
    }

    // One step for the closing writes: they are quick and safe to repeat, and fewer steps
    // means fewer round trips between Inngest and this app.
    await step.run("finalize", async () => {
      if (tariff.band !== "NO_REFERENCE") await skipStep(ref, publish, "research");
      if (tariff.band !== "NO_REFERENCE" || researched) await skipStep(ref, publish, "estimate");
      await compareStep(ref, { places, route, tariff, researched, estimate, researchPagesRead: pagesRead }, publish);
      await completeRun(ref);
    });

    // Outside any step.run, so the publish is itself a durable step.
    await step.realtime.publish("announce-finished", priceRunChannel(investigationId).finished, {
      status: "COMPLETED",
      at: Date.now(),
    });
    return { investigationId };
  },
);
