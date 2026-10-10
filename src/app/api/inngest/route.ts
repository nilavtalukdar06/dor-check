import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// Inngest calls this endpoint to register and run the workflows. It is public in proxy.ts;
// requests are verified with INNGEST_SIGNING_KEY in production.
export const { GET, POST, PUT } = serve({ client: inngest, functions });

// A single step (a page read, a search) fits well inside this.
export const maxDuration = 60;
