"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishFindingAction, retractFindingAction } from "@/app/(app)/reports/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { FINDING_MAX } from "@/lib/comments";

/** Moderators only: write an official finding. It appears above the discussion, not in it. */
export function FindingForm({ reference }: { reference: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      aria-label="Publish an official finding"
      className="flex flex-col gap-2 rounded-xl border border-dashed bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await publishFindingAction(reference, text);
          if (!res.ok) return setError(res.error);
          setText("");
          router.refresh();
        });
      }}
    >
      <h2 className="text-[15px] font-semibold">Publish an official finding</h2>
      <p className="text-xs text-muted-foreground">Say what was checked and what was found. Everyone who can see this report will read it, labelled as a moderator&apos;s finding.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={FINDING_MAX} rows={4} aria-label="Finding" disabled={pending} data-testid="finding-body" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{text.length}/{FINDING_MAX}</span>
        <Button type="submit" disabled={pending || text.trim().length < 20} className="gap-2">{pending ? <Spinner /> : null}Publish finding</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function WithdrawFinding({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await retractFindingAction(id);
          router.refresh();
        })
      }
      className="h-7 w-fit px-2.5 text-xs"
    >
      {pending ? <Spinner /> : null}Withdraw
    </Button>
  );
}
