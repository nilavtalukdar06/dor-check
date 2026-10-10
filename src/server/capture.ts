import { createHash } from "node:crypto";
import type { Stagehand, StagehandBrowser } from "@browserbasehq/stagehand";
import { z } from "zod";
import { looksLikePaymentStep, READ_ONLY_INSTRUCTION, type PageFacts } from "@/lib/capture-policy";
import { env } from "@/lib/env";
import { hostOf, isSafePublicUrl } from "@/lib/research-policy";
import prisma from "@/lib/prisma";
import { putObject, storageConfigured } from "./storage";

// Evidence capture: a remote Browserbase browser, driven through Stagehand, opens the page,
// takes a timestamped screenshot and reads what is written on it. The browser is read-only by
// policy: only page.goto, screenshots and `extract` are used. There is no `act`, no typing,
// no clicking, so nothing can be paid, submitted or sent.

const VIEWPORT = { width: 1280, height: 800 };
const NAVIGATION_TIMEOUT_MS = 20_000;
const MODEL = "google/gemini-3.5-flash";

export const captureConfigured = () =>
  Boolean(env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID && env.GOOGLE_GENERATIVE_AI_API_KEY) && storageConfigured();

const factsSchema = z.object({
  title: z.string().nullable().describe("The page's main heading or title"),
  businessName: z.string().nullable().describe("The business or seller named on the page"),
  quotedPrices: z.array(z.string()).describe("Prices written on the page, exactly as shown"),
  paymentInstructions: z.string().nullable().describe("How the page asks the visitor to pay, in one sentence"),
  paymentIds: z.array(z.string()).describe("UPI ids, bank account or wallet handles shown for payment"),
  phoneNumbers: z.array(z.string()).describe("Phone numbers shown on the page"),
  asksForAdvancePayment: z.boolean().describe("True if the page asks for money before the service"),
  notes: z.string().nullable().describe("Anything else notable that is written on the page"),
});

export type CaptureEmit = (type: string, message: string) => Promise<void> | void;

export type CaptureOwner = {
  userId: string;
  workspaceId: string | null;
  investigationId: string;
  /** Subject shown on the evidence card (business name or title). */
  subject: string;
  /** Called as soon as the remote browser exists, so the live view can attach to it. */
  onSession?: (sessionId: string) => Promise<void> | void;
  emit?: CaptureEmit;
};

export type CaptureResult =
  | {
      ok: true;
      sessionId: string;
      finalUrl: string;
      pageTitle: string | null;
      facts: PageFacts | null;
      evidence: { id: string; kind: "SCREENSHOT" | "EXTRACT"; title: string }[];
    }
  | { ok: false; sessionId: string | null; reason: "unsafe_url" | "not_configured" | "navigation_failed" | "redirected_unsafe"; message: string };

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const stamp = () => new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);

/**
 * Capture one page as evidence. Failures never throw: the caller continues with lower
 * confidence and records the step as failed.
 */
export async function capturePage(url: string, owner: CaptureOwner): Promise<CaptureResult> {
  const emit: CaptureEmit = owner.emit ?? (() => undefined);
  if (!isSafePublicUrl(url)) {
    return { ok: false, sessionId: null, reason: "unsafe_url", message: "That address cannot be opened (only public http and https pages)." };
  }
  if (!captureConfigured()) {
    return { ok: false, sessionId: null, reason: "not_configured", message: "Browser capture is not configured." };
  }

  // Stagehand is ESM-only and loads files at runtime, so it is imported on demand.
  const { browserbase, Stagehand: StagehandClass } = await import("@browserbasehq/stagehand");
  let browser: StagehandBrowser | null = null;
  let stagehand: Stagehand | null = null;
  try {
    await emit("browser_starting", "Starting a secure browser");
    browser = await browserbase.launch({
      apiKey: env.BROWSERBASE_API_KEY!,
      projectId: env.BROWSERBASE_PROJECT_ID!,
      browserSettings: { viewport: VIEWPORT },
    });
    const sessionId = browser.sessionId ?? null;
    if (sessionId) {
      await owner.onSession?.(sessionId);
      await emit("browser_session_started", "Secure browser ready");
    }

    stagehand = await StagehandClass.create({
      browser,
      model: { modelName: MODEL, apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY! },
    });
    const [page] = await browser.context.pages();

    await emit("page_navigating", `Opening ${hostOf(url)}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    } catch (err) {
      return { ok: false, sessionId, reason: "navigation_failed", message: `The page did not load: ${String(err).slice(0, 120)}` };
    }
    const finalUrl = await page.url();
    // A page that cannot load leaves the browser on its own error page.
    if (/^(chrome-error|about|chrome):/i.test(finalUrl)) {
      return { ok: false, sessionId, reason: "navigation_failed", message: "The page did not load (it may not exist, or it refused the connection)." };
    }
    // A redirect must not carry us somewhere internal.
    if (!isSafePublicUrl(finalUrl)) {
      return { ok: false, sessionId, reason: "redirected_unsafe", message: "The page redirected to an address that cannot be opened." };
    }
    await page.waitForLoadState("load", 8_000).catch(() => undefined);
    await emit("page_navigated", `Loaded ${hostOf(finalUrl)}`);
    const pageTitle = (await page.title().catch(() => "")) || null;

    // Screenshot at 1280x800, uploaded and recorded.
    const png = await page.screenshot({ type: "png", fullPage: false });
    const capturedAt = new Date();
    const paymentStep = looksLikePaymentStep(finalUrl);
    const title = paymentStep ? "Payment step" : "Listing page";
    const key = `evidence/${owner.userId}/${owner.investigationId}/${stamp()}-${paymentStep ? "payment" : "listing"}.png`;
    const stored = await putObject(key, png, "image/png");
    const evidence: Extract<CaptureResult, { ok: true }>["evidence"] = [];
    const shot = await prisma.evidence.create({
      data: {
        ownerId: owner.userId,
        workspaceId: owner.workspaceId,
        investigationId: owner.investigationId,
        kind: "SCREENSHOT",
        title,
        subject: owner.subject,
        url: finalUrl,
        storageKey: stored.key,
        storageUrl: stored.ref,
        mimeType: "image/png",
        sizeBytes: png.byteLength,
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        capturedAt,
        capturedBy: "browserbase",
        browserSessionId: sessionId,
        sha256: sha256(png),
      },
      select: { id: true },
    });
    evidence.push({ id: shot.id, kind: "SCREENSHOT", title });
    await emit("page_captured", `Saved a screenshot of ${hostOf(finalUrl)}`);

    // Read what is written on the page (read-only).
    let facts: PageFacts | null = null;
    try {
      await emit("page_reading", "Reading what the page says");
      // Stagehand bundles its own copy of zod, so its types do not match ours.
      const res = await stagehand.extract(READ_ONLY_INSTRUCTION, factsSchema as unknown as Parameters<Stagehand["extract"]>[1] & object);
      facts = (res as { data?: PageFacts }).data ?? (res as unknown as PageFacts);
      const text = JSON.stringify(facts, null, 2);
      const factsKey = `evidence/${owner.userId}/${owner.investigationId}/${stamp()}-page-facts.json`;
      const storedFacts = await putObject(factsKey, new TextEncoder().encode(text), "application/json");
      const row = await prisma.evidence.create({
        data: {
          ownerId: owner.userId,
          workspaceId: owner.workspaceId,
          investigationId: owner.investigationId,
          kind: "EXTRACT",
          title: "Page facts",
          subject: owner.subject,
          url: finalUrl,
          storageKey: storedFacts.key,
          storageUrl: storedFacts.ref,
          mimeType: "application/json",
          sizeBytes: text.length,
          textContent: text,
          capturedAt: new Date(),
          capturedBy: "browserbase",
          browserSessionId: sessionId,
          sha256: sha256(text),
        },
        select: { id: true },
      });
      evidence.push({ id: row.id, kind: "EXTRACT", title: "Page facts" });
      await emit("page_read", facts?.asksForAdvancePayment ? "The page asks for payment in advance" : "Read the page");
    } catch (err) {
      // Reading failed (model quota, a timeout); the screenshot is still good evidence. The
      // technical reason stays in the server log, not in the traveller's timeline.
      console.warn("capture: reading the page failed", String(err).slice(0, 300));
      await emit("page_read_failed", "Could not read the page text, but the screenshot is saved");
    }

    return { ok: true, sessionId: sessionId ?? "", finalUrl, pageTitle, facts, evidence };
  } catch (err) {
    return {
      ok: false,
      sessionId: browser?.sessionId ?? null,
      reason: "navigation_failed",
      message: `Capture failed: ${String(err).slice(0, 160)}`,
    };
  } finally {
    // Always release the remote session, or it keeps billing until it times out.
    await stagehand?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
