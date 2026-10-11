"use client";

import { useState } from "react";
import { SavedNote, ToggleRow, useSave } from "@/components/settings/controls";

export function NotificationsTab({ initial, moderator }: { initial: { notifyRunAlerts: boolean; notifyReportUpdates: boolean; notifyModeration: boolean }; moderator: boolean }) {
  const { state, save } = useSave();
  const [v, setV] = useState(initial);
  const set = (patch: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...patch }));
    save(patch);
  };
  return (
    <section aria-label="Notifications" className="overflow-hidden rounded-xl border bg-card shadow-xs lg:max-w-xl" data-testid="tab-notifications">
      <div className="border-b px-5 py-4"><h2 className="text-[15px] font-semibold">In-app notifications</h2><p className="text-[13px] text-muted-foreground">They appear under the bell. We don&apos;t send email.</p></div>
      <ToggleRow id="n-run" title="Run alerts" hint="Notify when an investigation ends" checked={v.notifyRunAlerts} onChange={(x) => set({ notifyRunAlerts: x })} />
      <ToggleRow id="n-report" title="Report updates" hint="Notify when a followed report changes or gets a comment" checked={v.notifyReportUpdates} onChange={(x) => set({ notifyReportUpdates: x })} />
      {moderator ? <ToggleRow id="n-mod" title="Moderation" hint="Notify when a report needs review" checked={v.notifyModeration} onChange={(x) => set({ notifyModeration: x })} /> : null}
      <div className="flex justify-end px-5 py-2"><SavedNote {...state} /></div>
    </section>
  );
}
