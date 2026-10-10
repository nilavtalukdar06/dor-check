import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, tool, type LanguageModel, type ToolSet, type UIMessage } from "ai";
import { z } from "zod";
import { EvidenceLedger } from "@/lib/evidence-ledger";
import {
  ASSISTANT_PROMPT_VERSION,
  buildAssistantInstructions,
  CHAT_RATE,
  collectCitations,
  detectLanguage,
  HISTORY_LIMIT,
  isLanguageMode,
  MESSAGE_MAX,
  THREAD_ID_RE,
  threadTitle,
  type Citation,
  type LanguageMode,
  type ResultContext,
} from "@/lib/assistant";
import { INPUT_TYPES } from "@/lib/investigation";
import prisma from "@/lib/prisma";
import { agentModel, AGENT_MODEL_ID, aiConfigured } from "@/server/ai";
import { createAgentTools, type AgentDeps, type AgentOptions, type ToolCallRecord, type ToolContext } from "@/server/agent-tools";
import { defaultAgentDeps } from "@/server/agent";
import { DEFAULT_RUN_OPTIONS, startInvestigation } from "@/server/investigation";
import { getVerdictView } from "@/server/investigation-view";
import { consumeRateLimit } from "@/server/rate-limit";
import { getUsage } from "@/server/usage";
import type { Prisma } from "@/generated/prisma/client";

type Role = "TRAVELLER" | "MODERATOR" | "ADMIN";
export type ChatUser = { id: string; role: Role };

// ───────────────────────── Threads ─────────────────────────

export type ThreadRow = { id: string; title: string; lastMessageAt: Date };

export async function listThreads(userId: string, take = 40): Promise<ThreadRow[]> {
  return prisma.chatThread.findMany({ where: { userId, archivedAt: null }, orderBy: { lastMessageAt: "desc" }, take, select: { id: true, title: true, lastMessageAt: true } });
}

const text = (parts: unknown): string =>
  (Array.isArray(parts) ? (parts as { type?: string; text?: string }[]) : [])
    .filter((p) => p?.type === "text")
    .map((p) => p.text ?? "")
    .join("")
    .trim();

/** A saved conversation as UI messages, only for its owner. */
export async function getThread(userId: string, id: string) {
  if (!THREAD_ID_RE.test(id)) return null;
  const thread = await prisma.chatThread.findFirst({
    where: { id, userId, archivedAt: null },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  if (!thread) return null;
  const messages: UIMessage[] = thread.messages
    .filter((m) => m.role === "USER" || m.role === "ASSISTANT")
    .map((m) => ({
      id: m.id,
      role: m.role === "USER" ? "user" : "assistant",
      parts: Array.isArray(m.parts) && m.parts.length ? (m.parts as UIMessage["parts"]) : [{ type: "text", text: m.content }],
    }));
  return { id: thread.id, title: thread.title, languageMode: (isLanguageMode(thread.languageMode) ? thread.languageMode : "auto") as LanguageMode, investigationId: thread.investigationId, messages };
}

export async function archiveThread(userId: string, id: string) {
  const r = await prisma.chatThread.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: new Date() } });
  return r.count > 0;
}

export async function setThreadLanguage(userId: string, id: string, mode: LanguageMode) {
  await prisma.chatThread.updateMany({ where: { id, userId }, data: { languageMode: mode === "auto" ? null : mode } });
}

/** What the assistant is told about a finished check the person asks about. */
async function resultContext(userId: string, investigationId: string | null): Promise<ResultContext | null> {
  if (!investigationId) return null;
  const v = await getVerdictView(userId, investigationId);
  if (!v) return null;
  return { title: v.title, verdict: v.verdict, concern: v.concern, confidence: v.confidence, summary: v.summary, guidance: v.guidance.slice(0, 4), signals: v.signals.slice(0, 5).map((s) => `${s.title}: ${s.detail}`) };
}

// ───────────────────────── Tools ─────────────────────────

const ASSISTANT_OPTIONS: AgentOptions = { research: false, capture: false, knowledge: true, price: true };

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The agent's read-only lookups, with the sources each call registered attached to its output
 * as `citations` so the page can show them as chips. The model does not see them: it never
 * writes a link itself.
 */
function withCitations(tools: ToolSet, ledger: EvidenceLedger): ToolSet {
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(tools)) {
    const run = t.execute;
    if (!run) {
      out[name] = t;
      continue;
    }
    out[name] = {
      ...t,
      execute: async (input: never, options: never) => {
        const before = ledger.all().length;
        const result = (await run(input, options)) as Record<string, unknown>;
        const citations: Citation[] = ledger
          .all()
          .slice(before)
          .filter((s) => !s.unavailable)
          .map((s) => ({ label: sentence(s.label ?? s.title), url: s.url, kind: s.kind, retrievedAt: s.retrievedAt }));
        return { ...result, citations };
      },
      toModelOutput: ({ output }: { output: unknown }) => {
        const { citations: _omit, ...rest } = (output ?? {}) as Record<string, unknown>;
        void _omit;
        return { type: "json" as const, value: rest as never };
      },
    } as never;
  }
  return out;
}

export type StartFn = typeof startInvestigation;

export function assistantTools(user: ChatUser, opts: { deps?: Partial<AgentDeps>; record?: (c: ToolCallRecord) => void; start?: StartFn } = {}) {
  const ledger = new EvidenceLedger();
  const record = opts.record ?? (() => undefined);
  const deps: AgentDeps = { ...defaultAgentDeps(), ...opts.deps, record };
  const ctx: ToolContext = { ledger, deps, options: ASSISTANT_OPTIONS, calls: {} };
  const lookups = withCitations(createAgentTools(ctx), ledger);

  const investigate = tool({
    description: "Start a full check (a live investigation) of one link, business name, seller message, or phone number / UPI id. Use it once, only when the person gave you something to check and wants it checked. It runs for a minute or two on its own and shows its progress to the person.",
    inputSchema: z.object({
      inputType: z.enum(INPUT_TYPES).describe("LINK, BUSINESS_NAME, MESSAGE or CONTACT (phone number or UPI id)."),
      input: z.string().min(3).max(2000).describe("Exactly what the person gave you to check."),
    }),
    execute: async ({ inputType, input }) => {
      const started = Date.now();
      ctx.calls.startInvestigation = (ctx.calls.startInvestigation ?? 0) + 1;
      let output: Record<string, unknown>;
      if (ctx.calls.startInvestigation > 1) {
        output = { ok: false, error: "A check was already started in this turn. Tell the person to open it." };
      } else {
        const usage = await getUsage(user.id, user.role);
        if (usage.limit !== null && usage.used >= usage.limit) {
          output = { ok: false, error: `The person has used all ${usage.limit} investigations on the ${usage.planName} plan this month. Say so, and that they can still ask you questions.` };
        } else {
          const r = await (opts.start ?? startInvestigation)(user, { inputType, input, options: DEFAULT_RUN_OPTIONS });
          output = r.ok ? { ok: true, investigationId: r.id, status: "started" } : { ok: false, error: r.error };
        }
      }
      await record({ name: "startInvestigation", input: { inputType }, output, status: output.ok ? "COMPLETED" : "FAILED", durationMs: Date.now() - started });
      return output;
    },
  });

  return { ...lookups, startInvestigation: investigate } as ToolSet;
}

// ───────────────────────── One chat turn ─────────────────────────

export type ChatRequest = { id: unknown; message: unknown; languageMode?: unknown; investigationId?: unknown };
export type ChatConfig = { model?: LanguageModel; modelId?: string; deps?: Partial<AgentDeps>; maxSteps?: number; abortSignal?: AbortSignal; /** Replace how a check is started (tests). */ start?: StartFn };

const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Handle one message: check it, save it, answer with the tools, stream the answer and save that
 * too. Everything the model is allowed to know comes from the tools or the saved result.
 */
export async function chatTurn(user: ChatUser, body: ChatRequest, config: ChatConfig = {}): Promise<Response> {
  if (!config.model && !aiConfigured()) return fail(503, "The assistant is not configured.");
  const id = typeof body.id === "string" && THREAD_ID_RE.test(body.id) ? body.id : null;
  if (!id) return fail(400, "Bad chat id.");
  const message = body.message as UIMessage | undefined;
  const question = message?.role === "user" ? text(message.parts) : "";
  if (!question) return fail(400, "Write a message first.");
  if (question.length > MESSAGE_MAX) return fail(400, `Keep it under ${MESSAGE_MAX} characters.`);
  if (!(await consumeRateLimit(`chat:${user.id}`, CHAT_RATE.limit, CHAT_RATE.windowSeconds))) return fail(429, "You've sent a lot of messages. Try again in a little while.");

  // Find or create the thread. A thread belongs to one person.
  let thread = await prisma.chatThread.findUnique({ where: { id }, select: { id: true, userId: true, languageMode: true, investigationId: true } });
  if (thread && thread.userId !== user.id) return fail(404, "Chat not found.");
  const requested = isLanguageMode(body.languageMode) ? body.languageMode : "auto";
  if (!thread) {
    const wanted = typeof body.investigationId === "string" ? body.investigationId : null;
    const investigationId = wanted && (await prisma.investigation.findFirst({ where: { id: wanted, userId: user.id, deletedAt: null }, select: { id: true } })) ? wanted : null;
    const workspace = await prisma.workspace.findFirst({ where: { ownerId: user.id, isPersonal: true }, select: { id: true } });
    thread = await prisma.chatThread.create({
      data: { id, userId: user.id, workspaceId: workspace?.id ?? null, investigationId, title: threadTitle(question), languageMode: requested === "auto" ? null : requested },
      select: { id: true, userId: true, languageMode: true, investigationId: true },
    });
  } else if ((thread.languageMode ?? "auto") !== requested) {
    await setThreadLanguage(user.id, id, requested);
  }

  const history = await prisma.chatMessage.findMany({ where: { threadId: id, role: { in: ["USER", "ASSISTANT"] } }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT });
  const previous: UIMessage[] = history.reverse().map((m) => ({ id: m.id, role: m.role === "USER" ? "user" : "assistant", parts: Array.isArray(m.parts) && m.parts.length ? (m.parts as UIMessage["parts"]) : [{ type: "text", text: m.content }] }));

  const saved = await prisma.chatMessage.create({ data: { threadId: id, role: "USER", content: question, parts: [{ type: "text", text: question }] as Prisma.InputJsonValue, language: detectLanguage(question) } });
  const messages: UIMessage[] = [...previous, { id: saved.id, role: "user", parts: [{ type: "text", text: question }] }];

  const calls: ToolCallRecord[] = [];
  const tools = assistantTools(user, { deps: config.deps, start: config.start, record: (c) => void calls.push(c) });
  const instructions = buildAssistantInstructions({ languageMode: requested, result: await resultContext(user.id, thread.investigationId) });
  const modelId = config.modelId ?? AGENT_MODEL_ID;
  let usage = { inputTokens: 0, outputTokens: 0 };

  const result = streamText({
    model: config.model ?? agentModel(),
    instructions,
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(config.maxSteps ?? 5),
    temperature: 0.3,
    abortSignal: config.abortSignal,
    onFinish: (event) => {
      const u = (event as { totalUsage?: { inputTokens?: number; outputTokens?: number } }).totalUsage ?? (event as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
      usage = { inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0 };
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      onError: (e) => {
        console.error("assistant: stream error", e instanceof Error ? e.message : e);
        return "The assistant ran into a problem. Please try again.";
      },
      onEnd: async ({ responseMessage, isAborted }) => {
        const answer = text(responseMessage.parts);
        if (!answer && !responseMessage.parts.some((p) => p.type.startsWith("tool-"))) return;
        try {
          const row = await prisma.chatMessage.create({
            data: {
              threadId: id,
              role: "ASSISTANT",
              content: answer,
              parts: responseMessage.parts as unknown as Prisma.InputJsonValue,
              language: detectLanguage(answer || question),
              citations: collectCitations(responseMessage.parts) as unknown as Prisma.InputJsonValue,
              modelId,
              promptVersion: ASSISTANT_PROMPT_VERSION,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
            },
          });
          if (calls.length) {
            await prisma.toolCall.createMany({ data: calls.map((c) => ({ chatMessageId: row.id, name: c.name, input: (c.input ?? null) as Prisma.InputJsonValue, output: (c.output ?? null) as Prisma.InputJsonValue, status: c.status, error: c.error ?? null, durationMs: c.durationMs })) });
          }
          await prisma.chatThread.update({ where: { id }, data: { lastMessageAt: new Date() } });
          void isAborted;
        } catch (e) {
          console.error("assistant: could not save the reply", e instanceof Error ? e.message : e);
        }
      },
    }),
  });
}
