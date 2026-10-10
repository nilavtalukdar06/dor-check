import { generateText, isStepCount, Output, ToolLoopAgent, type LanguageModel } from "ai";
import { EvidenceLedger, type LedgerSource } from "@/lib/evidence-ledger";
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
import { createAgentTools, findSimilarReports, lookupDirectory, tracked, type AgentDeps, type AgentOptions, type ToolContext } from "@/server/agent-tools";
import { capturePage, type CaptureOwner } from "@/server/capture";
import { scrapeUrl, searchWeb } from "@/server/research";
import { retrieve } from "@/server/retrieve";

// The investigation agent. Three stages:
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

/** Real services for everything a run needs. */
export function defaultAgentDeps(): AgentDeps {
  return { searchWeb, scrapeUrl, retrieve, lookupPrice, directory: directoryData, reports: reportData, record: () => undefined };
}

/** Page capture for this investigation's owner (Phase 19 passes it in when capture is on). */
export const captureFor = (owner: CaptureOwner) => (url: string) => capturePage(url, owner);

export async function runInvestigationAgent(input: AgentInput, config: AgentRunConfig = {}): Promise<AgentResult> {
  const deps: AgentDeps = { ...defaultAgentDeps(), ...config.deps };
  const options: AgentOptions = { ...DEFAULT_OPTIONS, ...input.options, capture: Boolean(input.options?.capture ?? DEFAULT_OPTIONS.capture) && Boolean(deps.capturePage) };
  const ledger = new EvidenceLedger();
  const ctx: ToolContext = { ledger, deps, options, calls: {} };
  const model = config.model ?? agentModel();
  const modelId = config.modelId ?? AGENT_MODEL_ID;
  const request = cap(input.input, 2000);
  const statement = input.sellerStatement ? cap(input.sellerStatement, 1500) : "";
  const ids = extractIdentifiers(`${request}\n${statement}`);
  const unchecked: string[] = [];
  ledger.addUserInput(`${request}${statement ? `\nThe seller said: ${statement}` : ""}`);
  let degraded: string | null = null;
  let inputTokens = 0, outputTokens = 0;

  // ── 1. Look-ups that need no judgement
  const early: Record<string, unknown> = {};
  const domain = ids.domains[0];
  const phone = ids.phones[0];
  const upi = ids.upis[0];
  const name = input.inputType === "BUSINESS_NAME" ? request : undefined;
  if (domain || phone || upi || name) {
    early.directory = await tracked("lookupDirectory", ctx, (q: Parameters<typeof lookupDirectory>[1]) => lookupDirectory(ctx, q))({ domain, phone, upi, name });
    early.reports = await tracked("findSimilarReports", ctx, (q: Parameters<typeof findSimilarReports>[1]) => findSimilarReports(ctx, q))({ domain, phone, upi, text: options.knowledge ? cap(request, 300) : undefined });
  }

  // ── 2. The tool-using loop
  let notes = "";
  let steps = 0;
  const tools = createAgentTools(ctx);
  try {
    const agent = new ToolLoopAgent({ model, instructions: AGENT_INSTRUCTIONS, tools, stopWhen: isStepCount(config.maxSteps ?? 8), temperature: 0.2 });
    const prompt = [
      `Check this ${LABEL[input.inputType]}:`,
      `<request>\n${request}\n</request>`,
      statement ? `What the seller said:\n<seller_statement>\n${statement}\n</seller_statement>` : null,
      `Identifiers found: ${JSON.stringify(ids)}`,
      Object.keys(early).length ? `Checks already done for you (use these results; do not repeat them):\n${JSON.stringify(early)}` : "No identifiers were found in the request, so no automatic directory check ran.",
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
  if (!options.capture) unchecked.push("The page was not opened in a live browser.");
  const unreadable = ledger.all().filter((s) => s.unavailable).length;
  if (unreadable) unchecked.push(`${unreadable} web page${unreadable === 1 ? "" : "s"} could not be read.`);
  if (ids.urls.length > 0 && !ctx.calls.scrapePage && !ctx.calls.capturePage) unchecked.push("The page behind the link was not read.");

  // ── 3. The verdict
  let verdict: FinalVerdict;
  let adjustments: string[] = [];
  try {
    const dossier = buildDossier({ request: `${LABEL[input.inputType]}: ${cap(request, 1200)}${statement ? `\nSeller said: ${cap(statement, 600)}` : ""}`, identifiers: JSON.stringify(ids), ledger, notes, unchecked });
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
