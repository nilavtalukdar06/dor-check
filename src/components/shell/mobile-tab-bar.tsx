"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FlagIcon,
  HouseIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  SearchIcon,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { isActivePath } from "@/lib/nav";
import { cn } from "@/lib/utils";

const tabs = [
  { title: "Home", href: "/dashboard", icon: HouseIcon },
  { title: "Check", href: "/investigate", icon: SearchIcon },
  { title: "Assistant", href: "/assistant", icon: MessageSquareIcon },
  { title: "Reports", href: "/reports", icon: FlagIcon },
];

const tabClass =
  "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground [&_svg]:size-5";

export function MobileTabBar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(tabClass, isActivePath(pathname, tab.href) && "text-foreground")}
        >
          <tab.icon />
          {tab.title}
        </Link>
      ))}
      <button type="button" className={tabClass} onClick={() => setOpenMobile(true)}>
        <MoreHorizontalIcon />
        More
      </button>
    </nav>
  );
}
