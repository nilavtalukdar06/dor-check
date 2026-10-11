"use client";

import { CheckCircle2Icon, EyeOffIcon, FileAudioIcon, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getReviewAction, reviewReportAction, setReportHiddenAction } from "@/app/(app)/moderation/actions";
import { retractFindingAction } from "@/app/(app)/reports/actions";
import { FormError, SidePanel } from "@/components/moderation/bits";
import { LoadingState } from "@/components/shell/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { rs } from "@/lib/format";
import { CATEGORY_LABEL, KIND_LABEL, STATUS_LABEL, STATUS_VARIANT, type ReportStatusName } from "@/lib/reports";
import type { ReviewView } from "@/server/moderation";

const date = (d: Date | string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(d));

/**
 * The review drawer: the whole report (unredacted, for moderators), then one decision: a new
 * status, a note to the reporter and an official finding, saved together.
 */
export function ReviewDrawer({ reference, onClose }: { reference: string | null; onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<{ ref: string; data: ReviewView | null } | null>(null);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [finding, setFinding] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (ref: string) =>
    getReviewAction(ref)
      .then((data) => setView({ ref, data }))
      .catch(() => setView({ ref, data: null }));

  useEffect(() => {
    if (!reference) return;
    let stale = false;
    getReviewAction(reference)
      .then((data) => !stale && setView({ ref: reference, data }))
      .catch(() => !stale && setView({ ref: reference, data: null }));
    return () => {
      stale = true;
    };
  }, [reference]);

  const r = view && view.ref === reference ? view.data : undefined;
  const reset = () => {
    setTo("");
    setNote("");
    setFinding("");
    setError(null);
  };

  const submit = () =>
    start(async () => {
      if (!reference) return;
      setError(null);
      setSaved(null);
      const res = await reviewReportAction(reference, { to: to || undefined, note, finding });
      if (!res.ok) return setError(res.error);
      setSaved(to ? `Saved. The report is now ${STATUS_LABEL[to as ReportStatusName].toLowerCase()}.` : "Saved.");
      reset();
      await load(reference);
      router.refresh();
    });

  const hide = (hidden: boolean) =>
    start(async () => {
      if (!reference) return;
      const res = await setReportHiddenAction(reference, hidden);
      if (!res.ok) return setError(res.error);
      await load(reference);
      router.refresh();
    });

  const withdraw = (id: string) =>
    start(async () => {
      if (!reference) return;
      await retractFindingAction(id);
      await load(reference);
      router.refresh();
    });

  return (
    <SidePanel
      open={!!reference}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          setSaved(null);
          onClose();
        }
      }}
      title={reference ? `Review ${reference}` : "Review"}
      description="Decide the status, tell the reporter, and publish an official finding if you checked it."
      wide
    >
      {r === undefined ? (
        <LoadingState text="Loading the report…" />
      ) : r === null ? (
        <p className="text-sm text-muted-foreground">This report could not be found.</p>
      ) : (
        <div className="flex flex-col gap-5" data-testid="review" data-status={r.status}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            {r.hidden ? <Badge variant="warning"><EyeOffIcon />Hidden</Badge> : null}
            <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL]} · {r.districtName} · {KIND_LABEL[r.kind as keyof typeof KIND_LABEL]} · submitted {date(r.createdAt)}</span>
          </div>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{r.summary}</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line" data-testid="review-allegation">{r.allegation}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              {r.amountInr ? <><dt className="text-muted-foreground">Amount</dt><dd>{rs(r.amountInr)}</dd></> : null}
              {r.reportedUrl ? <><dt className="text-muted-foreground">Link</dt><dd className="truncate font-mono">{r.reportedUrl}</dd></> : null}
              {r.locationText ? <><dt className="text-muted-foreground">Place</dt><dd>{r.locationText}</dd></> : null}
              <dt className="text-muted-foreground">Reporter</dt>
              <dd>{r.reporter ? `${r.reporter.name}${r.reporter.email ? ` · ${r.reporter.email}` : ""}` : "Account deleted"}{r.isAnonymous ? " (shown as anonymous)" : ""}</dd>
              {r.identifiers.length ? <><dt className="text-muted-foreground">Identifiers</dt><dd className="font-mono">{r.identifiers.map((i) => `${i.kind.toLowerCase()}: ${i.display}`).join(" · ")}</dd></> : null}
              {r.autoCheckSummary ? <><dt className="text-muted-foreground">Auto-check</dt><dd>{r.autoCheckSummary}</dd></> : null}
            </dl>
          </section>

          {r.voice ? (
            <section className="flex flex-col gap-1.5 rounded-lg border bg-soft p-3 text-xs">
              <span className="flex items-center gap-1.5 font-medium"><FileAudioIcon className="size-3.5" aria-hidden />Spoken report ({r.voice.language})</span>
              <p className="leading-relaxed whitespace-pre-line">{r.voice.transcript}</p>
              {r.voice.translated ? <p className="leading-relaxed text-muted-foreground whitespace-pre-line">{r.voice.translated}</p> : null}
            </section>
          ) : null}

          {r.similar.length ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">Similar reports</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {r.similar.map((s) => (
                  <li key={`${s.reference}-${s.reason}`} className="flex items-center justify-between gap-3"><Link href={`/reports/${s.reference}`} className="truncate hover:underline">{s.reference} · {s.summary}</Link><Badge variant="outline">{s.reason.replace(/_/g, " ")}</Badge></li>
                ))}
              </ul>
            </section>
          ) : null}

          {r.attachments.length ? (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold">Attachments</h3>
              <ul className="grid grid-cols-3 gap-2">
                {r.attachments.map((a) => (
                  <li key={a.id} className="overflow-hidden rounded-lg border bg-muted">
                    <a href={`/evidence?item=${a.id}`} className="flex aspect-[4/3] items-center justify-center text-muted-foreground" target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {a.link ? <img src={a.link} alt={a.title} className="size-full object-cover object-top" /> : <ImageIcon className="size-4" aria-hidden />}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {r.findingsAll.length ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Official findings</h3>
              {r.findingsAll.map((f) => (
                <div key={f.id} className={`flex flex-col gap-1.5 rounded-lg border p-3 text-sm ${f.retractedAt ? "opacity-60" : "border-ok-border bg-ok-soft"}`} data-finding={f.id}>
                  <p className="whitespace-pre-line">{f.body}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{f.retractedAt ? `Withdrawn ${date(f.retractedAt)}` : `Published ${date(f.publishedAt)}`}</span>
                    {!f.retractedAt ? <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={pending} onClick={() => withdraw(f.id)}>Withdraw</Button> : null}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {r.commentCount} {r.commentCount === 1 ? "comment" : "comments"}{r.flaggedCount ? `, ${r.flaggedCount} flagged` : ""} · {r.followers} following · <Link href={`/reports/${r.reference}`} className="underline" target="_blank">Open the public page</Link>
          </p>

          <form
            className="flex flex-col gap-4 border-t pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            data-testid="review-form"
          >
            <h3 className="text-sm font-semibold">Your decision</h3>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="review-status" className="text-sm font-medium">Status</label>
              <NativeSelect id="review-status" className="w-full" value={to} onChange={(e) => setTo(e.target.value)} disabled={!r.next.length}>
                <option value="">{r.next.length ? `Keep as ${STATUS_LABEL[r.status].toLowerCase()}` : "No further status"}</option>
                {r.next.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="review-note" className="text-sm font-medium">Note to the reporter</label>
              <Textarea id="review-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional. Followers see it in the history with the status." />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="review-finding" className="text-sm font-medium">Official finding</label>
              <Textarea id="review-finding" rows={4} maxLength={2000} value={finding} onChange={(e) => setFinding(e.target.value)} placeholder="Optional. What you checked and what you found. Shown above the discussion as the moderators' finding." />
            </div>
            <FormError message={error} />
            {saved ? <p role="status" className="flex items-center gap-1.5 text-sm text-ok" data-testid="review-saved"><CheckCircle2Icon className="size-4" aria-hidden />{saved}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => hide(!r.hidden)}>
                {r.hidden ? "Show publicly again" : "Hide from public"}
              </Button>
              <Button type="submit" disabled={pending || (!to && !note.trim() && !finding.trim())} className="gap-2">{pending ? <Spinner /> : null}Save decision</Button>
            </div>
          </form>
        </div>
      )}
    </SidePanel>
  );
}
