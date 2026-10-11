"use client";

import { BellIcon, CheckCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/(app)/settings/actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/server/settings";

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/** The bell: unread count, the latest notifications, mark as read. Checks again every 30 seconds and when opened. */
export function NotificationBell() {
  const router = useRouter();
  const [data, setData] = useState<{ unread: number; items: NotificationItem[] } | null>(null);
  const lastTop = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const next = (await res.json()) as { unread: number; items: NotificationItem[] };
        setData(next);
        // Something new arrived (a check finished, a report moved): refresh the sidebar's usage and badges too.
        const top = next.items[0]?.id ?? null;
        if (lastTop.current !== null && top !== lastTop.current) router.refresh();
        lastTop.current = top ?? "";
      }
    } catch {
      // offline: keep what is shown
    }
  }, [router]);
  useEffect(() => {
    // A timer, so the first load is not a state update straight inside the effect.
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const unread = data?.unread ?? 0;
  const read = (id: string) => {
    setData((d) => (d ? { unread: Math.max(0, d.unread - (d.items.find((n) => n.id === id && !n.read) ? 1 : 0)), items: d.items.map((n) => (n.id === id ? { ...n, read: true } : n)) } : d));
    void markNotificationReadAction(id);
  };
  const readAll = () => {
    setData((d) => (d ? { unread: 0, items: d.items.map((n) => ({ ...n, read: true })) } : d));
    void markAllNotificationsReadAction();
  };

  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger className="relative inline-flex size-9 items-center justify-center rounded-lg border bg-background shadow-xs outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} data-testid="bell">
        <BellIcon className="size-4" aria-hidden />
        {unread ? <span className="absolute -top-1.5 -right-1.5 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-semibold text-white" data-testid="bell-count">{unread > 9 ? "9+" : unread}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] gap-0 p-0" data-testid="bell-panel">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <button type="button" onClick={readAll} disabled={!unread} className="inline-flex items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline disabled:opacity-40"><CheckCheckIcon className="size-3.5" aria-hidden />Mark all read</button>
        </div>
        {!data?.items.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="bell-empty">{data ? "You're all caught up." : "Loading…"}</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {data.items.map((n) => {
              const inner = (
                <>
                  <span className="flex items-start gap-2">
                    {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-info" aria-label="Unread" /> : <span className="mt-1.5 size-2 shrink-0" aria-hidden />}
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className={cn("text-sm", !n.read && "font-medium")}>{n.title}</span>
                      {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                      <span className="text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                    </span>
                  </span>
                </>
              );
              return (
                <li key={n.id} className="border-b last:border-b-0" data-notification={n.id} data-read={n.read}>
                  {n.href ? <Link href={n.href} onClick={() => read(n.id)} className="block px-4 py-3 outline-none hover:bg-soft focus-visible:bg-soft">{inner}</Link> : <button type="button" onClick={() => read(n.id)} className="block w-full px-4 py-3 text-left outline-none hover:bg-soft focus-visible:bg-soft">{inner}</button>}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
