import { google } from "@ai-sdk/google";
import { env } from "@/lib/env";

/** Gemini model used for extraction. Override with GEMINI_MODEL. */
export const EXTRACTION_MODEL_ID = env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export const extractionModel = () => google(EXTRACTION_MODEL_ID);

export const aiConfigured = () => Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY);

/**
 * Gemini model for the investigation agent (tool use, then the verdict). Defaults to the same
 * model as extraction. The full gemini-3.5-flash is more careful but Google's free tier allows only
 * about 20 requests a day for it, which is a handful of investigations: set GEMINI_AGENT_MODEL to it
 * once billing is on.
 */
export const AGENT_MODEL_ID = env.GEMINI_AGENT_MODEL ?? EXTRACTION_MODEL_ID;

export const agentModel = () => google(AGENT_MODEL_ID);
