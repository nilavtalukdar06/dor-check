import { describe, expect, it } from "vitest";
import { autoCheckLabel, comparePriority, median, reportPriority, runDuration, runProgress, shortDuration, successRate, workflowTypeLabel } from "./moderation";

const base = { kind: "OTHER", amountInr: null, exactMatches: 0, similarMatches: 0, hasPaymentId: false };

describe("reportPriority", () => {
  it("is high when money is lost, a scam matches by identifier, or many reports match", () => {
    expect(reportPriority({ ...base, amountInr: 5000 })).toBe("HIGH");
    expect(reportPriority({ ...base, kind: "SCAM", exactMatches: 1 })).toBe("HIGH");
    expect(reportPriority({ ...base, similarMatches: 3 })).toBe("HIGH");
  });
  it("is medium for any match, any money, or a scam with a payment id", () => {
    expect(reportPriority({ ...base, similarMatches: 1 })).toBe("MEDIUM");
    expect(reportPriority({ ...base, amountInr: 800 })).toBe("MEDIUM");
    expect(reportPriority({ ...base, kind: "SCAM", hasPaymentId: true })).toBe("MEDIUM");
  });
  it("is low otherwise", () => {
    expect(reportPriority(base)).toBe("LOW");
    expect(reportPriority({ ...base, kind: "SCAM" })).toBe("LOW");
  });
  it("sorts high first", () => {
    expect((["LOW", "HIGH", "MEDIUM"] as const).slice().sort(comparePriority)).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });
});

describe("labels and numbers", () => {
  it("labels the auto-check", () => {
    expect(autoCheckLabel(2, true)).toBe("Auto: 2 matches");
    expect(autoCheckLabel(1, true)).toBe("Auto: 1 match");
    expect(autoCheckLabel(0, false)).toBe("Auto: pending");
  });
  it("formats durations", () => {
    expect(shortDuration(5 * 3600_000)).toBe("5h");
    expect(shortDuration(40 * 60_000)).toBe("40m");
    expect(shortDuration(3 * 86400_000)).toBe("3d");
    expect(shortDuration(null)).toBe("–");
    expect(runDuration(9000)).toBe("9s");
    expect(runDuration(72000)).toBe("1m 12s");
  });
  it("takes a median", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("describes run progress", () => {
    expect(runProgress({ status: "RUNNING", stepsDone: 3, stepsTotal: 6, attempt: 1, maxAttempts: 3 })).toBe("Step 4 of 6");
    expect(runProgress({ status: "RETRYING", stepsDone: 1, stepsTotal: 2, attempt: 2, maxAttempts: 3 })).toBe("Attempt 2 of 3");
    expect(runProgress({ status: "COMPLETED", stepsDone: 6, stepsTotal: 6, attempt: 1, maxAttempts: 3 })).toBe("6 steps");
    expect(runProgress({ status: "FAILED", stepsDone: 2, stepsTotal: 6, attempt: 3, maxAttempts: 3 })).toBe("2 of 6 steps");
  });
  it("computes a success rate", () => {
    expect(successRate(97, 3)).toBe(97);
    expect(successRate(0, 0)).toBeNull();
  });
  it("names run types", () => {
    expect(workflowTypeLabel("price_check")).toBe("Price check");
    expect(workflowTypeLabel("something_new")).toBe("Something new");
  });
});
