"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoadingState } from "@/components/shell/loading";
import { Input } from "@/components/ui/input";
import { EVIDENCE_TABS, evidenceHref, type EvidenceParams } from "@/lib/evidence";
import { cn } from "@/lib/utils";

/**
 * Tabs and search. Every control writes to the URL (not to local state), so filters survive a
 * refresh and can be shared. The capture being watched stays in the URL while filtering.
 */
export function EvidenceControls({ params }: { params: Pick<EvidenceParams, "type" | "q" | "capture"> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(params.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL is the source of truth: follow it if it changes (back/forward, a tab link).
  const urlQ = params.q ?? "";
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ);
    setText(urlQ);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onSearch = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => startTransition(() => router.replace(evidenceHref({ ...params, q: value.trim() || undefined }), { scroll: false })),
      350,
    );
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <nav aria-label="Evidence types" className="flex gap-6 overflow-x-auto border-b">
        {EVIDENCE_TABS.map((tab) => {
          const active = params.type === tab.value;
          return (
            <Link
              key={tab.value}
              href={evidenceHref({ ...params, type: tab.value })}
              replace
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-0.5 pb-3 text-sm outline-none focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        {pending ? <LoadingState text="Searching…" className="hidden sm:flex" /> : null}
        <div className="relative w-64 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => onSearch(e.target.value)} placeholder="Search evidence" aria-label="Search evidence" className="h-9 pl-9" />
        </div>
      </div>
    </div>
  );
}
