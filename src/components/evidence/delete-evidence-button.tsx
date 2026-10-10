"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEvidence } from "@/app/(app)/evidence/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { evidenceHref, type EvidenceParams } from "@/lib/evidence";

export function DeleteEvidenceButton({ id, params, citedByReports }: { id: string; params: Pick<EvidenceParams, "type" | "q" | "capture">; citedByReports: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const res = await deleteEvidence(id);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.replace(evidenceHref(params), { scroll: false });
      router.refresh();
    });

  return (
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
      <AlertDialogTrigger render={<Button variant="outline" className="h-9 gap-2 text-danger shadow-xs" disabled={citedByReports} title={citedByReports ? "A report cites this item" : undefined} />}>
        <Trash2Icon data-icon="inline-start" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this evidence?</AlertDialogTitle>
          <AlertDialogDescription>The file is removed from your vault and cannot be recovered.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
