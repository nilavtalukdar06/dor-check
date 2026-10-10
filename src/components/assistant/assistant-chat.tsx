"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUpIcon, DatabaseIcon, FileTextIcon, GlobeIcon, IndianRupeeIcon, LinkIcon, MicIcon, SearchIcon, SquareIcon, StoreIcon } from "lucide-react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { BrowserCard, type BrowseFacts } from "@/components/assistant/browser-card";
import { RunCard } from "@/components/assistant/run-card";
import { RichText } from "@/components/assistant/rich-text";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { citationLabel, collectCitations, LANGUAGES, MESSAGE_MAX, type LanguageMode } from "@/lib/assistant";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Is Rs 4,800 fair for a taxi from Guwahati airport to Shillong?", "Is this homestay link safe? I'll paste it.", "What should I do if I already paid an advance?"];

const TOOL_CHIP: Record<string, { label: string; icon: ReactNode }> = {
  retrieveKnowledge: { label: "pinecone.query", icon: <DatabaseIcon className="size-3" aria-hidden /> },
  comparePrice: { label: "comparePrice", icon: <IndianRupeeIcon className="size-3" aria-hidden /> },
  lookupDirectory: { label: "directory.lookup", icon: <StoreIcon className="size-3" aria-hidden /> },
  findSimilarReports: { label: "reports.search", icon: <SearchIcon className="size-3" aria-hidden /> },
  searchWeb: { label: "web.search", icon: <GlobeIcon className="size-3" aria-hidden /> },
  scrapePage: { label: "page.read", icon: <FileTextIcon className="size-3" aria-hidden /> },
};

type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
const recogCtor = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const SPEECH_LANG: Record<LanguageMode, string> = { auto: "en-IN", en: "en-IN", hi: "hi-IN", as: "as-IN" };

/** The conversation, its composer and the language chips. Answers stream in; the server saves both sides. */
export function AssistantChat({ threadId, initialMessages, initialLanguage, investigationId, firstQuestion, isNew }: { threadId: string; initialMessages: UIMessage[]; initialLanguage: LanguageMode; investigationId: string | null; firstQuestion: string | null; isNew: boolean }) {
  const router = useRouter();
  const [language, setLanguage] = useState<LanguageMode>(initialLanguage);
  const [input, setInput] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [listening, setListening] = useState(false);
  const recog = useRef<Recognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const saved = useRef(!isNew);
  const sentFirst = useRef(false);
  const canListen = useSyncExternalStore(() => () => undefined, () => recogCtor() !== null, () => false);

  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      // Only the newest message goes up: the server keeps the rest of the conversation.
      prepareSendMessagesRequest: ({ messages: all, body }) => ({ body: { ...body, id: threadId, message: all[all.length - 1] } }),
    }),
    onFinish: () => {
      // The first answer creates the conversation: show it in the list and put its address in the bar.
      if (!saved.current) {
        saved.current = true;
        window.history.replaceState(null, "", `/assistant/${threadId}`);
      }
      router.refresh();
    },
  });
  const options = { body: { languageMode: language, investigationId } };
  const busy = status === "submitted" || status === "streaming";

  // Arriving from a verdict's "Ask about this result": send the question once. It waits a tick:
  // in development React mounts, unmounts and remounts components, and useChat stops a request
  // that was started before the unmount.
  useEffect(() => {
    if (!firstQuestion || sentFirst.current || messages.length > 0) return;
    const timer = setTimeout(() => {
      if (sentFirst.current) return;
      sentFirst.current = true;
      void sendMessage({ text: firstQuestion }, options);
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstQuestion, messages.length, sendMessage]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, status]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void sendMessage({ text: t }, options);
  };

  const toggleVoice = () => {
    if (listening) return recog.current?.stop();
    const Ctor = recogCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[language];
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      if (said) setInput((cur) => `${cur}${cur && !cur.endsWith(" ") ? " " : ""}${said}`.slice(0, MESSAGE_MAX));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recog.current = r;
    setListening(true);
    r.start();
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="assistant" data-status={status}>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-5 md:px-8" role="group" aria-label="Reply language">
        {LANGUAGES.map((l) => (
          <button key={l.value} type="button" onClick={() => setLanguage(l.value)} aria-pressed={language === l.value} data-language={l.value} className={cn("h-8 rounded-full border px-3.5 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", language === l.value ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-soft")}>
            {l.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8" aria-live="polite">
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-4 py-10" data-testid="empty-chat">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">What would you like to check?</h2>
                <p className="text-sm text-muted-foreground">Ask about a fare, a seller, a link, or what to do next. Answers come from our tariffs, directory, advisories and community reports, and I say so when I have no source.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border bg-background px-3.5 py-2 text-left text-sm outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50">{s}</button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} message={m} /> : <AssistantMessage key={m.id} message={m} />))}

          {status === "submitted" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />Thinking…</div>
          ) : null}
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" data-testid="chat-error">
              <span>{error.message && !/^(failed|network|load)/i.test(error.message) && error.message.length < 160 ? error.message : "That didn't go through."}</span>
              <Button size="sm" variant="outline" onClick={() => void regenerate()}>Try again</Button>
            </div>
          ) : null}
          <div ref={bottom} />
        </div>
      </div>

      <div className="px-4 pb-5 md:px-8">
        <form
          className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border bg-card p-3 shadow-xs"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            maxLength={MESSAGE_MAX}
            placeholder="Ask about a price, a link or what to do next"
            className="max-h-40 min-h-12 w-full resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {linkOpen ? (
            <div className="flex items-center gap-2">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (link.trim()) setInput((cur) => `${cur}${cur ? "\n" : ""}${link.trim()}`.slice(0, MESSAGE_MAX));
                    setLink("");
                    setLinkOpen(false);
                  }
                }}
                aria-label="Link to add"
                placeholder="Paste a link and press Enter"
                className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLinkOpen((o) => !o)} aria-expanded={linkOpen} className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-background px-3 text-[13px] outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50">
                <LinkIcon className="size-3.5" aria-hidden />Attach link
              </button>
              {canListen ? (
                <button type="button" onClick={toggleVoice} aria-pressed={listening} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50", listening ? "border-destructive bg-destructive/5 text-destructive" : "bg-background hover:bg-soft")}>
                  <MicIcon className="size-3.5" aria-hidden />{listening ? "Listening…" : "Voice input"}
                </button>
              ) : null}
            </div>
            {busy ? (
              <Button type="button" size="icon" className="size-9 shrink-0 rounded-full" onClick={() => void stop()} aria-label="Stop"><SquareIcon className="size-3.5 fill-current" /></Button>
            ) : (
              <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={!input.trim()} aria-label="Send"><ArrowUpIcon /></Button>
            )}
          </div>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">Answers are signals from our sources, not legal advice. In an emergency or after a payment, call 1930.</p>
      </div>
    </div>
  );
}

const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

function UserBubble({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-end" data-role="user">
      <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-line text-primary-foreground">{textOf(message)}</div>
    </div>
  );
}

function AssistantMessage({ message }: { message: UIMessage }) {
  const text = textOf(message);
  const tools = message.parts.filter(isToolUIPart);
  const started = tools
    .filter((t) => t.type === "tool-startInvestigation" && t.state === "output-available")
    .map((t) => (t.output as { ok?: boolean; investigationId?: string } | undefined))
    .filter((o): o is { ok: true; investigationId: string } => !!o?.ok && !!o.investigationId);
  type BrowseOut = { captureId?: string; host?: string; facts?: BrowseFacts | null };
  const browsed = tools
    .filter((t) => t.type === "tool-browseSite")
    .map((t) => ({ out: t.output as BrowseOut | undefined, id: t.toolCallId }))
    .filter((b): b is { out: BrowseOut & { captureId: string }; id: string } => !!b.out?.captureId);
  const chips = [...new Set(tools.filter((t) => t.type !== "tool-startInvestigation" && t.type !== "tool-browseSite").map((t) => t.type.replace(/^tool-/, "")))];
  const citations = collectCitations(message.parts);
  const running = tools.some((t) => t.type !== "tool-browseSite" && (t.state === "input-streaming" || t.state === "input-available"));
  const opening = tools.some((t) => t.type === "tool-browseSite" && (t.state === "input-streaming" || t.state === "input-available"));

  return (
    <div className="flex flex-col gap-2.5" data-role="assistant">
      {opening && !browsed.length ? <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />Opening the page in a secure browser…</div> : null}
      {browsed.map((b) => <BrowserCard key={b.id} captureId={b.out.captureId} host={b.out.host ?? "page"} facts={b.out.facts ?? null} />)}
      {text ? (
        <div className="max-w-[92%] rounded-2xl border bg-soft px-4 py-3 text-[15px] leading-relaxed" data-testid="assistant-text">
          <RichText text={text} />
          {chips.length || citations.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span key={c} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 font-mono text-xs text-muted-foreground" data-tool={c}>
                  {TOOL_CHIP[c]?.icon}
                  {TOOL_CHIP[c]?.label ?? c}
                </span>
              ))}
              {citations.map((c) =>
                c.url && /^https?:\/\//i.test(c.url) ? (
                  <a key={`${c.kind}${c.label}${c.url}`} href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-full border bg-background px-3 text-xs outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50" data-citation>{citationLabel(c)}</a>
                ) : c.url ? (
                  <Link key={`${c.kind}${c.label}${c.url}`} href={c.url} className="inline-flex h-8 items-center rounded-full border bg-background px-3 text-xs outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50" data-citation>{citationLabel(c)}</Link>
                ) : (
                  <span key={`${c.kind}${c.label}`} className="inline-flex h-8 items-center rounded-full border bg-background px-3 text-xs" data-citation>{citationLabel(c)}</span>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : running ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />Looking it up…</div>
      ) : null}
      {started.map((s) => <RunCard key={s.investigationId} investigationId={s.investigationId} />)}
    </div>
  );
}
