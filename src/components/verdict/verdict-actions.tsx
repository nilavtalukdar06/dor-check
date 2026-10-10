"use client";

import { CheckIcon, CopyIcon, DownloadIcon, Share2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { setSharingAction } from "@/app/(app)/investigate/[id]/verdict/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

/** Export as PDF: the browser's print dialog, with a print stylesheet that leaves out the app chrome. */
export function ExportButton() {
  return (
    <Button variant="outline" className="h-10 gap-2 px-4 shadow-xs" onClick={() => window.print()}>
      <DownloadIcon data-icon="inline-start" />
      Export
    </Button>
  );
}

/** Private by default. Turning it on makes a link anyone can read; turning it off kills that link. */
export function ShareButton({ id, isPublic, token }: { id: string; isPublic: boolean; token: string | null }) {
  const [on, setOn] = useState(isPublic);
  const [tok, setTok] = useState(token);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const link = on && tok ? `${typeof window === "undefined" ? "" : window.location.origin}/share/${tok}` : "";

  const toggle = (next: boolean) =>
    start(async () => {
      setError(null);
      const res = await setSharingAction(id, next);
      if (!res.ok) return setError(res.error);
      setOn(next);
      setTok(res.token);
    });

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="h-10 gap-2 px-4 shadow-xs" />}>
        <Share2Icon data-icon="inline-start" />
        Share
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3">
        <PopoverHeader>
          <PopoverTitle>Share this verdict</PopoverTitle>
          <PopoverDescription>Only you can see it unless you turn the link on. The link shows the verdict and its sources, never your message or your screenshots.</PopoverDescription>
        </PopoverHeader>
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          Anyone with the link can view
          <span className="flex items-center gap-2">
            {pending ? <Spinner /> : null}
            <Switch checked={on} onCheckedChange={toggle} disabled={pending} aria-label="Anyone with the link can view" />
          </span>
        </label>
        {on && link ? (
          <div className="flex items-center gap-2">
            <input readOnly value={link} aria-label="Share link" className="h-9 min-w-0 flex-1 rounded-lg border bg-soft px-2.5 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="outline"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Copy link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  /* the field is selectable, so copying by hand still works */
                }
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
