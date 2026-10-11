import { connection } from "next/server";
import { Suspense } from "react";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { ChatSkeleton } from "@/components/assistant/chat-skeleton";
import { isLanguageMode, MESSAGE_MAX } from "@/lib/assistant";
import prisma from "@/lib/prisma";
import { assistantMode } from "@/lib/settings";
import { getPreferences } from "@/server/settings";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Assistant" };

async function NewChat({ searchParams }: Pick<PageProps<"/assistant">, "searchParams">) {
  // A fresh id per visit, made at request time.
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, MESSAGE_MAX) : "";
  const wanted = typeof sp.investigation === "string" ? sp.investigation : null;
  const user = await getCurrentUser();
  // Only a result the person owns can be the subject of the chat.
  const investigationId = user && wanted ? ((await prisma.investigation.findFirst({ where: { id: wanted, userId: user.id, deletedAt: null }, select: { id: true } }))?.id ?? null) : null;
  // The language chip starts at the person's preferred language (Settings), unless the link says otherwise.
  const preferred = user ? assistantMode((await getPreferences(user.id)).language) : "auto";
  const language = typeof sp.lang === "string" && isLanguageMode(sp.lang) ? sp.lang : preferred;
  const id = crypto.randomUUID().replace(/-/g, "");
  return <AssistantChat key={id} threadId={id} initialMessages={[]} initialLanguage={language} investigationId={investigationId} firstQuestion={q || null} isNew />;
}

export default function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <NewChat searchParams={searchParams} />
    </Suspense>
  );
}
