"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  isActivePath,
  mainNav,
  moderatorNav,
  othersNav,
  type NavGroup,
} from "@/lib/nav";
import { Logo } from "./logo";
import { UsageCard } from "./usage-card";
import { WorkspaceSwitcher } from "./workspace-switcher";

function NavSection({
  group,
  counts,
}: {
  group: NavGroup;
  counts: Record<string, number>;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup className="gap-1 px-3 py-1">
      {group.label ? (
        <SidebarGroupLabel className="h-8 px-3 text-xs font-normal tracking-wide text-muted-foreground uppercase">
          {group.label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarMenu className="gap-0.5">
        {group.items.map((item) => {
          const count = item.badge ? counts[item.badge] : undefined;
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={isActivePath(pathname, item.href)}
                className="h-10 gap-3 rounded-lg px-3 text-sm font-normal text-foreground data-active:font-normal data-active:shadow-[inset_0_0_0_1px_var(--border)] [&_svg]:size-[18px] [&_svg]:text-foreground/75"
                render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
              {count ? (
                <SidebarMenuBadge className="top-2.5! right-3 h-5 rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">
                  {count}
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** Moderator links; rendered by a server component that has checked the role. */
export function ModeratorNav({ counts = {} }: { counts?: Record<string, number> }) {
  return <NavSection group={moderatorNav} counts={counts} />;
}

export function AppSidebar({
  user,
  counts = {},
  usage,
  moderatorSlot,
}: {
  /** Server-rendered, Suspense-wrapped user menu. */
  user: React.ReactNode;
  counts?: Record<string, number>;
  usage: { used: number; limit: number };
  /** Async slot that renders <ModeratorNav /> only for moderators. */
  moderatorSlot?: React.ReactNode;
}) {
  return (
    <Sidebar>
      <SidebarHeader className="gap-[17px] p-3 pt-[18px]">
        <div className="px-1.5">
          <Logo />
        </div>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent className="gap-2 py-0">
        <NavSection group={mainNav} counts={counts} />
        <NavSection group={othersNav} counts={counts} />
        {moderatorSlot}
      </SidebarContent>
      <SidebarFooter className="gap-3 p-3">
        <UsageCard used={usage.used} limit={usage.limit} />
        {user}
      </SidebarFooter>
    </Sidebar>
  );
}
