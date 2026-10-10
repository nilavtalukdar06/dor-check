import { eventType } from "inngest";
import { z } from "zod";

/** A price check was created and is ready to run. */
export const priceCheckRequested = eventType("price/check.requested", {
  schema: z.object({
    investigationId: z.string(),
    userId: z.string(),
  }),
});

/** A community report was submitted; runs duplicate detection and notifies moderators. (Phase 22) */
export const reportSubmitted = eventType("report/submitted", {
  schema: z.object({ reportId: z.string(), reference: z.string() }),
});

/** Crawl, chunk and index a knowledge source. (Phase 17) */
export const sourceSyncRequested = eventType("source/sync.requested", {
  schema: z.object({ sourceId: z.string(), requestedById: z.string().optional() }),
});

/** Transcribe and translate a recorded voice note. (Phase 26) */
export const voiceTranscribeRequested = eventType("voice/transcribe.requested", {
  schema: z.object({ voiceJobId: z.string() }),
});

/** Smoke test for the Inngest setup; sent from /dev/inngest in development. */
export const helloRequested = eventType("dev/hello.requested", {
  schema: z.object({ name: z.string().max(60) }),
});

/** Capture a page for an investigation. Phase 19 folds this into the investigation workflow. */
export const captureRequested = eventType("capture/page.requested", {
  schema: z.object({ investigationId: z.string() }),
});
