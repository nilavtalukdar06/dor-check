"use client";

import { CameraIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";
import { startVaultCapture } from "@/app/(app)/evidence/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Starts a capture of any public page. The page then shows the remote browser live. */
export function CaptureDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(startVaultCapture, undefined);

  // A started capture puts its id in the URL; that is the signal to close the dialog.
  const captureId = useSearchParams().get("capture");
  const [lastCaptureId, setLastCaptureId] = useState(captureId);
  if (captureId !== lastCaptureId) {
    setLastCaptureId(captureId);
    if (captureId) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="h-10 gap-2 px-4 shadow-xs" />}>
        <CameraIcon data-icon="inline-start" />
        Capture a page
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Capture a page</DialogTitle>
          <DialogDescription>
            A secure remote browser opens the page while you watch, saves a timestamped screenshot and reads what the page says. It only looks: it never types, clicks or submits.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <Input name="url" defaultValue={state?.url ?? ""} placeholder="Paste a listing or payment page link" aria-label="Page to capture" className="h-10" required autoFocus />
          {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
          <Button type="submit" className="h-10" disabled={pending}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" />
                Starting the browser…
              </>
            ) : (
              "Capture"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
