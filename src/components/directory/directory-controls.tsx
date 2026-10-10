"use client";

import { FilterIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoadingState } from "@/components/shell/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIRECTORY_TABS, directoryHref, type DirectoryParams } from "@/lib/directory";
import { cn } from "@/lib/utils";

/**
 * Tabs, search and the Verified-only toggle. Every control writes to the URL (not to local
 * state), so filters survive a refresh and can be shared.
 */
export function DirectoryControls({ params }: { params: Pick<DirectoryParams, "type" | "q" | "verified"> }) {
  const router = useRouter();
  const pathname = usePathname();
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

  const go = (next: Partial<DirectoryParams>) =>
    startTransition(() => router.replace(directoryHref({ ...params, ...next, property: undefined }), { scroll: false }));

  const onSearch = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() || undefined }), 350);
  };

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <nav aria-label="Directory categories" className="flex gap-6 border-b">
        {DIRECTORY_TABS.map((tab) => {
          const active = params.type === tab.value;
          return (
            <Link
              key={tab.value}
              href={directoryHref({ ...params, type: tab.value, property: undefined })}
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
          <Input
            value={text}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search the directory"
            aria-label="Search the directory"
            className="h-9 pl-9"
          />
        </div>
        <Button
          variant="outline"
          className={cn("h-9 gap-2 px-3 shadow-xs", params.verified && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
          aria-pressed={!!params.verified}
          onClick={() => go({ verified: params.verified ? undefined : "1" })}
        >
          <FilterIcon data-icon="inline-start" />
          Verified only
        </Button>
      </div>
      {/* keep the pathname referenced so the router treats this as the directory route */}
      <span hidden data-path={pathname} />
    </div>
  );
}
