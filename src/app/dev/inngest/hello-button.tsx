"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { sendHelloAction } from "./actions";

export function HelloButton() {
  const [name, setName] = useState("Assam");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name to greet" className="h-10" />
        <Button
          className="h-10"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await sendHelloAction(name);
              setMessage(r.ok ? `Sent event ${r.ids[0]}. Open http://localhost:8288 to see the run.` : r.error);
            })
          }
        >
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Sending…
            </>
          ) : (
            "Send hello"
          )}
        </Button>
      </div>
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
