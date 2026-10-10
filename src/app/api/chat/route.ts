import { chatTurn, type ChatRequest } from "@/server/assistant";
import { getRole } from "@/server/roles";
import { getCurrentUser } from "@/server/users";

export const maxDuration = 60;

/** One message of the assistant chat. The answer streams back as AI SDK UI message chunks. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  return chatTurn({ id: user.id, role: (await getRole()) ?? "TRAVELLER" }, body, { abortSignal: request.signal });
}
