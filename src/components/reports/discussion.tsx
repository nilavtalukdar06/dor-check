"use client";

import { CheckIcon, FlagIcon, SendIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { StreamChat, type Event as StreamEvent } from "stream-chat";
import { flagCommentAction, moderateCommentAction, postCommentAction } from "@/app/(app)/reports/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX, FLAG_REASONS } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { CommentView } from "@/server/comments";

type Live = "connecting" | "live" | "offline";

const stamp = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** A Stream message as a comment. Everything the card needs rides on the message itself. */
function fromMessage(m: NonNullable<StreamEvent["message"]>, me: string): CommentView {
  const x = m as unknown as { comment_id?: string; author_name?: string; badge?: string; reporter?: boolean; flagged?: boolean; created_at?: string | Date };
  return {
    id: x.comment_id ?? m.id,
    author: x.author_name ?? "Traveller",
    badge: x.badge === "Official" ? "Official" : "Traveller",
    body: m.text ?? "",
    createdAt: new Date(x.created_at ?? Date.now()).toISOString(),
    state: x.flagged ? "flagged" : "visible",
    mine: m.user?.id === me,
    reporter: !!x.reporter,
  };
}

/**
 * The discussion under a report. The list starts from the server (so it is right for this
 * person: held comments only for their author and moderators) and Stream adds what is posted
 * while the page is open. Posting goes through the server, which screens and then sends it.
 */
export function Discussion({ reference, initial, staff, closed }: { reference: string; initial: CommentView[]; staff: boolean; closed: boolean }) {
  const [items, setItems] = useState(initial);
  const [live, setLive] = useState<Live>("connecting");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  // Merge by id: the server list, our own post and the live event can all describe one comment.
  const upsert = useCallback((c: CommentView) => {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === c.id);
      if (i === -1) return [...cur, c].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const next = cur.slice();
      // Keep what the server knows that an event cannot (e.g. it is mine, or held).
      next[i] = { ...cur[i], ...c, mine: cur[i].mine || c.mine, state: cur[i].state === "removed" ? "removed" : c.state };
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let client: StreamChat | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/stream/token?ref=${encodeURIComponent(reference)}`, { cache: "no-store" });
        if (!res.ok) throw new Error("token");
        const { apiKey, userId, token, channelId } = (await res.json()) as { apiKey: string; userId: string; token: string; channelId: string };
        if (cancelled) return;
        client = new StreamChat(apiKey);
        await client.connectUser({ id: userId }, token);
        if (cancelled) return void client.disconnectUser();
        const channel = client.channel("report", channelId);
        await channel.watch({ messages: { limit: 50 }, presence: false });
        if (cancelled) return;
        // Anything posted between the page loading and now.
        for (const m of channel.state.messages) if (m.type !== "deleted" && !m.deleted_at) upsert(fromMessage(m as never, userId));
        channel.on("message.new", (e) => e.message && upsert(fromMessage(e.message, userId)));
        channel.on("message.updated", (e) => e.message && upsert(fromMessage(e.message, userId)));
        channel.on("message.deleted", (e) => {
          const id = (e.message as unknown as { comment_id?: string } | undefined)?.comment_id ?? e.message?.id;
          setItems((cur) => (staff ? cur.map((c) => (c.id === id ? { ...c, state: "removed" } : c)) : cur.filter((c) => c.id !== id)));
        });
        client.on("connection.changed", (e) => setLive(e.online ? "live" : "offline"));
        setLive("live");
      } catch {
        if (!cancelled) setLive("offline");
      }
    })();
    return () => {
      cancelled = true;
      void client?.disconnectUser();
    };
  }, [reference, staff, upsert]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const post = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const res = await postCommentAction(reference, text);
      if (!res.ok) return setError(res.error);
      setText("");
      upsert(res.comment);
      if (res.heldReason) setNotice(`Your comment is waiting for a moderator (${res.heldReason.toLowerCase()}). Only you can see it until then.`);
    });

  const visible = items.filter((c) => c.state !== "removed" || staff);

  return (
    <section aria-label="Discussion" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs" data-testid="discussion" data-live={live}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Discussion</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          <span aria-hidden className={cn("size-1.5 rounded-full", live === "live" ? "bg-ok" : live === "connecting" ? "bg-warning" : "bg-muted-foreground")} />
          {live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Offline: new comments appear after a refresh"}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No comments yet. If you know something about this seller, add it below. Keep it factual.</p>
      ) : (
        <ul ref={listRef} className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1" data-testid="comment-list">
          {visible.map((c) => (
            <CommentCard key={c.id} c={c} staff={staff} onChange={(patch) => setItems((cur) => cur.map((x) => (x.id === c.id ? { ...x, ...patch } : x)))} />
          ))}
        </ul>
      )}

      {closed ? (
        <p className="text-sm text-muted-foreground">The discussion on this report is closed.</p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !pending) post();
          }}
        >
          <label htmlFor="comment-body" className="sr-only">Add a comment</label>
          <Textarea id="comment-body" value={text} onChange={(e) => setText(e.target.value)} maxLength={COMMENT_MAX} rows={3} placeholder="Add what you know. Please don't post phone numbers or payment ids." disabled={pending} aria-describedby="comment-help" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id="comment-help" className="text-xs text-muted-foreground">{text.length}/{COMMENT_MAX} · Comments are moderated.</span>
            <Button type="submit" disabled={pending || !text.trim()} className="gap-2">
              {pending ? <Spinner /> : <SendIcon className="size-4" aria-hidden />}
              Post
            </Button>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive" data-testid="comment-error">{error}</p> : null}
          {notice ? <p role="status" className="text-sm text-warning" data-testid="comment-notice">{notice}</p> : null}
        </form>
      )}
    </section>
  );
}

function CommentCard({ c, staff, onChange }: { c: CommentView; staff: boolean; onChange: (patch: Partial<CommentView>) => void }) {
  const [flagging, setFlagging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const official = c.badge === "Official";

  const flag = (reason: string) =>
    start(async () => {
      setError(null);
      const res = await flagCommentAction(c.id, reason);
      if (!res.ok) return setError(res.error);
      setFlagging(false);
      onChange({ state: "flagged" });
    });
  const decide = (action: "approve" | "remove") =>
    start(async () => {
      setError(null);
      const res = await moderateCommentAction(c.id, action);
      if (!res.ok) return setError(res.error);
      onChange({ state: action === "approve" ? "visible" : "removed" });
    });

  return (
    <li
      className={cn("flex flex-col gap-1.5 rounded-lg border p-3.5", official ? "border-ok-border bg-ok-soft" : "bg-background", c.state === "removed" && "opacity-60")}
      data-comment={c.id}
      data-state={c.state}
      data-badge={c.badge}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-sm font-medium">{c.author}</span>
        {official ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-ok-border bg-card px-2 py-0.5 text-ok" data-testid="official-badge"><ShieldCheckIcon className="size-3" aria-hidden />Official</span>
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Traveller</span>
        )}
        {c.reporter ? <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Reporter</span> : null}
        <span className="text-muted-foreground">{stamp(c.createdAt)}</span>
        {c.state === "flagged" ? <span className="rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-warning">Flagged for review</span> : null}
        {c.state === "held" ? <span className="rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-warning">Waiting for a moderator</span> : null}
        {c.state === "removed" ? <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Removed</span> : null}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line">{c.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        {!c.mine && !staff && c.state === "visible" && !flagging ? (
          <button type="button" onClick={() => setFlagging(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
            <FlagIcon className="size-3" aria-hidden />Flag
          </button>
        ) : null}
        {flagging ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Why are you flagging this?">
            {FLAG_REASONS.map((r) => (
              <button key={r} type="button" disabled={pending} onClick={() => flag(r)} className="rounded-full border px-2.5 py-1 text-xs outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50">{r}</button>
            ))}
            <button type="button" onClick={() => setFlagging(false)} className="px-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        ) : null}
        {staff && (c.state === "flagged" || c.state === "held") ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("approve")} className="h-7 gap-1 px-2.5 text-xs"><CheckIcon className="size-3" aria-hidden />Approve</Button>
        ) : null}
        {staff && c.state !== "removed" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("remove")} className="h-7 gap-1 px-2.5 text-xs"><Trash2Icon className="size-3" aria-hidden />Remove</Button>
        ) : null}
        {pending ? <Spinner /> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </li>
  );
}
