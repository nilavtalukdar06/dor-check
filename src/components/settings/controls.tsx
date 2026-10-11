"use client";

import { CheckIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { savePreferencesAction } from "@/app/(app)/settings/actions";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { PreferencePatch } from "@/lib/settings";

/** Saves a preference and says so. Every control on the Settings screen saves as soon as it changes. */
export function useSave() {
  const [state, setState] = useState<{ status: "idle" | "saving" | "saved" | "error"; error?: string }>({ status: "idle" });
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = (patch: PreferencePatch) =>
    start(async () => {
      setState({ status: "saving" });
      const r = await savePreferencesAction(patch);
      setState(r.ok ? { status: "saved" } : { status: "error", error: r.error });
      if (timer.current) clearTimeout(timer.current);
      if (r.ok) timer.current = setTimeout(() => setState({ status: "idle" }), 2000);
    });
  return { state, save };
}

export function SavedNote({ status, error }: { status: "idle" | "saving" | "saved" | "error"; error?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex h-5 items-center gap-1.5 text-xs text-muted-foreground" data-testid="save-state" data-state={status}>
      {status === "saving" ? <><Spinner />Saving…</> : status === "saved" ? <><CheckIcon className="size-3.5 text-ok" aria-hidden />Saved</> : status === "error" ? <span className="text-danger">{error ?? "Could not save"}</span> : null}
    </span>
  );
}

/** A label with its hint on the left and a control on the right. */
export function Row({ title, hint, children, htmlFor }: { title: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b px-5 py-4 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">{title}</label>
        {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function ToggleRow({ title, hint, checked, onChange, id }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <Row title={title} hint={hint} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={title} />
    </Row>
  );
}

export function SliderRow({ label, value, display, min, max, step, low, high, onCommit, disabled, hint, id }: { label: string; value: number; display: string; min: number; max: number; step: number; low: string; high: string; onCommit: (v: number) => void; disabled?: boolean; hint?: string; id: string }) {
  const [v, setV] = useState(value);
  return (
    <div className="flex flex-col gap-2 border-b px-5 py-4 last:border-b-0" data-slider={id}>
      <div className="flex items-center justify-between text-sm"><span className="font-medium">{label}</span><span className="text-xs text-muted-foreground" data-testid={`${id}-value`}>{disabled ? "Not available" : display}</span></div>
      <Slider aria-label={label} disabled={disabled} value={[v]} min={min} max={max} step={step} onValueChange={(x) => setV(Array.isArray(x) ? x[0] : x)} onValueCommitted={(x) => onCommit(Array.isArray(x) ? x[0] : x)} />
      <div className="flex justify-between text-xs text-muted-foreground"><span>{low}</span><span>{high}</span></div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
