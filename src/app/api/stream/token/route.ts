import { findViewableReport, publicName } from "@/server/comments";
import { getRole } from "@/server/roles";
import { joinChannel, streamConfigured, streamToken, upsertStreamUser } from "@/server/stream";
import { getCurrentUser } from "@/server/users";

/**
 * A Stream token for one report's discussion. Only people who may see that report get one,
 * and getting it also makes them a member (staff as moderators) so they can read and watch.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!streamConfigured()) return Response.json({ error: "The discussion is not configured." }, { status: 503 });

  const reference = new URL(request.url).searchParams.get("ref")?.toUpperCase() ?? "";
  const role = (await getRole()) ?? "TRAVELLER";
  const report = await findViewableReport({ id: user.id, role }, reference);
  if (!report) return Response.json({ error: "Not found." }, { status: 404 });

  const staff = role !== "TRAVELLER";
  try {
    await upsertStreamUser(user.id, publicName(user, { staff, anonymousReporter: report.reporterId === user.id && report.isAnonymous }));
    await joinChannel(report.channelId, report.reference, user.id, staff);
  } catch (e) {
    console.error("stream token: join failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "Couldn't open the discussion." }, { status: 502 });
  }
  return Response.json({ apiKey: process.env.NEXT_PUBLIC_STREAM_KEY, userId: user.id, token: streamToken(user.id), channelId: report.channelId }, { headers: { "Cache-Control": "no-store" } });
}
