import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { ChatSkeleton } from "@/components/assistant/chat-skeleton";
import { getThread } from "@/server/assistant";
import { getCurrentUser } from "@/server/users";

export const metadata = { title: "Assistant" };

async function Thread({ params }: Pick<PageProps<"/assistant/[id]">, "params">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const thread = await getThread(user.id, id);
  if (!thread) notFound();
  return <AssistantChat key={thread.id} threadId={thread.id} initialMessages={thread.messages} initialLanguage={thread.languageMode} investigationId={thread.investigationId} firstQuestion={null} isNew={false} />;
}

export default function ThreadPage({ params }: PageProps<"/assistant/[id]">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <Thread params={params} />
    </Suspense>
  );
}
