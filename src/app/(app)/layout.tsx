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
import { getCurrentUser } from "@/server/users";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// TODO(phase 28): real usage and counts.
const usage = { used: 12, limit: 50 };
const counts = { reports: 3, moderation: 7 };

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar
        usage={usage}
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
