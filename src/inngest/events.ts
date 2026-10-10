import { eventType } from "inngest";
import { z } from "zod";

/** A price check was created and is ready to run. */
export const priceCheckRequested = eventType("price/check.requested", {
  schema: z.object({
    investigationId: z.string(),
    userId: z.string(),
  }),
});
