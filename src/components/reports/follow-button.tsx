"use client";

import { CheckIcon, StarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFollowAction } from "@/app/(app)/reports/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Follow a report to be told when its status changes. */
export function FollowButton({ reference, following }: { reference: string; following: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        className="h-10 gap-2 px-4 shadow-xs"
        aria-pressed={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await toggleFollowAction(reference);
            if (!res.ok) return setError(res.error);
            setOn(res.following);
            // The follower count on the page is rendered on the server.
            router.refresh();
          })
        }
      >
        {pending ? <Spinner data-icon="inline-start" /> : on ? <CheckIcon data-icon="inline-start" /> : <StarIcon data-icon="inline-start" />}
        {on ? "Following" : "Follow"}
      </Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
