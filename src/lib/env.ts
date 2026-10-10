import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optional = z.string().min(1).optional();

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),

    // Required once their phases are built; optional until then.
    DIRECT_URL: optional,
    CLERK_WEBHOOK_SIGNING_SECRET: optional,
    INNGEST_EVENT_KEY: optional,
    INNGEST_SIGNING_KEY: optional,
    GOOGLE_GENERATIVE_AI_API_KEY: optional,
    /** Gemini model id for extraction; defaults in server/ai.ts. */
    GEMINI_MODEL: optional,
    FIRECRAWL_API_KEY: optional,
    BROWSERBASE_API_KEY: optional,
    BROWSERBASE_PROJECT_ID: optional,
    PINECONE_API_KEY: optional,
    PINECONE_INDEX: optional,
    STREAM_SECRET: optional,
    SARVAM_API_KEY: optional,
    R2_TOKEN: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_ACCESS_KEY_SECRET: optional,
    R2_BUCKET: optional,
    R2_PUBLIC_URL: optional,
    R2_ACCOUNT_ID: optional,
    INNGEST_DEV: optional,
    ORS_API_KEY: optional,
    UPSTASH_REDIS_REST_URL: optional,
    UPSTASH_REDIS_REST_TOKEN: optional,
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_STREAM_KEY: optional,
    NEXT_PUBLIC_MAPBOX_TOKEN: optional,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // Unit tests import server modules without real secrets.
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
