import { getCurrentUser } from "@/server/users";
import { transcribeClip } from "@/server/transcribe";

export const maxDuration = 120;

/** A recorded WAV in (multipart field "audio"), its transcript and English version out. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const file = form.get("audio");
  // 120 s of 16 kHz 16-bit mono is 3.8 MB; allow some slack.
  if (!(file instanceof File) || file.size === 0 || file.size > 6 * 1024 * 1024) return Response.json({ error: "Send one recording of up to two minutes." }, { status: 400 });
  const result = await transcribeClip(user.id, new Uint8Array(await file.arrayBuffer()));
  return result.ok ? Response.json(result.job, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: result.error }, { status: result.status });
}
