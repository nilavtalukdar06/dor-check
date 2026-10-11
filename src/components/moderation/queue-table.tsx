"use client";

import { EyeOffIcon, FilterIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ReviewDrawer } from "@/components/moderation/review-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRIORITY_LABEL, PRIORITY_VARIANT, type Priority } from "@/lib/moderation";
import { CATEGORY_LABEL, REPORT_CATEGORIES, REPORT_STATUSES, STATUS_LABEL, STATUS_VARIANT, type ReportStatusName } from "@/lib/reports";
import { cn } from "@/lib/utils";

export type QueueItem = { id: string; reference: string; summary: string; districtName: string; status: ReportStatusName; hidden: boolean; autoCheck: string; priority: Priority };

const FILTERS = ["status", "category", "district", "priority"] as const;

/** The queue: urgent first. Filters live in the address so a view can be shared. */
export function QueueTable({ rows, districts }: { rows: QueueItem[]; districts: { slug: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState<string | null>(sp.get("review"));
  const [pending, start] = useTransition();
  const active = FILTERS.filter((f) => sp.get(f)).length;

  const set = (key: string, value: string) =>
    start(() => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("review");
      router.replace(`/moderation?${next.toString()}`, { scroll: false });
    });

  const review = (ref: string | null) => {
    setOpen(ref);
    const next = new URLSearchParams(sp.toString());
    if (ref) next.set("review", ref);
    else next.delete("review");
    window.history.replaceState(null, "", `/moderation?${next.toString()}`);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-5 pb-3">
        <p className="text-[13px] text-muted-foreground">{rows.length} {rows.length === 1 ? "report" : "reports"}{sp.get("status") ? "" : " open"} · most urgent first</p>
        <Popover>
          <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium shadow-xs outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50" data-testid="queue-filters">
            <FilterIcon className="size-4" aria-hidden />Filters{active ? ` · ${active}` : ""}
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-72 flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">Status
              <NativeSelect aria-label="Status" className="w-full" value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
                <option value="">Open (new, in review, verified)</option>
                <option value="ALL">All</option>
                {REPORT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">Priority
              <NativeSelect aria-label="Priority" className="w-full" value={sp.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
                <option value="">Any</option>
                {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">Category
              <NativeSelect aria-label="Category" className="w-full" value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)}>
                <option value="">Any</option>
                {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">District
              <NativeSelect aria-label="District" className="w-full" value={sp.get("district") ?? ""} onChange={(e) => set("district", e.target.value)}>
                <option value="">Any</option>
                {districts.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </NativeSelect>
            </label>
            {active ? <Button variant="outline" size="sm" onClick={() => start(() => router.replace("/moderation", { scroll: false }))}>Clear filters</Button> : null}
          </PopoverContent>
        </Popover>
      </div>
      {rows.length === 0 ? (
        <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground" data-testid="queue-empty">Nothing to review here.</p>
      ) : (
        <div className={cn("overflow-x-auto border-t", pending && "opacity-60")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Ref</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Auto-check</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-5"><span className="sr-only">Review</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-queue={r.reference} data-priority={r.priority}>
                  <TableCell className="pl-5 font-mono text-xs">{r.reference}</TableCell>
                  <TableCell className="max-w-[22rem]"><span className="flex items-center gap-1.5"><span className="truncate">{r.summary}</span>{r.hidden ? <EyeOffIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Hidden" /> : null}</span><span className="block text-xs text-muted-foreground">{r.districtName}</span></TableCell>
                  <TableCell className="text-muted-foreground">{r.autoCheck}</TableCell>
                  <TableCell><Badge variant={PRIORITY_VARIANT[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge></TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status]} data-status={r.status}>{STATUS_LABEL[r.status]}</Badge></TableCell>
                  <TableCell className="pr-5 text-right"><Button variant="outline" size="sm" className="shadow-xs" onClick={() => review(r.reference)}>Review</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ReviewDrawer reference={open} onClose={() => review(null)} />
    </>
  );
}
