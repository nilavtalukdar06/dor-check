"use client";

import { BadgeCheckIcon, MapPinOffIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPropertyAction, deletePropertyAction, updatePropertyAction, verifyPropertyAction } from "@/app/(app)/directory/actions";
import { SidePanel } from "@/components/moderation/bits";
import { EMPTY_PROPERTY, PropertyForm, toPropertyInput, type PropertyFormValues } from "@/components/moderation/property-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlaceSuggestion } from "@/server/geocoding";

export type DirectoryItem = { id: string; slug: string; name: string; type: string; districtName: string; verified: boolean; isDemo: boolean; hasPin: boolean; domain: string | null; edit: PropertyFormValues & { id: string } };
const TYPE: Record<string, string> = { STAY: "Stay", TAXI: "Taxi", GUIDE: "Guide", TOUR: "Tour" };

/** Listed businesses: add, edit, verify, remove. Every change is logged and refreshes the knowledge base. */
export function DirectoryAdmin({ items, districts, popular }: { items: DirectoryItem[]; districts: { id: string; name: string }[]; popular: PlaceSuggestion[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<(PropertyFormValues & { id?: string }) | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = items.filter((p) => !q.trim() || `${p.name} ${p.domain ?? ""} ${p.districtName}`.toLowerCase().includes(q.trim().toLowerCase()));

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work.");
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, website or district" aria-label="Search the directory" className="h-9 pl-9" />
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setEditing({ ...EMPTY_PROPERTY })} data-testid="add-property"><PlusIcon className="size-4" aria-hidden />Add business</Button>
      </div>
      {error ? <p role="alert" className="px-5 pb-2 text-sm text-danger">{error}</p> : null}
      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Business</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>District</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p) => (
              <TableRow key={p.id} data-property={p.slug}>
                <TableCell className="pl-5">
                  <span className="flex items-center gap-1.5 font-medium">{p.name}{!p.hasPin ? <MapPinOffIcon className="size-3.5 text-muted-foreground" aria-label="No map pin" /> : null}</span>
                  {p.domain ? <span className="block font-mono text-xs text-muted-foreground">{p.domain}</span> : null}
                </TableCell>
                <TableCell>{TYPE[p.type] ?? p.type}</TableCell>
                <TableCell>{p.districtName}</TableCell>
                <TableCell>
                  {p.verified ? <Badge variant="ok"><BadgeCheckIcon />Verified</Badge> : <Badge variant="outline">Listed</Badge>} {p.isDemo ? <Badge variant="outline">Demo</Badge> : null}
                </TableCell>
                <TableCell className="pr-5">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => verifyPropertyAction(p.id, !p.verified))}>{p.verified ? "Unverify" : "Verify"}</Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(p.edit)}>Edit</Button>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => deletePropertyAction(p.id))} aria-label={`Remove ${p.name}`}>Remove</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {shown.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">No businesses match.</p> : null}
      </div>
      <SidePanel open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : "Add a business"} description="Listed businesses appear in the directory and on the map. Verify only what you checked." wide>
        {editing ? (
          <PropertyForm
            key={editing.id ?? "new"}
            initial={editing}
            districts={districts}
            popular={popular}
            submitLabel={editing.id ? "Save changes" : "Add business"}
            onSubmit={async (v) => {
              const input = toPropertyInput(v);
              const r = editing.id ? await updatePropertyAction(editing.id, input) : await createPropertyAction(input);
              if (r.ok) {
                setEditing(null);
                router.refresh();
              }
              return r;
            }}
          />
        ) : null}
      </SidePanel>
    </>
  );
}
