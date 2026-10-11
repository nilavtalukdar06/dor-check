// Rules for the moderator screens. Pure, so they can be tested and shared.

export type Priority = "HIGH" | "MEDIUM" | "LOW";
export const PRIORITY_LABEL: Record<Priority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
export const PRIORITY_VARIANT: Record<Priority, "danger" | "warning" | "outline"> = { HIGH: "danger", MEDIUM: "warning", LOW: "outline" };
const RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * How urgently a report needs a moderator. High: money already lost, a scam that matches other
 * reports by an exact identifier, or several similar reports. Medium: any match, money involved,
 * or a scam with a payment id. Low: everything else. A signal for ordering, not a judgement.
 */
export function reportPriority(r: { kind: string; amountInr: number | null; exactMatches: number; similarMatches: number; hasPaymentId: boolean }): Priority {
  const amount = r.amountInr ?? 0;
  if (amount >= 5000 || (r.kind === "SCAM" && r.exactMatches > 0) || r.exactMatches + r.similarMatches >= 3) return "HIGH";
  if (r.exactMatches + r.similarMatches > 0 || amount > 0 || (r.kind === "SCAM" && r.hasPaymentId)) return "MEDIUM";
  return "LOW";
}

export const comparePriority = (a: Priority, b: Priority) => RANK[a] - RANK[b];

/** "Auto: 2 matches" for the queue. */
export const autoCheckLabel = (matches: number, checked: boolean) => (checked ? `Auto: ${matches} ${matches === 1 ? "match" : "matches"}` : "Auto: pending");

/** Hours as "5h", "40m" or "2d". */
export function shortDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "–";
  const min = ms / 60000;
  if (min < 60) return `${Math.max(1, Math.round(min))}m`;
  const h = min / 60;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** Seconds as "9s", "1m 12s". */
export function runDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "–";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const WORKFLOW_TYPE_LABEL: Record<string, string> = {
  investigation: "Investigation",
  price_check: "Price check",
  capture: "Page capture",
  crawl: "Crawl",
  knowledge_sync: "Knowledge sync",
  sync: "Knowledge sync",
  transcribe: "Transcribe",
  report_check: "Report check",
  tts: "Read aloud",
};
export const workflowTypeLabel = (t: string) => WORKFLOW_TYPE_LABEL[t] ?? t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export type RunStatusName = "QUEUED" | "RUNNING" | "RETRYING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SKIPPED";
export const RUN_STATUS: Record<RunStatusName, { label: string; variant: "info" | "ok" | "warning" | "danger" | "outline" }> = {
  QUEUED: { label: "Queued", variant: "outline" },
  RUNNING: { label: "In progress", variant: "info" },
  RETRYING: { label: "Retrying", variant: "warning" },
  COMPLETED: { label: "Completed", variant: "ok" },
  FAILED: { label: "Failed", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
  SKIPPED: { label: "Skipped", variant: "outline" },
};

/** What the Progress column says for a run. */
export function runProgress(r: { status: string; stepsDone: number; stepsTotal: number; attempt: number; maxAttempts: number }): string {
  if (r.status === "RETRYING" || (r.status === "RUNNING" && r.attempt > 1)) return `Attempt ${r.attempt} of ${r.maxAttempts}`;
  if (r.status === "RUNNING" || r.status === "QUEUED") return r.stepsTotal ? `Step ${Math.min(r.stepsDone + 1, r.stepsTotal)} of ${r.stepsTotal}` : "Starting";
  if (r.status === "COMPLETED") return r.stepsTotal ? `${r.stepsTotal} ${r.stepsTotal === 1 ? "step" : "steps"}` : "Done";
  return r.stepsTotal ? `${r.stepsDone} of ${r.stepsTotal} steps` : "–";
}

/** Share of finished runs that succeeded, as a whole percent, or null when nothing has finished. */
export function successRate(completed: number, failed: number): number | null {
  const total = completed + failed;
  return total ? Math.round((completed / total) * 100) : null;
}
