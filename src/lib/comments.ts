import { extractIdentifiers } from "@/lib/identifiers";

// Rules for the discussion under a report. Pure, so the same checks run in tests and on the server.

export const COMMENT_MAX = 1000;
export const FINDING_MAX = 2000;
/** Per person: this many comments in this many seconds. */
export const COMMENT_RATE = { limit: 8, windowSeconds: 600 } as const;

/** Held for a moderator before anyone else sees them. Deliberately short: this is a safety net, not a filter. */
const ABUSE = ["fuck", "bitch", "bastard", "asshole", "slut", "whore", "madarchod", "bhenchod", "behenchod", "chutiya", "harami", "randi", "kutta", "saala", "kamina"];
const ABUSE_RE = new RegExp(`(?<![a-z])(?:${ABUSE.join("|")})(?![a-z])`, "i");

export type Screening =
  | { verdict: "ok"; body: string }
  | { verdict: "hold"; body: string; reason: string }
  | { verdict: "reject"; error: string };

/**
 * ok: posted at once. hold: saved but shown only to its author until a moderator approves it.
 * reject: not saved; the person is told why and can edit it.
 */
export function screenComment(input: string): Screening {
  const body = input.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return { verdict: "reject", error: "Write something first." };
  if (body.length > COMMENT_MAX) return { verdict: "reject", error: `Keep it under ${COMMENT_MAX} characters.` };

  const ids = extractIdentifiers(body);
  if (ids.phones.length || ids.upis.length || ids.emails.length) {
    return { verdict: "reject", error: "Please don't post phone numbers, payment ids or email addresses here. If you know one, report it and a moderator will add it." };
  }
  if (ABUSE_RE.test(body)) return { verdict: "hold", body, reason: "Possible abuse" };
  if (ids.urls.length || ids.domains.length) return { verdict: "hold", body, reason: "Contains a link" };
  // Shouting or one character repeated is spam far more often than a real comment.
  if (/(.)\1{9,}/.test(body)) return { verdict: "hold", body, reason: "Looks like spam" };
  return { verdict: "ok", body };
}

export const FLAG_REASONS = ["Abuse or harassment", "Spam", "Personal details", "False or misleading", "Other"] as const;

export type CommentStatusName = "VISIBLE" | "FLAGGED" | "REMOVED";

/** Held = never sent to the chat, only its author and moderators can see it. */
export const isHeld = (c: { status: CommentStatusName; streamMessageId: string | null }) => c.status === "FLAGGED" && !c.streamMessageId;

export const BADGE = { TRAVELLER: "Traveller", MODERATOR: "Official", ADMIN: "Official" } as const;

/** Stream channel id for a report. Matches what createReport stores. */
export const channelIdFor = (reference: string) => `report-${reference}`;
