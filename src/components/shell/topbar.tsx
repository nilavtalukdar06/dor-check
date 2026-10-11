"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeadsetIcon, ThumbsUpIcon } from "lucide-react";
import { NotificationBell } from "@/components/shell/notification-bell";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { pageTitleFor } from "@/lib/nav";

export function Topbar() {
  const title = pageTitleFor(usePathname());
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-5">
      <SidebarTrigger className="text-foreground/75" />
      <h2 className="text-base font-medium">{title}</h2>
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <Button variant="outline" className="h-9 gap-2 px-4 shadow-xs">
          <ThumbsUpIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
        <Button variant="outline" className="h-9 gap-2 px-4 shadow-xs" nativeButton={false} render={<Link href="/help" />}>
          <HeadsetIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Need help?</span>
        </Button>
      </div>
    </header>
  );
}
