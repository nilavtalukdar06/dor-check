import { google } from "@ai-sdk/google";
import { env } from "@/lib/env";

/** Gemini model used for extraction. Override with GEMINI_MODEL. */
export const EXTRACTION_MODEL_ID = env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export const extractionModel = () => google(EXTRACTION_MODEL_ID);

export const aiConfigured = () => Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);
