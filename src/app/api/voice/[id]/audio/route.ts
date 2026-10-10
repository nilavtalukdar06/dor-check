import { getObjectBytes } from "@/server/storage";
import { getCurrentUser } from "@/server/users";
import { voiceAudioKey } from "@/server/voice";

/**
 * The audio of one job, only for its owner. It is served from here rather than a storage link so
 * the page can decode it for the waveform without a cross-origin request, and it answers byte
 * ranges so the player can seek. `?download=1` saves it as a file.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const audio = await voiceAudioKey(user.id, id);
  if (!audio) return Response.json({ error: "Not found." }, { status: 404 });

  const bytes = await getObjectBytes(audio.key);
  const headers: Record<string, string> = { "Content-Type": "audio/wav", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (new URL(request.url).searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="${audio.title.replace(/[^\w.\- ]/g, "-")}.wav"`;

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const total = bytes.byteLength;
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start >= total || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    const part = bytes.slice(start, end + 1);
    return new Response(part as BodyInit, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(part.byteLength) } });
  }
  return new Response(bytes as BodyInit, { headers: { ...headers, "Content-Length": String(bytes.byteLength) } });
}
