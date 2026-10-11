"use client";

import { useState } from "react";
import { SavedNote, ToggleRow, useSave } from "@/components/settings/controls";

export function PrivacyTab({ reportsAnonymous }: { reportsAnonymous: boolean }) {
  const { state, save } = useSave();
  const [anon, setAnon] = useState(reportsAnonymous);
  return (
    <div className="flex flex-col gap-6 lg:max-w-xl" data-testid="tab-privacy">
      <section aria-label="Reports" className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b px-5 py-4"><h2 className="text-[15px] font-semibold">Reports</h2></div>
        <ToggleRow id="p-anon" title="Hide my name on new reports" hint="Your name is never shown publicly. You can change it for each report." checked={anon} onChange={(x) => { setAnon(x); save({ reportsAnonymous: x }); }} />
        <div className="flex justify-end px-5 py-2"><SavedNote {...state} /></div>
      </section>
      <section aria-label="What we keep" className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-sm shadow-xs">
        <h2 className="text-[15px] font-semibold">What we keep</h2>
        <p className="text-muted-foreground">Your checks, evidence, chats and audio are private to you. Screenshots and recordings are stored in private storage and opened only with a short-lived link. Reporters&apos; names are never shown, and phone numbers and payment ids are hidden from other travellers.</p>
        <p className="text-muted-foreground">To remove your account and what is tied to it, use Manage account on the Profile tab.</p>
      </section>
    </div>
  );
}
