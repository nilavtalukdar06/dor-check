import { LockIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border bg-soft">
        <LockIcon className="size-5 text-muted-foreground" />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">You don&apos;t have access</h1>
        <p className="text-muted-foreground">
          This area is for moderators. If you think you should have access, ask an admin to update
          your role.
        </p>
      </div>
      <Button render={<Link href="/dashboard" />} nativeButton={false}>
        Back to dashboard
      </Button>
    </main>
  );
}
