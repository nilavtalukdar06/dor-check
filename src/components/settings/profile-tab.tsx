"use client";

import { useClerk } from "@clerk/nextjs";
import { useState, useTransition } from "react";
import { saveDisplayNameAction } from "@/app/(app)/settings/actions";
import { SavedNote, useSave } from "@/components/settings/controls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export function ProfileTab({ name, email, imageUrl, displayName, homeDistrictId, districts }: { name: string; email: string | null; imageUrl: string | null; displayName: string; homeDistrictId: string | null; districts: { id: string; name: string }[] }) {
  const clerk = useClerk();
  const { state, save } = useSave();
  const [value, setValue] = useState(displayName);
  const [nameState, setNameState] = useState<{ status: "idle" | "saving" | "saved" | "error"; error?: string }>({ status: "idle" });
  const [, start] = useTransition();
  const commit = () =>
    start(async () => {
      if (value.trim() === displayName) return;
      setNameState({ status: "saving" });
      const r = await saveDisplayNameAction(value);
      setNameState(r.ok ? { status: "saved" } : { status: "error", error: r.error });
    });
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2" data-testid="tab-profile">
      <section aria-label="Profile" className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="flex flex-col gap-0.5 border-b px-5 py-4"><h2 className="text-[15px] font-semibold">Profile</h2><p className="text-[13px] text-muted-foreground">Managed by Clerk</p></div>
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar className="size-14"><AvatarImage src={imageUrl ?? undefined} alt="" /><AvatarFallback className="bg-purple-600 text-lg font-semibold text-white">{(displayName || name).charAt(0).toUpperCase()}</AvatarFallback></Avatar>
            <div className="flex min-w-0 flex-1 flex-col"><span className="truncate font-medium">{name}</span><span className="truncate text-sm text-muted-foreground">{email}</span></div>
            <Button variant="outline" className="shadow-xs" onClick={() => clerk.openUserProfile()}>Manage account</Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="display-name" className="text-sm font-medium">Display name</label>
            <Input id="display-name" value={value} maxLength={40} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur())} className="h-10" />
            <div className="flex items-center justify-between"><p className="text-[13px] text-muted-foreground">Shown in your greeting and next to your comments. Only the first name is shown to others.</p><SavedNote {...nameState} /></div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="home-district" className="text-sm font-medium">Home district</label>
            <NativeSelect id="home-district" className="w-full" value={homeDistrictId ?? ""} onChange={(e) => save({ homeDistrictId: e.target.value || null })}>
              <option value="">Not set</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </NativeSelect>
            <div className="flex justify-end"><SavedNote {...state} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}
