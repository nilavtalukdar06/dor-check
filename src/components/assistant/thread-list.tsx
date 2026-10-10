"use client";

import { MessageSquareIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { archiveThreadAction } from "@/app/(app)/assistant/actions";
import { cn } from "@/lib/utils";

export type ThreadItem = { id: string; title: string };

/** New chat plus the recent conversations. */
export function ThreadList({ threads }: { threads: ThreadItem[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = pathname.startsWith("/assistant/") ? pathname.split("/")[2] : null;

  return (
    <nav aria-label="Conversations" className="flex min-h-0 flex-1 flex-col gap-3">
      <Link href="/assistant" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50" data-testid="new-chat">
        <PlusIcon className="size-4" aria-hidden />
        New chat
      </Link>
      <p className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recent</p>
      {threads.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">Your conversations will appear here.</p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
          {threads.map((t) => (
            <li key={t.id} className="group/thread relative" data-thread={t.id}>
              <Link href={`/assistant/${t.id}`} aria-current={active === t.id ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-2 py-2 pr-9 text-sm outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50", active === t.id && "bg-soft font-medium")}>
                <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{t.title}</span>
              </Link>
              <button
                type="button"
                aria-label={`Delete conversation: ${t.title}`}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await archiveThreadAction(t.id);
                    if (active === t.id) router.push("/assistant");
                    else router.refresh();
                  })
                }
                className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-hover/thread:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Trash2Icon className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
