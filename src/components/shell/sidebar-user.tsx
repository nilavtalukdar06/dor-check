import { currentUser } from "@clerk/nextjs/server";
import { UserMenu } from "./user-menu";

/** Async server part of the sidebar; render it inside <Suspense>. */
export async function SidebarUser() {
  const user = await currentUser();
  return (
    <UserMenu
      name={user?.firstName ?? user?.username ?? "Traveller"}
      imageUrl={user?.hasImage ? user.imageUrl : undefined}
    />
  );
}

export function SidebarUserFallback() {
  return <div className="h-10 w-full rounded-lg border bg-background shadow-xs" />;
}
