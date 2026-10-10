"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { startDevCapture } from "./actions";

export function CaptureForm() {
  const [state, action, pending] = useActionState(startDevCapture, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input name="url" placeholder="example.com" aria-label="Page to capture" className="h-10" required />
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Starting…
            </>
          ) : (
            "Capture"
          )}
        </Button>
      </div>
      {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
