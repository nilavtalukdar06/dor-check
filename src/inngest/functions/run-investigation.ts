import { NonRetriableError } from "inngest";
import { extractIdentifiers } from "@/lib/identifiers";
import { capturableUrl, compactSources, describeRequest, describeSources, type InvestigationStepKey } from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { withTimeout } from "@/lib/retry";
import { analyse, capturePageStage, captureFor, retrieveBenchmarks, searchSources, type AgentResult, type AgentState } from "@/server/agent";
import { dbToolRecorder } from "@/server/agent-persist";
import { captureConfigured } from "@/server/capture";
import { beginStep, completeInvestigation, failInvestigation, finaliseInvestigation, finishStep, isCancelled, loadRunRef, note, type RunRef } from "@/server/investigation";
import { inngest } from "../client";
import { investigationCancelled, investigationRequested } from "../events";

/** One run's trip through the six steps. A step that throws is marked failed and retried by Inngest. */
async function failStep(ref: RunRef, key: InvestigationStepKey, err: unknown, startedAt: number): Promise<never> {
  const message = err instanceof Error ? err.message : String(err);
  await finishStep(ref, key, "FAILED", { error: message, startedAt }).catch(() => undefined);
  throw err;
}

/**
 * The whole investigation as a durable workflow: understand the request, search sources, capture
 * the page, compare with tariffs, analyse, write the verdict. Each step is retried on its own.
 * A capture that fails costs confidence, not the run.
 */
export const runInvestigation = inngest.createFunction(
  {
    id: "run-investigation",
    triggers: [investigationRequested],
    retries: 3,
    // Two checks at a time per person protects the Firecrawl, Browserbase and Gemini quotas.
    concurrency: [{ key: "event.data.userId", limit: 2 }],
    cancelOn: [{ event: investigationCancelled, if: "event.data.investigationId == async.data.investigationId" }],
    timeouts: { finish: "10m" },
    onFailure: async ({ event, error }) => {
      const id = (event.data.event.data as { investigationId?: string }).investigationId;
      if (id) await failInvestigation(id, error.message || "The check could not finish");
    },
  },
  async ({ event, step }) => {
    const { investigationId } = event.data;

    // ── 1. parse-input
    const parsed = await step.run("parse-input", async () => {
      const ref = await loadRunRef(investigationId);
      if (!ref) return null;
      const t = Date.now();
      await beginStep(ref, "parse-input");
      const ids = extractIdentifiers(`${ref.input.input}\n${ref.input.sellerStatement ?? ""}`);
      await note(ref, "parse-input", "request_parsed", describeRequest(ids, ref.input.inputType));
      await finishStep(ref, "parse-input", "COMPLETED", { startedAt: t, output: { identifiers: { domains: ids.domains.length, phones: ids.phones.length, upis: ids.upis.length } } });
      return { ref, ids };
    });
    if (!parsed) return { cancelled: true };
    const { ref, ids } = parsed;
    const { input } = ref;
    const record = (key: InvestigationStepKey) => ({ record: dbToolRecorder(ref.runId, ref.stepIds[key]) });

    // ── 2. search-sources
    let state = (await step.run("search-sources", async () => {
      if (await isCancelled(investigationId)) throw new NonRetriableError("cancelled");
      const t = Date.now();
      await beginStep(ref, "search-sources");
      try {
        await note(ref, "search-sources", "research_started", "Checking the directory and community reports");
        const s = await withTimeout(searchSources(input, { deps: record("search-sources") }, undefined, { webSearch: true }), 60_000);
        await note(ref, "search-sources", "sources_found", describeSources(s.ledger.sources));
        await finishStep(ref, "search-sources", "COMPLETED", { startedAt: t, output: { sources: s.ledger.sources.length, found: compactSources(s.ledger.sources) } });
        return s;
      } catch (err) {
        return failStep(ref, "search-sources", err, t);
      }
    })) as AgentState;

    // ── 3. capture-page (a failure here never fails the run)
    const link = capturableUrl(ids);
    state = (await step.run("capture-page", async () => {
      const t = Date.now();
      await beginStep(ref, "capture-page");
      const skip = !input.options?.capture ? "Page capture was not requested" : !link ? "There is no link to open" : !captureConfigured() ? "Live page capture is not set up" : null;
      if (skip || !link) {
        await note(ref, "capture-page", "capture_skipped", skip ?? "There is no link to open");
        await finishStep(ref, "capture-page", "SKIPPED", { startedAt: t });
        return state;
      }
      const deps = {
        ...record("capture-page"),
        capturePage: captureFor({
          userId: ref.userId,
          workspaceId: ref.workspaceId,
          investigationId,
          subject: ref.title,
          // Stored the moment the browser exists, so the live view can attach.
          onSession: async (sessionId) => {
            await prisma.workflowRun.update({ where: { id: ref.runId }, data: { browserSessionId: sessionId } });
          },
          emit: (type, message) => note(ref, "capture-page", type, message),
        }),
      };
      try {
        const res = await withTimeout(capturePageStage(input, { deps }, state, link), 120_000);
        if (res.ok) {
          await finishStep(ref, "capture-page", "COMPLETED", { startedAt: t, output: { found: compactSources(res.state.ledger.sources.filter((x) => x.via === "browserbase")) } });
        } else {
          await note(ref, "capture-page", "capture_failed", res.reason ?? "The page could not be captured");
          await finishStep(ref, "capture-page", "FAILED", { startedAt: t, error: res.reason ?? "The page could not be captured" });
        }
        return res.state;
      } catch (err) {
        // A timeout or crash is also only a missing piece of evidence.
        await note(ref, "capture-page", "capture_failed", "The page capture did not finish");
        await finishStep(ref, "capture-page", "FAILED", { startedAt: t, error: err instanceof Error ? err.message : String(err) });
        return { ...state, captureTried: true };
      }
    })) as AgentState;

    // ── 4. retrieve-benchmarks
    state = (await step.run("retrieve-benchmarks", async () => {
      const t = Date.now();
      await beginStep(ref, "retrieve-benchmarks");
      if (!input.options?.knowledge) {
        await finishStep(ref, "retrieve-benchmarks", "SKIPPED", { startedAt: t });
        return state;
      }
      try {
        const s = await withTimeout(retrieveBenchmarks(input, { deps: record("retrieve-benchmarks") }, state), 45_000);
        const found = s.ledger.sources.filter((x) => x.kind === "TARIFF" || x.kind === "ADVISORY").length;
        await note(ref, "retrieve-benchmarks", "benchmark_calculated", found ? `Found ${found} tariff and advisory references` : "No matching tariffs or advisories");
        await finishStep(ref, "retrieve-benchmarks", "COMPLETED", { startedAt: t, output: { references: found, found: compactSources(s.ledger.sources.filter((x) => x.kind === "TARIFF" || x.kind === "ADVISORY")) } });
        return s;
      } catch (err) {
        return failStep(ref, "retrieve-benchmarks", err, t);
      }
    })) as AgentState;

    // ── 5. analyse
    const result = (await step.run("analyse", async () => {
      if (await isCancelled(investigationId)) throw new NonRetriableError("cancelled");
      const t = Date.now();
      await beginStep(ref, "analyse");
      try {
        const r = await withTimeout(analyse(input, { deps: record("analyse") }, state), 170_000);
        const v = r.verdict;
        await note(ref, "analyse", "analysis_completed", `Verdict: ${v.verdict.replace("_", " ").toLowerCase()} · ${v.concern.toLowerCase()} concern · ${v.confidence.toLowerCase()} confidence`);
        if (r.degraded) await note(ref, "analyse", "analysis_degraded", "The analysis was only partly completed");
        await finishStep(ref, "analyse", "COMPLETED", { startedAt: t, output: { verdict: v.verdict, degraded: r.degraded, toolCalls: r.toolCalls, steps: r.steps } });
        return r;
      } catch (err) {
        return failStep(ref, "analyse", err, t);
      }
    })) as AgentResult;

    // ── 6. finalise
    return step.run("finalise", async () => {
      const t = Date.now();
      await beginStep(ref, "finalise");
      try {
        const done = await finaliseInvestigation(ref, result, ids);
        await note(ref, "finalise", "verdict_saved", `Saved the verdict with ${done.sources} cited source${done.sources === 1 ? "" : "s"}`);
        await finishStep(ref, "finalise", "COMPLETED", { startedAt: t, output: { sources: done.sources, reportMatches: done.reportMatches } });
        // Only now does the investigation itself become COMPLETED (with usage and the notification).
        await completeInvestigation(ref, result.verdict.summary, result.verdict.verdict);
        return { verdict: result.verdict.verdict, ...done };
      } catch (err) {
        return failStep(ref, "finalise", err, t);
      }
    });
  },
);
