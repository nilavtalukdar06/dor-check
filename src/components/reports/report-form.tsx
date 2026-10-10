"use client";

import { AlertTriangleIcon, ImageUpIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { useDropzone } from "react-dropzone";
import { submitReportAction } from "@/app/(app)/reports/actions";
import { PlaceInput } from "@/components/price/place-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VoiceReport, type VoiceReportResult } from "@/components/reports/voice-report";
import { CATEGORY_LABEL, KIND_LABEL, REPORT_CATEGORIES, REPORT_KINDS, reportInputSchema, type ReportInput } from "@/lib/reports";
import { MAX_UPLOAD_BYTES } from "@/lib/evidence";
import { cn } from "@/lib/utils";
import type { PlaceSuggestion } from "@/server/geocoding";
import type { ReportFormOptions } from "@/server/reports-view";

/** The shared schema is the single source of truth: the same rules run here and on the server. */
const resolver: Resolver<ReportInput> = async (values) => {
  const parsed = reportInputSchema.safeParse(values);
  if (parsed.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= { type: "validation", message: issue.message };
  return { values: {}, errors } as never;
};

const today = () => new Date().toISOString().slice(0, 10);

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor?: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {error ? <p role="alert" className="text-[13px] text-danger" data-error>{error}</p> : hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ReportForm({ options, popularPlaces }: { options: ReportFormOptions; popularPlaces: PlaceSuggestion[] }) {
  // React Hook Form's watch() hands out values the React Compiler cannot track, so this component opts out.
  "use no memo";
  const p = options.prefill;
  const form = useForm<ReportInput>({
    resolver,
    defaultValues: {
      kind: "SCAM",
      category: (p?.category as ReportInput["category"]) ?? "STAY",
      summary: p?.summary ?? "",
      description: "",
      districtId: p?.districtId ?? "",
      locationText: "",
      incidentDate: "",
      reportedUrl: p?.reportedUrl ?? "",
      amountInr: undefined,
      evidenceIds: p?.evidenceIds ?? [],
      isAnonymous: true,
      investigationId: p?.investigationId,
      voiceJobId: undefined,
    },
  });
  const { register, control, handleSubmit, setValue, watch, setError, formState: { errors, isSubmitting } } = form;
  const [formError, setFormError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ id: string; title: string; preview: string }[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // watch() is the known case the React Compiler lint cannot follow; this component opts out of the compiler above.
  // eslint-disable-next-line react-hooks/incompatible-library
  const selected = watch("evidenceIds") ?? [];
  const toggle = (id: string) => setValue("evidenceIds", selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], { shouldValidate: true });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] },
    maxSize: MAX_UPLOAD_BYTES,
    multiple: true,
    disabled: uploading,
    onDropRejected: () => setUploadError("Only PNG, JPEG or WebP images up to 8 MB can be attached."),
    onDrop: async (files) => {
      setUploadError(null);
      setUploading(true);
      for (const file of files) {
        const body = new FormData();
        body.set("file", file);
        body.set("title", file.name.replace(/\.[^.]+$/, "").slice(0, 80));
        try {
          const res = await fetch("/api/evidence/upload", { method: "POST", body });
          const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
          if (!res.ok || !data.id) {
            setUploadError(data.error ?? "That file could not be uploaded.");
            continue;
          }
          const preview = URL.createObjectURL(file);
          previews.current.push(preview);
          setUploaded((u) => [...u, { id: data.id!, title: file.name, preview }]);
          setValue("evidenceIds", [...(form.getValues("evidenceIds") ?? []), data.id].slice(0, 8), { shouldValidate: true });
        } catch {
          setUploadError("The upload failed. Check your connection and try again.");
        }
      }
      setUploading(false);
    },
  });

  // A spoken report: the transcript and its English version go into the description to be edited.
  const onVoice = (r: VoiceReportResult) => {
    const both = r.translated ? `${r.transcript}\n\n${r.translated}` : r.transcript;
    // Keep the original words if both do not fit.
    const text = both.length <= 2000 ? both : r.transcript.slice(0, 2000);
    setValue("description", text, { shouldValidate: true, shouldDirty: true });
    setValue("voiceJobId", r.id);
    setSpoken(true);
    // The title is the first sentence of the English text.
    const english = ((r.translated ?? r.transcript).replace(/\s+/g, " ").trim().split(/(?<=[.!?।])\s/)[0] ?? "").trim();
    if (!form.getValues("summary")) setValue("summary", english.length > 100 ? `${english.slice(0, 97).trimEnd()}...` : english.length >= 8 ? english : "Spoken report", { shouldValidate: true });
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    // On success the server action redirects to the new report; it only returns when something is wrong.
    const res = await submitReportAction(values);
    if (res && !res.ok) {
      setFormError(res.error);
      for (const [name, message] of Object.entries(res.fields ?? {})) setError(name as keyof ReportInput, { type: "server", message });
    }
  });

  const attachable = [...uploaded.map((u) => ({ id: u.id, title: u.title, thumbnail: u.preview })), ...options.evidence.filter((e) => !uploaded.some((u) => u.id === e.id)).map((e) => ({ id: e.id, title: e.title, thumbnail: e.thumbnail }))];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">What kind of problem was it?</legend>
          <Controller control={control} name="kind" render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {REPORT_KINDS.map((k) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="kind" value={k} checked={field.value === k} onChange={() => field.onChange(k)} className="peer sr-only" />
                  <span className="inline-flex h-9 items-center rounded-full border bg-background px-3.5 text-[13px] font-medium shadow-xs transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">{KIND_LABEL[k]}</span>
                </label>
              ))}
            </div>
          )} />
        </fieldset>

        <Field label="Short title" htmlFor="summary" error={errors.summary?.message} hint="One line, for example: Asked for an advance to a personal UPI id.">
          <Input id="summary" {...register("summary")} maxLength={120} className="h-10" aria-invalid={!!errors.summary} />
        </Field>

        <VoiceReport onResult={onVoice} />

        <Field label={spoken ? "Transcript (editable)" : "What happened"} htmlFor="description" error={errors.description?.message} hint="Stick to facts: what you were asked, what you paid, what happened next. Please leave out your own phone number.">
          <Textarea id="description" {...register("description")} rows={6} maxLength={2000} placeholder="Describe what happened" aria-invalid={!!errors.description} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category" error={errors.category?.message}>
            <NativeSelect className="w-full" id="category" {...register("category")}>
              {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </NativeSelect>
          </Field>
          <Field label="District" htmlFor="districtId" error={errors.districtId?.message}>
            <NativeSelect className="w-full" id="districtId" {...register("districtId")} aria-invalid={!!errors.districtId}>
              <option value="">Choose a district</option>
              {options.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Place (optional)" htmlFor="locationText" error={errors.locationText?.message} hint="Adding a place puts the report on the Explore map.">
          <Controller control={control} name="locationText" render={({ field }) => (
            <PlaceInput
              id="locationText"
              value={field.value ?? ""}
              popular={popularPlaces}
              placeholder="Town, locality or landmark"
              onChange={(text, pick) => {
                field.onChange(text);
                setValue("placeId", pick?.placeId);
                setValue("geo", pick?.geo);
              }}
            />
          )} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date it happened" htmlFor="incidentDate" error={errors.incidentDate?.message}>
            <Input id="incidentDate" type="date" max={today()} {...register("incidentDate")} className="h-10" />
          </Field>
          <Field label="Amount paid (Rs)" htmlFor="amountInr" error={errors.amountInr?.message}>
            <Input id="amountInr" type="number" inputMode="numeric" min={1} {...register("amountInr", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} className="h-10" placeholder="Optional" />
          </Field>
          <Field label="Website or link" htmlFor="reportedUrl" error={errors.reportedUrl?.message}>
            <Input id="reportedUrl" {...register("reportedUrl")} className="h-10 font-mono text-[13px]" placeholder="Optional" autoComplete="off" />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-1 text-sm font-medium">Evidence</legend>
          <div {...getRootProps()} className={cn("flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-soft p-4 text-center text-sm text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50", isDragActive && "border-foreground bg-muted", uploading && "pointer-events-none opacity-60")}>
            <input {...getInputProps()} aria-label="Screenshots to attach" data-testid="report-upload" />
            {uploading ? <span className="flex items-center gap-2"><Spinner />Uploading…</span> : <><ImageUpIcon className="size-4" aria-hidden /><span>{isDragActive ? "Drop the images here" : "Drop screenshots here, or click to choose"}</span></>}
          </div>
          {uploadError ? <p role="alert" className="text-[13px] text-danger">{uploadError}</p> : null}
          {attachable.length ? (
            <>
              <p className="text-[13px] text-muted-foreground">Or pick from your Evidence vault. Only you and moderators can open attachments.</p>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-label="Your evidence">
                {attachable.map((e) => {
                  const on = selected.includes(e.id);
                  return (
                    <li key={e.id}>
                      <label className="group relative block cursor-pointer overflow-hidden rounded-lg border">
                        <input type="checkbox" checked={on} onChange={() => toggle(e.id)} className="peer sr-only" aria-label={`Attach ${e.title}`} data-evidence={e.id} />
                        <span className="block aspect-[4/3] bg-muted">
                          {e.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.thumbnail} alt="" className="size-full object-cover object-top" />
                          ) : null}
                        </span>
                        <span className="block truncate px-2 py-1.5 text-xs">{e.title}</span>
                        <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-transparent peer-checked:ring-foreground peer-focus-visible:ring-ring" aria-hidden />
                        <span className="pointer-events-none absolute top-1.5 right-1.5 hidden size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background peer-checked:flex" aria-hidden>✓</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {errors.evidenceIds?.message ? <p role="alert" className="text-[13px] text-danger">{errors.evidenceIds.message}</p> : null}
        </fieldset>

        <Controller control={control} name="isAnonymous" render={({ field }) => (
          <label className="flex items-center justify-between gap-4 rounded-lg border bg-soft px-4 py-3 text-sm">
            <span className="flex flex-col"><span className="font-medium">Show my name on this report</span><span className="text-[13px] text-muted-foreground">{field.value ? "Your name is never shown publicly." : "Your first name will be shown next to the report."}</span></span>
            <Switch checked={!field.value} onCheckedChange={(on) => field.onChange(!on)} aria-label="Show my name on this report" />
          </label>
        )} />

        {formError ? <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p> : null}

        <div className="flex items-center justify-end">
          <Button type="submit" className="h-10 px-5" disabled={isSubmitting}>
            {isSubmitting ? <><Spinner data-icon="inline-start" />Submitting report…</> : "Submit report"}
          </Button>
        </div>
      </form>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="flex gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-warning">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-0.5 text-[13px]">
            <span className="font-semibold">For urgent fraud</span>
            <span className="text-warning/90">Call 1930 or use cybercrime.gov.in. This form does not replace an official complaint.</span>
          </div>
        </div>
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 shadow-xs">
          <h2 className="text-[15px] font-semibold">What happens next</h2>
          <p className="text-sm text-muted-foreground">Your report is checked, matched with similar ones and queued for a moderator. You get a reference and can follow updates. Until a moderator reviews it, it is shown as unverified.</p>
        </section>
        {p ? <section className="rounded-xl border bg-card p-5 text-sm shadow-xs"><span className="font-medium">Started from an investigation.</span> <span className="text-muted-foreground">We filled in what we already know and attached its screenshots. Check it before you send.</span></section> : null}
      </aside>
    </div>
  );
}
