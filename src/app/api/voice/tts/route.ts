import { isVoiceLanguage } from "@/lib/voice";
import { getCurrentUser } from "@/server/users";
import { speak } from "@/server/voice";

export const maxDuration = 60;

/** Text in, spoken audio out (as a saved job; the audio itself is fetched from /api/voice/[id]/audio). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  if (typeof body.text !== "string") return Response.json({ error: "Write or paste something to read aloud." }, { status: 400 });
  if (!isVoiceLanguage(body.language)) return Response.json({ error: "Choose English, Hindi or Assamese." }, { status: 400 });
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const source = body.source && typeof body.source === "object" ? (body.source as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" && v.length < 40 ? v : undefined);
  const result = await speak(user.id, {
    text: body.text,
    language: body.language,
    speaker: typeof body.speaker === "string" ? body.speaker : undefined,
    pace: num(body.pace),
    stability: num(body.stability),
    similarity: num(body.similarity),
    title: typeof body.title === "string" ? body.title.slice(0, 80) : undefined,
    source: { investigationId: str(source.investigationId), chatMessageId: str(source.chatMessageId), reportId: str(source.reportId) },
  });
  return result.ok ? Response.json(result.job, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: result.error }, { status: result.status });
}
