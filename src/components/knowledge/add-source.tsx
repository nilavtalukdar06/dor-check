"use client";

import { PlusIcon } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { addSourceAction, type AddSourceState } from "@/app/(app)/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";

/** Add a public page (an advisory, a tariff sheet, a list of registered businesses) to the knowledge base. */
export function AddSource() {
  const [state, action, pending] = useActionState<AddSourceState, FormData>(addSourceAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <section aria-label="Add a source" className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs">
      <div>
        <h2 className="text-[15px] font-semibold">Add a source</h2>
        <p className="text-[13px] text-muted-foreground">A public page to read and index, such as a tourism advisory or a tariff sheet. It is read now and on each re-sync.</p>
      </div>
      <form ref={form} action={action} className="grid gap-3 sm:grid-cols-[1fr_10rem]" data-testid="add-source">
        <label className="flex flex-col gap-1 text-sm">Name
          <Input name="name" maxLength={80} placeholder="Meghalaya tourism advisories" className="h-9" aria-invalid={!!state?.fields?.name} />
          {state?.fields?.name ? <span className="text-xs text-danger">{state.fields.name}</span> : null}
        </label>
        <label className="flex flex-col gap-1 text-sm">Holds
          <NativeSelect name="type" className="w-full" defaultValue="ADVISORY">
            <option value="ADVISORY">Advisories</option>
            <option value="TARIFF">Tariffs</option>
            <option value="DIRECTORY">Businesses</option>
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">Web address
          <Input name="url" maxLength={500} placeholder="https://tourism.example/advisories" className="h-9 font-mono text-[13px]" aria-invalid={!!state?.fields?.url} />
          {state?.fields?.url ? <span className="text-xs text-danger">{state.fields.url}</span> : null}
        </label>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <span role="status" className="text-sm">{state?.ok ? <span className="text-ok">Added. It is being read now.</span> : state?.error ? <span className="text-danger">{state.error}</span> : null}</span>
          <Button type="submit" size="sm" disabled={pending} className="gap-1.5">{pending ? <Spinner /> : <PlusIcon className="size-4" aria-hidden />}Add source</Button>
        </div>
      </form>
    </section>
  );
}
