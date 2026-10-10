"use client";

import { AlertTriangleIcon, BuildingIcon, CameraIcon, DatabaseIcon, GlobeIcon, IndianRupeeIcon, LinkIcon, MessageSquareIcon, PhoneIcon, SendIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { startInvestigationAction, type StartState } from "@/app/(app)/investigate/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { InputType } from "@/lib/investigation";
import { cn } from "@/lib/utils";

const TABS: { value: InputType; label: string; icon: typeof LinkIcon; field: string; help: string; placeholder: string }[] = [
  { value: "LINK", label: "Link", icon: LinkIcon, field: "Booking link", help: "Public pages only. Nothing is paid or submitted.", placeholder: "https://" },
  { value: "BUSINESS_NAME", label: "Business name", icon: BuildingIcon, field: "Business name", help: "We look it up in the directory and in public sources.", placeholder: "e.g. Hotel Kaziranga Retreat" },
  { value: "MESSAGE", label: "Message", icon: MessageSquareIcon, field: "Message from the seller", help: "Paste what the seller sent. Prices and payment requests are checked.", placeholder: "Paste the message here" },
  { value: "CONTACT", label: "Phone or UPI", icon: PhoneIcon, field: "Phone number or UPI id", help: "Checked against the directory and community reports. Never shown in full.", placeholder: "e.g. 98765 43210 or name@bank" },
];

const SERVICES = [
  { value: "STAY", label: "Accommodation" },
  { value: "TAXI", label: "Taxi" },
  { value: "GUIDE", label: "Guide" },
  { value: "TOUR", label: "Tour" },
  { value: "OTHER", label: "Something else" },
];

const OPTIONS = [
  { name: "research", label: "Web research", icon: GlobeIcon, on: true },
  { name: "capture", label: "Capture evidence", icon: CameraIcon, on: true },
  { name: "knowledge", label: "Match knowledge base", icon: DatabaseIcon, on: true },
  { name: "price", label: "Compare price", icon: IndianRupeeIcon, on: false },
] as const;

const EXAMPLES = [
  { url: "https://sampleridge-stay.example", label: "sampleridge-stay.example", verdict: "Matches", tone: "ok" },
  { url: "https://demohills-homestay-booking.example/shillong", label: "demohills-homestay-booking.example", verdict: "Suspicious", tone: "danger" },
] as const;

const AGENT = [
  { icon: GlobeIcon, title: "Searches the web", text: "Firecrawl finds and reads public pages" },
  { icon: CameraIcon, title: "Captures proof", text: "Browserbase saves a timestamped screenshot" },
  { icon: DatabaseIcon, title: "Matches known data", text: "Pinecone retrieves tariffs and past reports" },
  { icon: ShieldCheckIcon, title: "Writes the verdict", text: "Typed output with sources and a confidence note" },
];

/** A chip that is really a checkbox, so the form posts it. */
function OptionChip({ name, label, icon: Icon, defaultOn }: { name: string; label: string; icon: typeof GlobeIcon; defaultOn: boolean }) {
  return (
    <label className="cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={defaultOn} className="peer sr-only" />
      <span className="inline-flex h-9 items-center gap-2 rounded-full border bg-background px-3.5 text-[13px] font-medium shadow-xs transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </span>
    </label>
  );
}

export function InvestigateScreen({ districts, usage, initialUrl }: { districts: { id: string; name: string }[]; usage: { used: number; limit: number | null; planName: string }; initialUrl?: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startInvestigationAction, undefined);
  const [tab, setTab] = useState<InputType>("LINK");
  const [values, setValues] = useState<Record<InputType, string>>({ LINK: initialUrl ?? "", BUSINESS_NAME: "", MESSAGE: "", CONTACT: "" });
  const current = TABS.find((t) => t.value === tab)!;
  const set = (v: string) => setValues((x) => ({ ...x, [tab]: v }));
  const atLimit = usage.limit !== null && usage.used >= usage.limit;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <form action={action} className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <input type="hidden" name="inputType" value={tab} />

        <div role="tablist" aria-label="What are you checking?" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-[13px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                tab === t.value && "bg-card text-foreground shadow-xs",
              )}
            >
              <t.icon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="main-input" className="text-sm font-medium">{current.field}</label>
          {tab === "MESSAGE" ? (
            <Textarea id="main-input" name="input" value={values[tab]} onChange={(e) => set(e.target.value)} placeholder={current.placeholder} rows={5} maxLength={2000} required />
          ) : (
            <Input id="main-input" name="input" value={values[tab]} onChange={(e) => set(e.target.value)} placeholder={current.placeholder} className={cn("h-11", tab === "LINK" && "font-mono text-[13px]")} maxLength={2000} required autoComplete="off" />
          )}
          <p className="text-[13px] text-muted-foreground">{current.help}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="district" className="text-sm font-medium">District</label>
            <NativeSelect className="w-full" id="district" name="districtId" defaultValue="">
              <option value="">Not sure</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="service" className="text-sm font-medium">Type of service</label>
            <NativeSelect className="w-full" id="service" name="serviceType" defaultValue="">
              <option value="">Not sure</option>
              {SERVICES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {tab !== "MESSAGE" ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="statement" className="text-sm font-medium">Anything the seller said (optional)</label>
            <Textarea id="statement" name="sellerStatement" placeholder="Paste the chat or describe what you were asked to do." rows={4} maxLength={1500} />
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-sm font-medium">What to run</legend>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((o) => (
              <OptionChip key={o.name} name={o.name} label={o.label} icon={o.icon} defaultOn={o.on} />
            ))}
          </div>
        </fieldset>

        {state?.error ? (
          <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}{" "}
            {state.limit ? (
              <Link href="/settings/plan" className="font-medium underline underline-offset-2">See plans</Link>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted-foreground">
            Report language: English
            {usage.limit !== null ? <> · {usage.used} of {usage.limit} used this month</> : null}
          </span>
          <Button type="submit" className="h-10 gap-2 px-4" disabled={pending || atLimit || !values[tab].trim()}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" />
                Starting investigation…
              </>
            ) : (
              <>
                Start investigation
                <SendIcon data-icon="inline-end" />
              </>
            )}
          </Button>
        </div>
      </form>

      <aside className="flex min-w-0 flex-col gap-4">
        <section aria-label="What the agent does" className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="text-[15px] font-semibold">What the agent does</h2>
          <ul className="flex flex-col gap-3.5">
            {AGENT.map((a) => (
              <li key={a.title} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-soft">
                  <a.icon className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="text-[13px] text-muted-foreground">{a.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-warning">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="font-semibold">Not a legal finding</span>
            <span className="text-warning/90">Results are signals with sources. Official reporting stays with the authorities.</span>
          </div>
        </div>

        <section aria-label="Try an example" className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <h2 className="px-5 pt-5 pb-3 text-[15px] font-semibold">Try an example</h2>
          <ul>
            {EXAMPLES.map((e) => (
              <li key={e.url} className="border-t">
                <button
                  type="button"
                  onClick={() => {
                    setTab("LINK");
                    setValues((v) => ({ ...v, LINK: e.url }));
                  }}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left outline-none hover:bg-soft focus-visible:bg-soft"
                >
                  <span className="min-w-0 truncate font-mono text-[13px]">{e.label}</span>
                  <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium", e.tone === "ok" ? "border-ok-border bg-ok-soft text-ok" : "border-danger-border bg-danger-soft text-danger")}>{e.verdict}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
