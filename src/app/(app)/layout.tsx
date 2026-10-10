import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import {
  SidebarUser,
  SidebarUserFallback,
} from "@/components/shell/sidebar-user";
import { Topbar } from "@/components/shell/topbar";
import { getCurrentUser } from "@/server/users";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// TODO(phase 7): derive from the Clerk role. TODO(phase 28): real usage and counts.
const isModerator = true;
const usage = { used: 12, limit: 50 };
const counts = { reports: 3, moderation: 7 };

// Pages here are auth-gated, so navigations are not expected to be instant.
export const instant = false;

/** Resource-level auth check (Clerk deprecates path-matcher middleware). */
async function AuthGate({ children }: { children: React.ReactNode }) {
  await auth.protect();
  await getCurrentUser(); // creates the User row on first visit if the webhook has not
  return children;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar
        isModerator={isModerator}
        usage={usage}
        counts={counts}
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
            <AuthGate>{children}</AuthGate>
          </Suspense>
        </div>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
