"use client";

import { ArrowUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = ["Is it safe to pay an advance?", "What should I ask the seller?", "How can I check this seller another way?"];

/**
 * Follow-up questions about this result. The assistant itself is built in Phase 24; until then
 * this hands the question, with the investigation, to the Assistant page.
 */
export function AskDock({ investigationId }: { investigationId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (q: string) => router.push(`/assistant?investigation=${investigationId}&q=${encodeURIComponent(q.slice(0, 300))}`);
  return (
    <section aria-label="Ask about this result" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
      <h2 className="text-[15px] font-semibold">Ask about this result</h2>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => go(s)} className="rounded-full border bg-background px-3 py-1.5 text-left text-xs transition-colors outline-none hover:bg-soft focus-visible:ring-3 focus-visible:ring-ring/50">
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) go(text.trim());
        }}
        className="flex items-center gap-2 rounded-xl border bg-background p-1.5 pl-3"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a follow-up" aria-label="Ask a follow-up question" maxLength={300} className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={!text.trim()} aria-label="Ask">
          <ArrowUpIcon />
        </Button>
      </form>
    </section>
  );
}
