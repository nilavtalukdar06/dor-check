import { z } from "zod";
import { LANGUAGES } from "@/lib/assistant";
import { PACE, SIMILARITY, STABILITY, VOICES, type VoiceLanguage, VOICE_LANGUAGES } from "@/lib/voice";

// What a person can change in Settings, validated the same way on the client and the server.

export const PREFERRED_LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "en-IN", label: "English" },
  { value: "hi-IN", label: "हिन्दी (Hindi)" },
  { value: "as-IN", label: "অসমীয়া (Assamese)" },
] as const;
export type PreferredLanguage = (typeof PREFERRED_LANGUAGES)[number]["value"];

/** The assistant's language chip for a preferred language. */
export const assistantMode = (pref: string | null | undefined) => ({ "en-IN": "en", "hi-IN": "hi", "as-IN": "as" } as const)[pref as "en-IN"] ?? ("auto" as (typeof LANGUAGES)[number]["value"]);

/** The language read-aloud starts in for a preferred language (auto starts in English). */
export const voiceLanguageOf = (pref: string | null | undefined): VoiceLanguage => (({ "hi-IN": "hi", "as-IN": "as" } as const)[pref as "hi-IN"] ?? "en");

export const allVoiceIds = VOICE_LANGUAGES.flatMap((l) => VOICES[l.value].map((v) => v.id));

export const preferenceSchema = z
  .object({
    language: z.enum(["auto", "en-IN", "hi-IN", "as-IN"]),
    defaultVoice: z.string().refine((v) => allVoiceIds.includes(v), "Choose one of the listed voices"),
    speechPace: z.number().min(PACE.min).max(PACE.max),
    speechStability: z.number().min(STABILITY.min).max(STABILITY.max),
    speechSimilarity: z.number().min(SIMILARITY.min).max(SIMILARITY.max),
    autoReadVerdicts: z.boolean(),
    notifyRunAlerts: z.boolean(),
    notifyReportUpdates: z.boolean(),
    notifyModeration: z.boolean(),
    reportsAnonymous: z.boolean(),
    homeDistrictId: z.string().min(1).nullable(),
  })
  .partial();
export type PreferencePatch = z.infer<typeof preferenceSchema>;

export const displayNameSchema = z.string().trim().min(1, "Enter a name").max(40, "Keep it under 40 characters");

/** Which notification types each switch controls. Types not listed are always delivered. */
export const NOTIFICATION_GROUP: Record<string, "notifyRunAlerts" | "notifyReportUpdates" | "notifyModeration"> = {
  run_completed: "notifyRunAlerts",
  run_failed: "notifyRunAlerts",
  report_status: "notifyReportUpdates",
  report_comment: "notifyReportUpdates",
  report_finding: "notifyReportUpdates",
  finding_published: "notifyReportUpdates",
  moderation_assigned: "notifyModeration",
};
export const REPORT_NOTIFICATION_TYPES = ["report_status", "report_comment", "report_finding", "finding_published"] as const;

export const MB = 1024 * 1024;
