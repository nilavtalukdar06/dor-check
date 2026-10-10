import { generateText, isStepCount, Output, ToolLoopAgent, type LanguageModel } from "ai";
import { EvidenceLedger, type LedgerSnapshot, type LedgerSource } from "@/lib/evidence-ledger";
import { extractIdentifiers } from "@/lib/identifiers";
import { lookupPrice } from "@/server/price";
import {
  AGENT_INSTRUCTIONS,
  buildDossier,
  fallbackVerdict,
  finalizeVerdict,
  modelVerdictSchema,
  PROMPT_VERSION,
  VERDICT_SYSTEM,
  type FinalVerdict,
} from "@/lib/verdict";
import { agentModel, AGENT_MODEL_ID } from "@/server/ai";
import { directoryData, reportData } from "@/server/agent-data";
import { createAgentTools, findSimilarReports, lookupDirectory, runCapturePage, runRetrieveKnowledge, runSearchWeb, tracked, type AgentDeps, type AgentOptions, type ToolContext } from "@/server/agent-tools";
import { capturePage, type CaptureOwner } from "@/server/capture";
import { scrapeUrl, searchWeb } from "@/server/research";
import { retrieve } from "@/server/retrieve";

// The investigation agent. Three stages:
// The stages below can run in one call (runInvestigationAgent) or one per durable workflow step
// (Phase 19): what they share is an AgentState, which is plain JSON.
//   1. Look-ups that need no judgement (directory and community reports by any identifier in the
//      request) run first, so the agent always starts informed.
//   2. A tool-using loop gathers more evidence (knowledge, price, web, page capture).
//   3. A separate step writes the verdict as typed data from the evidence ledger; then code
//      applies the rules (every claim cited, no verdict the evidence does not support).

export type AgentInput = {
  inputType: "LINK" | "BUSINESS_NAME" | "MESSAGE" | "CONTACT";
  /** The pasted link, name, message, or phone/UPI. */
  input: string;
  /** "Anything the seller said (optional)". */
  sellerStatement?: string | null;
  options?: Partial<AgentOptions>;
  /** Hints the traveller chose on the form. */
  context?: { district?: string | null; service?: string | null };
};

export type AgentRunConfig = {
  /** Replace any service (tests). Real ones are used for anything left out. */
  deps?: Partial<AgentDeps>;
  /** The model for both stages, or one per stage. */
  model?: LanguageModel;
  verdictModel?: LanguageModel;
  modelId?: string;
  /** Steps the tool loop may take. */
  maxSteps?: number;
  abortSignal?: AbortSignal;
};

export type AgentResult = {
  verdict: FinalVerdict;
  /** Everything the tools read, including pages that could not be read. */
  ledger: LedgerSource[];
  /** Changes the rules made to the model's answer. */
  adjustments: string[];
  /** Set when the analysis could not be completed and the verdict is the honest fallback. */
  degraded: string | null;
  notes: string;
  steps: number;
  toolCalls: number;
  usage: { inputTokens: number; outputTokens: number };
  modelId: string;
  promptVersion: string;
};

const DEFAULT_OPTIONS: AgentOptions = { research: true, capture: false, knowledge: true, price: true };
const LABEL: Record<AgentInput["inputType"], string> = { LINK: "link to a booking or listing", BUSINESS_NAME: "business name", MESSAGE: "message from a seller", CONTACT: "phone number or UPI id" };

const cap = (s: string, n: number) => s.trim().slice(0, n);

/** "District: Shillong. Service: taxi." or an empty string. */
const contextLine = (c: AgentInput["context"]) =>
  [c?.district ? `District: ${c.district}` : null, c?.service && c.service !== "OTHER" ? `Service: ${c.service.toLowerCase()}` : null].filter(Boolean).join(". ");

/** Real services for everything a run needs. */
export function defaultAgentDeps(): AgentDeps {
  return { searchWeb, scrapeUrl, retrieve, lookupPrice, directory: directoryData, reports: reportData, record: () => undefined };
}

/** Page capture for this investigation's owner (Phase 19 passes it in when capture is on). */
export const captureFor = (owner: CaptureOwner) => (url: string) => capturePage(url, owner);

/**
 * What the stages hand to each other. JSON-safe, so a workflow step can return it and the next
 * step can pick it up: the evidence found so far, the early look-up results, how many calls each
 * tool has had, and whether a page capture was tried.
 */
export type AgentState = {
  ledger: LedgerSnapshot;
  early: Record<string, unknown>;
  calls: Record<string, number>;
  captureTried: boolean;
};

type Prepared = {
  deps: AgentDeps;
  options: AgentOptions;
  ledger: EvidenceLedger;
  ctx: ToolContext;
  state: AgentState;
  request: string;
  statement: string;
  ids: ReturnType<typeof extractIdentifiers>;
};

/** Set up a stage: real services plus any overrides, and the ledger and counters from `state`. */
function prepare(input: AgentInput, config: AgentRunConfig, state?: AgentState): Prepared {
  const deps: AgentDeps = { ...defaultAgentDeps(), ...config.deps };
  const options: AgentOptions = { ...DEFAULT_OPTIONS, ...input.options, capture: Boolean(input.options?.capture ?? DEFAULT_OPTIONS.capture) && Boolean(deps.capturePage) };
  const request = cap(input.input, 2000);
  const statement = input.sellerStatement ? cap(input.sellerStatement, 1500) : "";
  const ledger = state ? EvidenceLedger.restore(state.ledger) : new EvidenceLedger();
  if (!state) ledger.addUserInput(`${request}${statement ? `\nThe seller said: ${statement}` : ""}`);
  const ctx: ToolContext = { ledger, deps, options, calls: { ...(state?.calls ?? {}) } };
  const current: AgentState = state ?? { ledger: ledger.snapshot(), early: {}, calls: {}, captureTried: false };
  return { deps, options, ledger, ctx, state: current, request, statement, ids: extractIdentifiers(`${request}\n${statement}`) };
}

const save = (p: Prepared, patch: Partial<AgentState> = {}): AgentState => ({ ...p.state, ...patch, ledger: p.ledger.snapshot(), calls: { ...p.ctx.calls } });

/**
 * Stage 1, search sources: the look-ups that need no judgement (directory and community reports by
 * any identifier in the request) and, when asked, a web search about the seller.
 */
export async function searchSources(input: AgentInput, config: AgentRunConfig = {}, state?: AgentState, opts: { webSearch?: boolean } = {}): Promise<AgentState> {
  const p = prepare(input, config, state);
  const { ctx, ids, request, options } = p;
  const early: Record<string, unknown> = { ...p.state.early };
  const domain = ids.domains[0];
  const phone = ids.phones[0];
  const upi = ids.upis[0];
  const name = input.inputType === "BUSINESS_NAME" ? request : undefined;
  if (domain || phone || upi || name) {
    early.directory = await tracked("lookupDirectory", ctx, (q: Parameters<typeof lookupDirectory>[1]) => lookupDirectory(ctx, q))({ domain, phone, upi, name });
    early.reports = await tracked("findSimilarReports", ctx, (q: Parameters<typeof findSimilarReports>[1]) => findSimilarReports(ctx, q))({ domain, phone, upi, text: options.knowledge ? cap(request, 300) : undefined });
  }
  if (opts.webSearch && options.research && (domain || name)) {
    early.web = await tracked("searchWeb", ctx, (q: { query: string }) => runSearchWeb(ctx, q))({ query: domain ? `${domain} reviews complaints` : `${name} reviews complaints` });
  }
  return save(p, { early });
}

/** Stage 3, capture the page in the remote browser. A failure is recorded and the run goes on. */
export async function capturePageStage(input: AgentInput, config: AgentRunConfig, state: AgentState, url: string): Promise<{ state: AgentState; ok: boolean; reason?: string }> {
  const p = prepare(input, config, state);
  const out = await tracked("capturePage", p.ctx, (q: { url: string }) => runCapturePage(p.ctx, q))({ url });
  return { state: save(p, { captureTried: true }), ok: out.ok === true, reason: typeof out.reason === "string" ? out.reason : typeof out.error === "string" ? out.error : undefined };
}

/** Stage 4, retrieve benchmarks: tariffs and advisories that bear on the request. */
export async function retrieveBenchmarks(input: AgentInput, config: AgentRunConfig, state: AgentState): Promise<AgentState> {
  const p = prepare(input, config, state);
  if (p.options.knowledge) {
    // The district and service the traveller chose make the search more specific (as words, not a filter:
    // taxi tariffs carry no district).
    const hint = contextLine(input.context).replace(/^District: /, "in ").replace(/\. Service: /, ", ");
    await tracked("retrieveKnowledge", p.ctx, (q: Parameters<typeof runRetrieveKnowledge>[1]) => runRetrieveKnowledge(p.ctx, q))({ query: cap(`${p.request}${hint ? ` ${hint}` : ""}`, 300), types: ["TARIFF", "ADVISORY"] });
  }
  return save(p);
}

/** Short list of what is already in the ledger, so the model does not repeat a search. */
const ledgerSummary = (ledger: EvidenceLedger) =>
  ledger.all().map((s) => `${s.id} ${s.kind} ${s.unavailable ? "(unavailable) " : ""}${s.title}${s.label ? ` [${s.label}]` : ""}`).join("\n");

/** Stage 5, analyse: the tool loop for anything still missing, then the verdict, then the rules. */
export async function analyse(input: AgentInput, config: AgentRunConfig = {}, state?: AgentState): Promise<AgentResult> {
  const p = prepare(input, config, state);
  const { ctx, ledger, options, ids, request, statement } = p;
  const model = config.model ?? agentModel();
  const modelId = config.modelId ?? AGENT_MODEL_ID;
  const unchecked: string[] = [];
  let degraded: string | null = null;
  let inputTokens = 0, outputTokens = 0;
  const early = p.state.early;
  const captured = p.state.captureTried && ledger.all().some((s) => s.via === "browserbase" && !s.unavailable);

  // ── The tool-using loop
  let notes = "";
  let steps = 0;
  const tools = createAgentTools(ctx);
  // A capture that was already tried in its own step is not offered again.
  if (p.state.captureTried) delete tools.capturePage;
  try {
    const agent = new ToolLoopAgent({ model, instructions: AGENT_INSTRUCTIONS, tools, stopWhen: isStepCount(config.maxSteps ?? 8), temperature: 0.2 });
    const prompt = [
      `Check this ${LABEL[input.inputType]}:`,
      `<request>\n${request}\n</request>`,
      statement ? `What the seller said:\n<seller_statement>\n${statement}\n</seller_statement>` : null,
      contextLine(input.context) ? `The traveller says: ${contextLine(input.context)}.` : null,
      `Identifiers found: ${JSON.stringify(ids)}`,
      Object.keys(early).length ? `Checks already done for you (use these results; do not repeat them):\n${JSON.stringify(early)}` : "No identifiers were found in the request, so no automatic directory check ran.",
      `Evidence already gathered (cite by id):\n${ledgerSummary(ledger)}`,
      `Tools you have: ${Object.keys(tools).join(", ")}.`,
    ].filter(Boolean).join("\n\n");
    const run = await agent.generate({ prompt, abortSignal: config.abortSignal ?? AbortSignal.timeout(100_000) });
    notes = run.text ?? "";
    steps = run.steps?.length ?? 0;
    const u = (run as { totalUsage?: { inputTokens?: number; outputTokens?: number } }).totalUsage ?? run.usage;
    inputTokens += u?.inputTokens ?? 0;
    outputTokens += u?.outputTokens ?? 0;
  } catch (err) {
    // The evidence gathered so far still stands; say the loop stopped early.
    unchecked.push("The evidence-gathering step stopped early, so some checks may be missing.");
    degraded = `agent loop failed: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`;
  }

  // What was not checked, in plain words.
  if (!options.research) unchecked.push("Web research was switched off.");
  if (!options.knowledge) unchecked.push("The knowledge base was not searched.");
  if (!captured) unchecked.push(p.state.captureTried ? "The page could not be opened in a live browser." : "The page was not opened in a live browser.");
  const unreadable = ledger.all().filter((s) => s.unavailable && !(s.via === "browserbase")).length;
  if (unreadable) unchecked.push(`${unreadable} web page${unreadable === 1 ? "" : "s"} could not be read.`);
  if (ids.urls.length > 0 && !ctx.calls.scrapePage && !ctx.calls.capturePage && !captured) unchecked.push("The page behind the link was not read.");

  // ── The verdict
  let verdict: FinalVerdict;
  let adjustments: string[] = [];
  try {
    const dossier = buildDossier({ request: `${LABEL[input.inputType]}: ${cap(request, 1200)}${statement ? `\nSeller said: ${cap(statement, 600)}` : ""}${contextLine(input.context) ? `\n${contextLine(input.context)}.` : ""}`, identifiers: JSON.stringify(ids), ledger, notes, unchecked });
    const res = await generateText({ model: config.verdictModel ?? model, system: VERDICT_SYSTEM, prompt: dossier, output: Output.object({ schema: modelVerdictSchema }), temperature: 0.2, abortSignal: config.abortSignal ?? AbortSignal.timeout(60_000) });
    inputTokens += res.usage?.inputTokens ?? 0;
    outputTokens += res.usage?.outputTokens ?? 0;
    const done = finalizeVerdict(res.output, ledger, unchecked);
    verdict = done.verdict;
    adjustments = done.adjustments;
  } catch (err) {
    degraded = `${degraded ? `${degraded}; ` : ""}verdict step failed: ${String(err instanceof Error ? err.message : err).slice(0, 160)}`;
    verdict = fallbackVerdict(ledger, "The analysis could not be completed, so no verdict is given.");
  }

  return {
    verdict,
    ledger: [...ledger.all()],
    adjustments,
    degraded,
    notes,
    steps,
    toolCalls: Object.values(ctx.calls).reduce((a, b) => a + b, 0),
    usage: { inputTokens, outputTokens },
    modelId,
    promptVersion: PROMPT_VERSION,
  };
}

/** All stages in one call: the look-ups, then the agent. Used by tests and one-off checks. */
export async function runInvestigationAgent(input: AgentInput, config: AgentRunConfig = {}): Promise<AgentResult> {
  return analyse(input, config, await searchSources(input, config));
}
