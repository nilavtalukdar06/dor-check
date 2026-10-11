"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideCommentAction } from "@/app/(app)/moderation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type FlaggedItem = { id: string; reference: string; author: string; body: string; reason: string | null; flaggedAt: string | null; held: boolean; flaggedBy: string | null };

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "");

/** Comments a person flagged or the screening held back. Approve shows them; Remove takes them down. */
export function FlaggedComments({ items }: { items: FlaggedItem[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = items.filter((i) => !gone.includes(i.id));

  const decide = (id: string, action: "approve" | "remove") =>
    start(async () => {
      setError(null);
      const r = await decideCommentAction(id, action);
      if (!r.ok) return setError(r.error);
      setGone((g) => [...g, id]);
      router.refresh();
    });

  if (!list.length) return <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground" data-testid="flagged-empty">No flagged comments.</p>;
  return (
    <ul className="border-t" data-testid="flagged">
      {error ? <li role="alert" className="px-5 py-2 text-sm text-danger">{error}</li> : null}
      {list.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 border-b px-5 py-4 last:border-b-0" data-flagged={c.id}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href={`/reports/${c.reference}`} className="font-mono hover:underline" target="_blank">{c.reference}</Link>
            <span className="font-medium">{c.author}</span>
            <Badge variant={c.held ? "info" : "warning"}>{c.held ? "Held before posting" : "Flagged"}</Badge>
            <span className="text-muted-foreground">{c.reason ?? "No reason given"} · by {c.flaggedBy ?? "a traveller"} · {when(c.flaggedAt)}</span>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{c.body}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(c.id, "approve")}>{c.held ? "Approve and post" : "Keep it"}</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(c.id, "remove")}>Remove</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
