import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import type { AgentResult } from "@/server/agent";
import type { ToolCallRecord } from "@/server/agent-tools";

/** Records every tool call of a run as a ToolCall row (args, output, time), for the run's timeline. */
export function dbToolRecorder(runId: string, stepId?: string) {
  return async (call: ToolCallRecord) => {
    try {
      await prisma.toolCall.create({
        data: {
          runId,
          stepId: stepId ?? null,
          name: call.name,
          input: (call.input ?? null) as Prisma.InputJsonValue,
          output: (call.output ?? null) as Prisma.InputJsonValue,
          status: call.status,
          error: call.error ?? null,
          durationMs: call.durationMs,
        },
      });
    } catch (err) {
      // Logging a call must never break the investigation.
      console.warn("agent: could not record a tool call", err instanceof Error ? err.message : err);
    }
  };
}

/**
 * Save an agent result as the investigation's verdict: the result row, its signals, and the
 * sources the signals cite (with when each was retrieved). Running it again for the same
 * investigation replaces the previous result and the sources that result created.
 */
export async function saveAgentResult(investigationId: string, result: AgentResult) {
  const { verdict } = result;
  const cited = new Map(result.ledger.map((s) => [s.id, s]));

  return prisma.$transaction(async (tx) => {
    const previous = await tx.investigationResult.findUnique({ where: { investigationId }, select: { rawOutput: true } });
    const oldSourceIds = ((previous?.rawOutput as { sourceIds?: string[] } | null)?.sourceIds ?? []);
    await tx.investigationResult.deleteMany({ where: { investigationId } });
    if (oldSourceIds.length) await tx.source.deleteMany({ where: { id: { in: oldSourceIds }, investigationId } });

    // A ledger id (S1…) becomes a Source row id.
    const sourceRow = new Map<string, string>();
    for (const s of verdict.sources) {
      const full = cited.get(s.id);
      if (!full) continue;
      const row = await tx.source.create({
        data: {
          investigationId,
          kind: full.kind,
          url: full.url,
          title: full.title,
          label: full.label,
          domain: full.domain,
          snippet: full.snippet,
          excerpt: full.excerpt?.slice(0, 2000) ?? null,
          via: full.via,
          retrievedAt: new Date(full.retrievedAt),
          knowledgeDocumentId: full.links.knowledgeDocumentId ?? null,
          reportId: full.links.reportId ?? null,
        },
        select: { id: true },
      });
      sourceRow.set(s.id, row.id);
    }

    const saved = await tx.investigationResult.create({
      data: {
        investigationId,
        verdict: verdict.verdict,
        concern: verdict.concern,
        confidence: verdict.confidence,
        summary: verdict.summary,
        guidance: verdict.guidance,
        limitations: verdict.limitations,
        promptVersion: result.promptVersion,
        modelId: result.modelId,
        inputTokens: result.usage.inputTokens || null,
        outputTokens: result.usage.outputTokens || null,
        rawOutput: {
          sourceIds: [...sourceRow.values()],
          ledgerToSource: Object.fromEntries(sourceRow),
          signals: verdict.signals,
          adjustments: result.adjustments,
          degraded: result.degraded,
          steps: result.steps,
          toolCalls: result.toolCalls,
        } as Prisma.InputJsonValue,
        signals: {
          create: verdict.signals.map((s, order) => ({
            order,
            kind: s.kind,
            title: s.title,
            detail: s.detail,
            strength: s.strength,
            // A signal row points at one source; the others are kept in rawOutput.
            sourceId: sourceRow.get(s.sourceIds[0]) ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return { resultId: saved.id, sourceCount: sourceRow.size };
  });
}
