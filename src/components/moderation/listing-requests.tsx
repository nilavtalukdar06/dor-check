"use client";

import { FileTextIcon, MapPinIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideListingAction } from "@/app/(app)/moderation/actions";
import { FormError } from "@/components/moderation/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RequestItem = {
  id: string; name: string; type: string; districtName: string; description: string | null; address: string | null; domain: string | null; phone: string | null; email: string | null; businessUpi: string | null; registrationNumber: string | null;
  lat: number | null; lng: number | null; createdAt: string; requester: string | null; document: { title: string; link: string | null; mimeType: string } | null; possibleMatches: string[];
};

const TYPE: Record<string, string> = { STAY: "Stay", TAXI: "Taxi", GUIDE: "Guide", TOUR: "Tour" };
const day = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/**
 * Businesses asking to be listed. Verifying is the moderator's own check (registration number,
 * website, business phone and UPI, the document, a call back): the app never claims to have done it.
 */
export function ListingRequests({ items }: { items: RequestItem[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [pending, start] = useTransition();
  const list = items.filter((i) => !gone.includes(i.id));

  const decide = (id: string, decision: "list" | "verify" | "reject") =>
    start(async () => {
      setError(null);
      const r = await decideListingAction(id, decision, decision === "reject" ? reason : undefined);
      if (!r.ok) return setError({ id, message: r.error });
      setGone((g) => [...g, id]);
      setRejecting(null);
      setReason("");
      router.refresh();
    });

  if (!list.length) return <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground" data-testid="requests-empty">No listing requests waiting.</p>;
  return (
    <ul className="border-t" data-testid="requests">
      {list.map((p) => (
        <li key={p.id} className="flex flex-col gap-3 border-b px-5 py-5 last:border-b-0" data-request={p.id}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{p.name}</h3>
            <Badge variant="outline">{TYPE[p.type] ?? p.type}</Badge>
            <span className="text-xs text-muted-foreground">{p.districtName} · requested {day(p.createdAt)}{p.requester ? ` by ${p.requester}` : ""}</span>
          </div>
          {p.description ? <p className="text-sm text-muted-foreground">{p.description}</p> : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr_auto_1fr]">
            {[["Website", p.domain], ["Phone", p.phone], ["UPI", p.businessUpi], ["Email", p.email], ["Registration", p.registrationNumber], ["Address", p.address]].map(([k, v]) =>
              v ? <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-mono break-all">{v}</dd></div> : null,
            )}
          </dl>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPinIcon className="size-3.5" aria-hidden />{p.lat !== null && p.lng !== null ? `Pin at ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : "No pin: it will not show on the map"}</span>
            {p.document ? (
              p.document.link ? <a href={p.document.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline"><FileTextIcon className="size-3.5" aria-hidden />{p.document.title}</a> : <span className="flex items-center gap-1"><FileTextIcon className="size-3.5" aria-hidden />{p.document.title}</span>
            ) : <span>No document attached</span>}
            {p.possibleMatches.length ? <span className="text-warning">Similar names already listed: {p.possibleMatches.join(", ")}</span> : null}
          </div>
          {rejecting === p.id ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); decide(p.id, "reject"); }}>
              <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why it is not approved (sent to the business)" aria-label="Reason" className="h-9 min-w-0 flex-1" />
              <Button type="submit" size="sm" variant="outline" disabled={pending || !reason.trim()}>Reject</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pending} onClick={() => decide(p.id, "verify")}>Approve and verify</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(p.id, "list")}>Approve and list</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => { setRejecting(p.id); setReason(""); }}>Reject…</Button>
            </div>
          )}
          {error?.id === p.id ? <FormError message={error.message} /> : null}
          <p className="text-xs text-muted-foreground">Verify only after you checked the registration number, the website, the business phone and UPI (and the document or a call back). The app does not check the business itself.</p>
        </li>
      ))}
    </ul>
  );
}
