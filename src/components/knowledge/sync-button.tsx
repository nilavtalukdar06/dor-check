"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { syncSourceAction } from "@/app/(app)/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Starts a sync, then keeps the page fresh until it finishes. The sync is a background workflow,
 * so the button only has to start it; the table's status comes from the database.
 */
export function SyncButton({
  sourceId,
  name,
  syncing,
}: {
  sourceId: string;
  name: string;
  syncing: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(timer);
  }, [syncing, router]);

  const busy = pending || syncing;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 shadow-xs"
        disabled={busy}
        aria-label={`Sync ${name}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await syncSourceAction(sourceId);
            if (!res.ok) return setError(res.error);
            router.refresh();
          })
        }
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RefreshCwIcon data-icon="inline-start" />
        )}
        {busy ? "Syncing…" : "Sync"}
      </Button>
      {error ? (
        <span role="alert" className="max-w-48 text-right text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
