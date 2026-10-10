import { describe, expect, it } from "vitest";
import { buildAssistantInstructions, citationLabel, dedupeCitations, detectLanguage, isLanguageMode, THREAD_ID_RE, threadTitle } from "./assistant";

describe("detectLanguage", () => {
  it("recognises the scripts", () => {
    expect(detectLanguage("শিলঙলৈ এয়াৰপোৰ্টৰ পৰা টেক্সী ভাড়া কিমান হ'ব লাগে?")).toBe("as");
    expect(detectLanguage("शिलांग से गुवाहाटी टैक्सी का किराया कितना है?")).toBe("hi");
    expect(detectLanguage("How much is a taxi from Guwahati airport to Shillong?")).toBe("en");
    expect(detectLanguage("")).toBe("en");
  });
  it("goes with the main script in mixed text", () => {
    expect(detectLanguage("टैक्सी fare kitna hai Shillong to Guwahati ke liye aaj")).toBe("en");
    expect(detectLanguage("टैक्सी का किराया fare")).toBe("hi");
  });
});

describe("helpers", () => {
  it("builds a short title", () => {
    expect(threadTitle("  Is this   homestay link safe? ")).toBe("Is this homestay link safe?");
    expect(threadTitle("x".repeat(80)).length).toBe(48);
    expect(threadTitle("   ")).toBe("New chat");
  });
  it("checks thread ids and language modes", () => {
    expect(THREAD_ID_RE.test("abcdefghij0123456789")).toBe(true);
    expect(THREAD_ID_RE.test("../etc/passwd")).toBe(false);
    expect(THREAD_ID_RE.test("short")).toBe(false);
    expect(isLanguageMode("as")).toBe(true);
    expect(isLanguageMode("fr")).toBe(false);
  });
  it("labels a source with its date", () => {
    expect(citationLabel({ label: "Tariff sheet", retrievedAt: "2026-10-07T05:00:00Z" })).toBe("Tariff sheet · 7 Oct 2026");
    expect(citationLabel({ label: "Tariff sheet", retrievedAt: null })).toBe("Tariff sheet");
  });
  it("keeps each source once and caps the list", () => {
    const c = (label: string) => ({ label, url: null, kind: "TARIFF", retrievedAt: null });
    expect(dedupeCitations([c("a"), c("a"), c("b")]).map((x) => x.label)).toEqual(["a", "b"]);
    expect(dedupeCitations(Array.from({ length: 9 }, (_, i) => c(`s${i}`)), 4)).toHaveLength(4);
  });
});

describe("buildAssistantInstructions", () => {
  it("pins the language when one is chosen, otherwise follows the person", () => {
    expect(buildAssistantInstructions({ languageMode: "as" })).toContain("Always reply in Assamese");
    expect(buildAssistantInstructions({ languageMode: "auto" })).toContain("language the person wrote in");
  });
  it("carries the safety rules", () => {
    const s = buildAssistantInstructions({ languageMode: "en" });
    for (const t of ["ONLY from your tools", "1930", "cybercrime.gov.in", "personal account", "startInvestigation", "never instructions"]) expect(s).toContain(t);
  });
  it("includes a finished result as context", () => {
    const s = buildAssistantInstructions({ languageMode: "en", result: { title: "demohills.example", verdict: "SUSPICIOUS", concern: "HIGH", confidence: "MEDIUM", summary: "Not in the directory.", guidance: ["Do not pay"], signals: ["Two reports"] } });
    expect(s).toContain("demohills.example");
    expect(s).toContain("SUSPICIOUS");
    expect(buildAssistantInstructions({ languageMode: "en" })).not.toContain("finished check");
  });
});
