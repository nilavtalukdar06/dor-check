"use client";

import { useState, useTransition } from "react";
import { Field, firstError, FormError } from "@/components/moderation/bits";
import { PinPicker } from "@/components/moderation/pin-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { PlaceSuggestion } from "@/server/geocoding";

export type PropertyFormValues = {
  name: string; type: string; districtId: string; description: string; address: string; domain: string; phone: string; email: string; businessUpi: string; registrationNumber: string; lat: number | null; lng: number | null;
};
export const EMPTY_PROPERTY: PropertyFormValues = { name: "", type: "STAY", districtId: "", description: "", address: "", domain: "", phone: "", email: "", businessUpi: "", registrationNumber: "", lat: null, lng: null };
type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** The business form, shared by moderators (add and edit) and businesses asking to be listed. */
export function PropertyForm({ initial, districts, popular, submitLabel, onSubmit, extra }: { initial: PropertyFormValues; districts: { id: string; name: string }[]; popular: PlaceSuggestion[]; submitLabel: string; onSubmit: (v: PropertyFormValues) => Promise<Result>; extra?: React.ReactNode }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof PropertyFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => firstError(errors, k);

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      data-testid="property-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          setErrors(undefined);
          const r = await onSubmit(v);
          if (!r.ok) {
            setError(r.error);
            setErrors(r.fieldErrors);
          }
        });
      }}
    >
      <Field label="Business name" htmlFor="p-name" error={err("name")}><Input id="p-name" value={v.name} onChange={set("name")} maxLength={120} className="h-10" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="p-type" error={err("type")}>
          <NativeSelect id="p-type" className="w-full" value={v.type} onChange={set("type")}>
            <option value="STAY">Stay</option><option value="TAXI">Taxi</option><option value="GUIDE">Guide</option><option value="TOUR">Tour</option>
          </NativeSelect>
        </Field>
        <Field label="District" htmlFor="p-district" error={err("districtId")}>
          <NativeSelect id="p-district" className="w-full" value={v.districtId} onChange={set("districtId")}>
            <option value="">Choose a district</option>
            {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Place on the map" htmlFor="p-pin" error={err("lat") ?? err("lng")}>
        <PinPicker id="p-pin" lat={v.lat} lng={v.lng} popular={popular} onChange={(pin) => setV((x) => ({ ...x, lat: pin?.lat ?? null, lng: pin?.lng ?? null }))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website" htmlFor="p-domain" error={err("domain")}><Input id="p-domain" value={v.domain} onChange={set("domain")} placeholder="example.com" className="h-10 font-mono text-[13px]" /></Field>
        <Field label="Business phone" htmlFor="p-phone" error={err("phone")}><Input id="p-phone" value={v.phone} onChange={set("phone")} inputMode="tel" className="h-10" /></Field>
        <Field label="Business UPI id" htmlFor="p-upi" error={err("businessUpi")}><Input id="p-upi" value={v.businessUpi} onChange={set("businessUpi")} placeholder="name@bank" className="h-10 font-mono text-[13px]" /></Field>
        <Field label="Email" htmlFor="p-email" error={err("email")}><Input id="p-email" type="email" value={v.email} onChange={set("email")} className="h-10" /></Field>
        <Field label="Registration number" htmlFor="p-reg" error={err("registrationNumber")}><Input id="p-reg" value={v.registrationNumber} onChange={set("registrationNumber")} className="h-10" /></Field>
        <Field label="Address" htmlFor="p-address" error={err("address")}><Input id="p-address" value={v.address} onChange={set("address")} className="h-10" /></Field>
      </div>
      <Field label="Short description" htmlFor="p-desc" error={err("description")}><Textarea id="p-desc" rows={3} maxLength={1000} value={v.description} onChange={set("description")} /></Field>
      {extra}
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="gap-2 self-end">{pending ? <Spinner /> : null}{submitLabel}</Button>
    </form>
  );
}

/** Form values to the server's input shape (empty strings mean "not given"). */
export const toPropertyInput = (v: PropertyFormValues) => ({ ...v, type: v.type as "STAY" | "TAXI" | "GUIDE" | "TOUR", lat: v.lat ?? undefined, lng: v.lng ?? undefined, tags: [] as string[] });
