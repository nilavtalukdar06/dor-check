import { channel } from "inngest/realtime";
import { z } from "zod";

export const PRICE_STEP_KEYS = [
  "resolve-places",
  "route",
  "find-tariff",
  "research",
  "estimate",
  "compare",
] as const;
export type PriceStepKey = (typeof PRICE_STEP_KEYS)[number];

/** One live update: a step started, finished, was skipped or failed, or a progress note. */
export const priceProgressSchema = z.object({
  step: z.enum(PRICE_STEP_KEYS),
  status: z.enum(["running", "progress", "done", "skipped", "failed"]),
  message: z.string().optional(),
  durationMs: z.number().optional(),
  at: z.number(),
});
export type PriceProgress = z.infer<typeof priceProgressSchema>;

/** Live progress of one price check. Subscribers get a token for exactly this investigation. */
export const priceRunChannel = channel({
  name: (investigationId: string) => `price-run:${investigationId}`,
  topics: {
    progress: { schema: priceProgressSchema },
    finished: { schema: z.object({ status: z.enum(["COMPLETED", "FAILED"]), at: z.number() }) },
  },
});

/** One thing the capture browser did, e.g. page_navigated: "Opening example.com". */
export const captureEventSchema = z.object({
  type: z.string(),
  message: z.string(),
  at: z.number(),
});
export type CaptureLiveEvent = z.infer<typeof captureEventSchema>;

/** Live progress of one page capture. Subscribers get a token for exactly this investigation. */
export const captureRunChannel = channel({
  name: (investigationId: string) => `capture-run:${investigationId}`,
  topics: {
    event: { schema: captureEventSchema },
    finished: { schema: z.object({ status: z.enum(["COMPLETED", "FAILED"]), at: z.number() }) },
  },
});
