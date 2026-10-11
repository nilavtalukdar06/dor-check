import { listNotifications } from "@/server/settings";
import { getCurrentUser } from "@/server/users";

/** The signed-in person's latest notifications and how many are unread (for the bell). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  return Response.json(await listNotifications(user.id), { headers: { "Cache-Control": "no-store" } });
}
