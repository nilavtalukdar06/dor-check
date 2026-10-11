import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { SidebarModeratorNav } from "@/components/shell/sidebar-moderator-nav";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import {
  SidebarUser,
  SidebarUserFallback,
} from "@/components/shell/sidebar-user";
import { Topbar } from "@/components/shell/topbar";
import { getRole } from "@/server/roles";
import { unreadReportUpdates } from "@/server/settings";
import { getUsage } from "@/server/usage";
import { getCurrentUser } from "@/server/users";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const noCounts: Record<string, number> = {};

// Pages here are auth-gated, so navigations are not expected to be instant.
export const instant = false;

/**
 * Runs beside the page, never around it, so each route's loading.tsx streams at once.
 * proxy.ts already redirects signed-out visitors; this repeats the check and creates the
 * User row on first visit if the Clerk webhook has not arrived yet.
 */
async function SessionSync() {
  await auth.protect();
  await getCurrentUser();
  return null;
}

/** The sidebar with this person's real numbers: this month's investigations and unread report updates. */
async function LiveSidebar() {
  const user = await getCurrentUser();
  const role = (await getRole()) ?? "TRAVELLER";
  const [usage, community] = user ? await Promise.all([getUsage(user.id, role), unreadReportUpdates(user.id)]) : [null, 0];
  const counts = { reports: community };
  return (
    <AppSidebar
      usage={usage ? { used: usage.used, limit: usage.limit } : null}
      counts={counts}
      moderatorSlot={
        <Suspense fallback={null}>
          <SidebarModeratorNav counts={counts} />
        </Suspense>
      }
      user={
        <Suspense fallback={<SidebarUserFallback />}>
          <SidebarUser />
        </Suspense>
      }
    />
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebar usage={null} counts={noCounts} user={<SidebarUserFallback />} />}>
        <LiveSidebar />
      </Suspense>
      <SidebarInset className="min-w-0">
        <Topbar />
        <div className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          <Suspense fallback={null}>
            <SessionSync />
          </Suspense>
          {children}
        </div>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
