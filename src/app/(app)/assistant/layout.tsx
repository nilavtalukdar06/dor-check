import { Suspense } from "react";
import { ThreadList } from "@/components/assistant/thread-list";
import { Skeleton } from "@/components/ui/skeleton";
import { listThreads } from "@/server/assistant";
import { getCurrentUser } from "@/server/users";

async function Threads() {
  const user = await getCurrentUser();
  const threads = user ? await listThreads(user.id) : [];
  return <ThreadList threads={threads.map((t) => ({ id: t.id, title: t.title }))} />;
}

/** The conversation list stays put while the chat on the right changes. */
export default function AssistantLayout({ children }: { children: React.ReactNode }) {
  return (
    // Break out of the page padding so the chat fills the area under the top bar.
    <div className="-mx-4 -mt-6 -mb-24 flex h-[calc(100svh-3.5rem)] flex-col md:-mx-8 md:-mt-8 md:-mb-8 md:h-[calc(100svh-3.5rem)] lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r p-4 lg:flex">
        <Suspense fallback={<div className="flex flex-col gap-3"><Skeleton className="h-10 rounded-lg" />{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>}>
          <Threads />
        </Suspense>
      </aside>
      <section className="min-h-0 flex-1">{children}</section>
    </div>
  );
}
