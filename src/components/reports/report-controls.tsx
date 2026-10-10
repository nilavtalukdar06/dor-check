"use client";

import { FilterIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LoadingState } from "@/components/shell/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORY_LABEL, REPORT_CATEGORIES, REPORT_STATUSES, REPORT_TABS, reportsHref, STATUS_LABEL, type ReportListParams } from "@/lib/reports";
import { cn } from "@/lib/utils";

/** Tabs, search and filters. Every control writes to the URL, so a view survives a refresh and can be shared. */
export function ReportControls({ params, districts }: { params: ReportListParams; districts: { slug: string; name: string }[] }) {
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

  const go = (next: Partial<ReportListParams>) => startTransition(() => router.replace(reportsHref({ ...params, page: 1, ...next }), { scroll: false }));
  const onSearch = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() || undefined }), 350);
  };
  const active = [params.category, params.district, params.status].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <nav aria-label="Report lists" className="flex gap-6 overflow-x-auto border-b">
        {REPORT_TABS.map((tab) => {
          const on = params.tab === tab.value;
          return (
            <Link
              key={tab.value}
              href={reportsHref({ ...params, tab: tab.value, page: 1 })}
              replace
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-0.5 pb-3 text-sm outline-none focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50", on ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        {pending ? <LoadingState text="Searching…" className="hidden sm:flex" /> : null}
        <div className="relative w-56 max-w-full">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => onSearch(e.target.value)} placeholder="Search reports" aria-label="Search reports" className="h-9 pl-9" />
        </div>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" className="h-9 gap-2 px-3 shadow-xs" />}>
            <FilterIcon data-icon="inline-start" />
            Filters{active ? ` · ${active}` : ""}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Category
              <NativeSelect className="w-full" value={params.category ?? ""} onChange={(e) => go({ category: (e.target.value || undefined) as ReportListParams["category"] })} aria-label="Category">
                <option value="">All categories</option>
                {REPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              District
              <NativeSelect className="w-full" value={params.district ?? ""} onChange={(e) => go({ district: e.target.value || undefined })} aria-label="District">
                <option value="">All districts</option>
                {districts.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.name}</option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Status
              <NativeSelect className="w-full" value={params.status ?? ""} onChange={(e) => go({ status: (e.target.value || undefined) as ReportListParams["status"] })} aria-label="Status">
                <option value="">Any status</option>
                {REPORT_STATUSES.filter((s) => s !== "REJECTED").map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </NativeSelect>
            </label>
            {active ? (
              <Button variant="ghost" size="sm" onClick={() => go({ category: undefined, district: undefined, status: undefined })}>
                Clear filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
