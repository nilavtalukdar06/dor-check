"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PRICE_SERVICES,
  QUALIFIER_LABELS,
  SERVICE_LABELS,
  UNIT_LABELS,
  VEHICLES,
  parseRupees,
  priceCheckSchema,
  type PriceCheckInput,
  type PriceService,
} from "@/lib/price-schema";
import { comparePriceAction } from "@/app/(app)/price/actions";
import type { PriceFormOptions } from "@/server/price-options";
import { emptyValues, type PriceFormValues } from "./form-values";
import { PlaceInput, type PlacePick } from "./place-input";
import { ResultSkeleton } from "./result-placeholders";

const blank = (s: string) => (s.trim() === "" ? undefined : s.trim());

function toPayload(v: PriceFormValues): Partial<PriceCheckInput> & { quotedInr: number } {
  const taxi = v.service === "TAXI";
  return {
    service: v.service,
    quotedInr: parseRupees(v.quoted),
    origin: taxi ? blank(v.origin) : undefined,
    originPlaceId: taxi ? blank(v.originPlaceId) : undefined,
    originGeo: taxi ? (v.originGeo ?? undefined) : undefined,
    destination: taxi ? blank(v.destination) : undefined,
    destinationPlaceId: taxi ? blank(v.destinationPlaceId) : undefined,
    destinationGeo: taxi ? (v.destinationGeo ?? undefined) : undefined,
    vehicle: taxi ? blank(v.vehicle) : undefined,
    location: !taxi ? blank(v.location) : undefined,
    locationPlaceId: !taxi ? blank(v.locationPlaceId) : undefined,
    locationGeo: !taxi ? (v.locationGeo ?? undefined) : undefined,
    qualifier: !taxi ? blank(v.qualifier) : undefined,
  };
}

const fieldOf: Record<string, keyof PriceFormValues> = {
  quotedInr: "quoted",
  district: "location",
  districtId: "location",
};

/** Validate with the same zod schema the server uses, mapped onto form fields. */
const resolver: Resolver<PriceFormValues> = async (values) => {
  const payload = toPayload(values);
  const quoteMissing = Number.isNaN(payload.quotedInr);
  // zod skips the cross-field checks (places, district) when the price is not a number,
  // so check the rest with a placeholder price and report the price separately.
  const parsed = priceCheckSchema.safeParse(quoteMissing ? { ...payload, quotedInr: 1 } : payload);
  const errors: Record<string, { type: string; message: string }> = {};
  if (quoteMissing) errors.quoted = { type: "validation", message: "Enter the quoted price in rupees" };
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      const field = fieldOf[key] ?? key;
      if (!errors[field]) errors[field] = { type: "validation", message: issue.message };
    }
  }
  return Object.keys(errors).length ? { values: {}, errors } : { values, errors: {} };
};

export function PriceCheckClient({
  options,
  defaults,
  currentId,
  children,
}: {
  options: PriceFormOptions;
  defaults?: Partial<PriceFormValues>;
  /** Id of the comparison currently shown, if any. */
  currentId: string | null;
  /** Server-rendered result column. */
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [actionPending, startTransition] = useTransition();
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<PriceFormValues>({
    defaultValues: { ...emptyValues, ...defaults },
    resolver,
  });
  const { control, handleSubmit, setValue, setError, formState } = form;
  const { errors } = formState;
  const service = useWatch({ control, name: "service" });
  const taxi = service === "TAXI";

  // Skeleton while the action runs and while the new result streams in.
  const pending = actionPending || (awaiting !== null && awaiting !== currentId);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const res = await comparePriceAction(toPayload(values) as PriceCheckInput);
      if (!res.ok) {
        setFormError(res.error);
        for (const [key, messages] of Object.entries(res.fieldErrors ?? {})) {
          setError(fieldOf[key] ?? (key as keyof PriceFormValues), { message: messages[0] });
        }
        return;
      }
      setAwaiting(res.id);
      router.push(`/price?check=${res.id}`, { scroll: false });
    });
  });

  const qualifiers = service === "TAXI" ? [] : options.qualifiers[service];
  const qualifierListId = useId();
  /** Keep the picked place's id or coordinates alongside the text; typing clears them. */
  const setPick = (prefix: "origin" | "destination" | "location") => (pick?: PlacePick) => {
    if (prefix === "origin") {
      setValue("originPlaceId", pick?.placeId ?? "");
      setValue("originGeo", pick?.geo ?? null);
    } else if (prefix === "destination") {
      setValue("destinationPlaceId", pick?.placeId ?? "");
      setValue("destinationGeo", pick?.geo ?? null);
    } else {
      setValue("locationPlaceId", pick?.placeId ?? "");
      setValue("locationGeo", pick?.geo ?? null);
    }
  };
  const quoteUnit = service === "STAY" ? UNIT_LABELS.PER_NIGHT : service === "GUIDE" ? UNIT_LABELS.PER_DAY : service === "TOUR" ? UNIT_LABELS.PER_PERSON : null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs">
        <Controller
          control={control}
          name="service"
          render={({ field }) => (
            <Tabs value={field.value} onValueChange={(v) => field.onChange(v as PriceService)}>
              <TabsList className="grid h-10 w-full grid-cols-4">
                {PRICE_SERVICES.map((s) => (
                  <TabsTrigger key={s} value={s}>
                    {SERVICE_LABELS[s]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        />

        {taxi ? (
          <>
            <Field data-invalid={!!errors.origin}>
              <FieldLabel htmlFor="origin">From</FieldLabel>
              <Controller
                control={control}
                name="origin"
                render={({ field }) => (
                  <PlaceInput
                    id="origin"
                    value={field.value}
                    popular={options.popularPlaces}
                    placeholder="Guwahati airport"
                    invalid={!!errors.origin}
                    onChange={(text, pick) => {
                      field.onChange(text);
                      setPick("origin")(pick);
                    }}
                  />
                )}
              />
              {errors.origin ? <FieldError>{errors.origin.message}</FieldError> : null}
            </Field>
            <Field data-invalid={!!errors.destination}>
              <FieldLabel htmlFor="destination">To</FieldLabel>
              <Controller
                control={control}
                name="destination"
                render={({ field }) => (
                  <PlaceInput
                    id="destination"
                    value={field.value}
                    popular={options.popularPlaces}
                    placeholder="Shillong, or any town"
                    invalid={!!errors.destination}
                    onChange={(text, pick) => {
                      field.onChange(text);
                      setPick("destination")(pick);
                    }}
                  />
                )}
              />
              {errors.destination ? <FieldError>{errors.destination.message}</FieldError> : null}
            </Field>
          </>
        ) : (
          <Field data-invalid={!!errors.location}>
            <FieldLabel htmlFor="location">Where</FieldLabel>
            <Controller
              control={control}
              name="location"
              render={({ field }) => (
                <PlaceInput
                  id="location"
                  value={field.value}
                  popular={options.popularPlaces}
                  placeholder="Cherrapunji, Ziro, Majuli…"
                  invalid={!!errors.location}
                  onChange={(text, pick) => {
                    field.onChange(text);
                    setPick("location")(pick);
                  }}
                />
              )}
            />
            {errors.location ? <FieldError>{errors.location.message}</FieldError> : null}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {taxi ? (
            <Field>
              <FieldLabel htmlFor="vehicle">Vehicle</FieldLabel>
              <Controller
                control={control}
                name="vehicle"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v ?? "")}
                    items={VEHICLES.map((v) => ({ value: v.value, label: v.label }))}
                  >
                    <SelectTrigger id="vehicle" className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {VEHICLES.map((v) => (
                          <SelectItem key={v.value} value={v.value}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="qualifier">{QUALIFIER_LABELS[service as Exclude<PriceService, "TAXI">]}</FieldLabel>
              <Controller
                control={control}
                name="qualifier"
                render={({ field }) => (
                  <>
                    <Input
                      id="qualifier"
                      list={qualifierListId}
                      placeholder={service === "STAY" ? "Standard room" : service === "GUIDE" ? "Half day" : "2 nights"}
                      className="h-10"
                      autoComplete="off"
                      {...field}
                    />
                    <datalist id={qualifierListId}>
                      {qualifiers.map((q) => (
                        <option key={q} value={q} />
                      ))}
                    </datalist>
                  </>
                )}
              />
            </Field>
          )}
          <Field data-invalid={!!errors.quoted}>
            <FieldLabel htmlFor="quoted">Quoted price{quoteUnit ? ` (${quoteUnit})` : ""}</FieldLabel>
            <Controller
              control={control}
              name="quoted"
              render={({ field }) => (
                <Input
                  id="quoted"
                  inputMode="numeric"
                  placeholder="Rs 4,800"
                  className="h-10"
                  aria-invalid={!!errors.quoted}
                  {...field}
                />
              )}
            />
            {errors.quoted ? <FieldError>{errors.quoted.message}</FieldError> : null}
          </Field>
        </div>

        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Comparing price…
            </>
          ) : (
            "Compare price"
          )}
        </Button>
      </form>

      <div aria-live="polite">{pending ? <ResultSkeleton /> : children}</div>
    </div>
  );
}
