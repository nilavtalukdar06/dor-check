"use client";

import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideResearchedAction, retireBenchmarkAction, saveBenchmarkAction, saveBoardAction } from "@/app/(app)/moderation/actions";
import { Field, firstError, FormError, SidePanel } from "@/components/moderation/bits";
import { PinPicker } from "@/components/moderation/pin-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { rs } from "@/lib/format";
import type { PlaceSuggestion } from "@/server/geocoding";

type Option = { id: string; name: string };
export type BoardItem = { id: string; name: string; districtId: string; districtName: string; lat: number; lng: number; notes: string | null; lastVerifiedAt: string | null; rangeCount: number; isDemo: boolean };
export type BenchmarkForm = { serviceType: "TAXI" | "STAY" | "GUIDE" | "TOUR"; originPlaceId: string; destinationPlaceId: string; vehicle: string; districtId: string; qualifier: string; unit: string; lowInr: string; highInr: string; boardId: string; sourceLabel: string; sourceUrl: string; effectiveOn: string; expiresOn: string };
export type TariffItem = { id: string; service: string; title: string; unit: string; lowInr: number; highInr: number; sourceLabel: string | null; board: string | null; effectiveOn: string; isDemo: boolean; edit: BenchmarkForm };
export type ResearchedItem = { id: string; service: string; title: string; unit: string; lowInr: number; highInr: number; sampleSize: number | null; researchedAt: string | null; sources: { url: string | null; title: string; quote: string | null; valueInr: number | null }[] };

const UNIT: Record<string, string> = { PER_TRIP: "per trip", PER_NIGHT: "per night", PER_DAY: "per day", PER_PERSON: "per person" };
const SERVICE: Record<string, string> = { TAXI: "Taxi", STAY: "Stay", GUIDE: "Guide", TOUR: "Tour" };
const today = () => new Date().toISOString().slice(0, 10);
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "–");
const EMPTY_RANGE: BenchmarkForm = { serviceType: "TAXI", originPlaceId: "", destinationPlaceId: "", vehicle: "SEDAN", districtId: "", qualifier: "", unit: "PER_TRIP", lowInr: "", highInr: "", boardId: "", sourceLabel: "Tariff sheet", sourceUrl: "", effectiveOn: today(), expiresOn: "" };

/** Researched ranges waiting for review, tariff boards, and curated fair-price ranges. */
export function TariffsAdmin({ researched, boards, curated, places, districts, popular }: { researched: ResearchedItem[]; boards: BoardItem[]; curated: TariffItem[]; places: Option[]; districts: Option[]; popular: PlaceSuggestion[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<(Partial<BoardItem> & { id?: string }) | null>(null);
  const [range, setRange] = useState<(BenchmarkForm & { id?: string }) | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That did not work.");
      router.refresh();
    });

  return (
    <div className="flex flex-col">
      {error ? <p role="alert" className="px-5 pb-2 text-sm text-danger">{error}</p> : null}

      <section className="border-t" aria-label="Researched ranges waiting for review" data-testid="researched">
        <h3 className="px-5 pt-4 pb-1 text-sm font-semibold">Researched ranges waiting for review</h3>
        <p className="px-5 pb-3 text-[13px] text-muted-foreground">Found by live web research from at least three sites. Already used at medium confidence; approve to keep, reject to stop using.</p>
        {researched.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul>
            {researched.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 border-t px-5 py-4" data-researched={b.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{b.title}</span>
                  <Badge variant="outline">{SERVICE[b.service] ?? b.service}</Badge>
                  <span className="text-sm">{rs(b.lowInr)} to {rs(b.highInr)} {UNIT[b.unit] ?? ""}</span>
                  <span className="text-xs text-muted-foreground">{b.sampleSize ?? b.sources.length} prices · researched {day(b.researchedAt)}</span>
                </div>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {b.sources.map((s, i) => (
                    <li key={i} className="flex gap-1.5">
                      {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 underline"><ExternalLinkIcon className="size-3" aria-hidden />{new URL(s.url).hostname.replace(/^www\./, "")}</a> : <span>{s.title}</span>}
                      {s.valueInr ? <span>· {rs(s.valueInr)}</span> : null}
                      {s.quote ? <span className="truncate">· “{s.quote}”</span> : null}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" disabled={pending} onClick={() => act(() => decideResearchedAction(b.id, true))}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => decideResearchedAction(b.id, false))}>Reject</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t" aria-label="Tariff boards" data-testid="boards">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h3 className="text-sm font-semibold">Tariff boards</h3>
            <p className="text-[13px] text-muted-foreground">Posted fare boards (airport, taxi stands). Each shows on the map and backs its ranges.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBoard({})} data-testid="add-board"><PlusIcon className="size-4" aria-hidden />Add board</Button>
        </div>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-5">Board</TableHead><TableHead>District</TableHead><TableHead>Ranges</TableHead><TableHead>Last checked</TableHead><TableHead className="pr-5"><span className="sr-only">Edit</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {boards.map((b) => (
                <TableRow key={b.id} data-board={b.id}>
                  <TableCell className="pl-5 font-medium">{b.name} {b.isDemo ? <Badge variant="outline">Demo</Badge> : null}</TableCell>
                  <TableCell>{b.districtName}</TableCell>
                  <TableCell>{b.rangeCount}</TableCell>
                  <TableCell>{day(b.lastVerifiedAt)}</TableCell>
                  <TableCell className="pr-5 text-right"><Button size="sm" variant="outline" onClick={() => setBoard(b)}>Edit</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="border-t" aria-label="Curated ranges" data-testid="curated">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h3 className="text-sm font-semibold">Fair-price ranges</h3>
            <p className="text-[13px] text-muted-foreground">Curated from boards and official sheets: the price check trusts these most.</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setRange({ ...EMPTY_RANGE })} data-testid="add-range"><PlusIcon className="size-4" aria-hidden />Add range</Button>
        </div>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-5">Route or item</TableHead><TableHead>Range</TableHead><TableHead>Source</TableHead><TableHead>From</TableHead><TableHead className="pr-5 text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {curated.map((t) => (
                <TableRow key={t.id} data-range={t.id}>
                  <TableCell className="pl-5"><span className="font-medium">{t.title}</span> <Badge variant="outline">{SERVICE[t.service] ?? t.service}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{rs(t.lowInr)} to {rs(t.highInr)} <span className="text-xs text-muted-foreground">{UNIT[t.unit] ?? ""}</span></TableCell>
                  <TableCell className="text-muted-foreground">{t.sourceLabel ?? "–"}{t.board ? ` · ${t.board}` : ""}</TableCell>
                  <TableCell className="whitespace-nowrap">{day(t.effectiveOn)}</TableCell>
                  <TableCell className="pr-5"><div className="flex justify-end gap-1.5"><Button size="sm" variant="outline" onClick={() => setRange(t.edit)}>Edit</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => retireBenchmarkAction(t.id))}>Retire</Button></div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <SidePanel open={!!board} onOpenChange={(o) => !o && setBoard(null)} title={board?.id ? `Edit ${board.name}` : "Add a tariff board"} description="Where the board stands, and when you last saw it.">
        {board ? <BoardForm key={board.id ?? "new"} initial={board} districts={districts} popular={popular} onDone={() => { setBoard(null); router.refresh(); }} /> : null}
      </SidePanel>
      <SidePanel open={!!range} onOpenChange={(o) => !o && setRange(null)} title={range?.id ? "Edit range" : "Add a fair-price range"} description="Write what the board or sheet says. Taxi ranges are per route and vehicle; the others per district and item." wide>
        {range ? <RangeForm key={range.id ?? "new"} initial={range} places={places} districts={districts} boards={boards} onDone={() => { setRange(null); router.refresh(); }} /> : null}
      </SidePanel>
    </div>
  );
}

function BoardForm({ initial, districts, popular, onDone }: { initial: Partial<BoardItem> & { id?: string }; districts: Option[]; popular: PlaceSuggestion[]; onDone: () => void }) {
  const [v, setV] = useState({ name: initial.name ?? "", districtId: initial.districtId ?? "", lat: initial.lat ?? null, lng: initial.lng ?? null, placeId: "", notes: initial.notes ?? "", lastVerifiedAt: initial.lastVerifiedAt?.slice(0, 10) ?? today() });
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-col gap-4" noValidate data-testid="board-form" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveBoardAction(initial.id ?? null, { ...v, lat: v.lat ?? Number.NaN, lng: v.lng ?? Number.NaN });
        if (r.ok) return onDone();
        setError(r.error);
        setErrors(r.fieldErrors);
      });
    }}>
      <Field label="Name" htmlFor="b-name" error={firstError(errors, "name")}><Input id="b-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Guwahati airport taxi counter" className="h-10" /></Field>
      <Field label="District" htmlFor="b-district" error={firstError(errors, "districtId")}>
        <NativeSelect id="b-district" className="w-full" value={v.districtId} onChange={(e) => setV({ ...v, districtId: e.target.value })}>
          <option value="">Choose a district</option>
          {districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Where it stands" htmlFor="b-pin" error={firstError(errors, "lat") ?? firstError(errors, "lng")}>
        <PinPicker id="b-pin" lat={v.lat} lng={v.lng} popular={popular} onChange={(p) => setV({ ...v, lat: p?.lat ?? null, lng: p?.lng ?? null, placeId: p?.placeId ?? "" })} />
      </Field>
      <Field label="Last checked" htmlFor="b-date"><Input id="b-date" type="date" max={today()} value={v.lastVerifiedAt} onChange={(e) => setV({ ...v, lastVerifiedAt: e.target.value })} className="h-10" /></Field>
      <Field label="Notes" htmlFor="b-notes"><Textarea id="b-notes" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={500} /></Field>
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="gap-2 self-end">{pending ? <Spinner /> : null}{initial.id ? "Save board" : "Add board"}</Button>
    </form>
  );
}

function RangeForm({ initial, places, districts, boards, onDone }: { initial: BenchmarkForm & { id?: string }; places: Option[]; districts: Option[]; boards: BoardItem[]; onDone: () => void }) {
  const [v, setV] = useState<BenchmarkForm>(initial);
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const taxi = v.serviceType === "TAXI";
  const set = (k: keyof BenchmarkForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => firstError(errors, k);
  return (
    <form className="flex flex-col gap-4" noValidate data-testid="range-form" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveBenchmarkAction(initial.id ?? null, { ...v, vehicle: (v.vehicle || undefined) as never, unit: v.unit as never, lowInr: v.lowInr as never, highInr: v.highInr as never });
        if (r.ok) return onDone();
        setError(r.error);
        setErrors(r.fieldErrors);
      });
    }}>
      <Field label="Service" htmlFor="r-service">
        <NativeSelect id="r-service" className="w-full" value={v.serviceType} onChange={(e) => setV({ ...v, serviceType: e.target.value as BenchmarkForm["serviceType"], unit: e.target.value === "TAXI" ? "PER_TRIP" : e.target.value === "STAY" ? "PER_NIGHT" : "PER_DAY" })}>
          {Object.entries(SERVICE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </NativeSelect>
      </Field>
      {taxi ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="From" htmlFor="r-origin" error={err("originPlaceId")}><NativeSelect id="r-origin" className="w-full" value={v.originPlaceId} onChange={set("originPlaceId")}><option value="">Choose</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
          <Field label="To" htmlFor="r-dest" error={err("destinationPlaceId")}><NativeSelect id="r-dest" className="w-full" value={v.destinationPlaceId} onChange={set("destinationPlaceId")}><option value="">Choose</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
          <Field label="Vehicle" htmlFor="r-vehicle" error={err("vehicle")}><NativeSelect id="r-vehicle" className="w-full" value={v.vehicle} onChange={set("vehicle")}>{["SEDAN", "SUV", "HATCHBACK", "VAN", "AUTO", "SHARED"].map((x) => <option key={x} value={x}>{x.charAt(0) + x.slice(1).toLowerCase()}</option>)}</NativeSelect></Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="District" htmlFor="r-district" error={err("districtId")}><NativeSelect id="r-district" className="w-full" value={v.districtId} onChange={set("districtId")}><option value="">Choose</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Field>
          <Field label={v.serviceType === "STAY" ? "Room type" : v.serviceType === "GUIDE" ? "Guide duration" : "Package"} htmlFor="r-qualifier" error={err("qualifier")}><Input id="r-qualifier" value={v.qualifier} onChange={set("qualifier")} placeholder={v.serviceType === "STAY" ? "Homestay double room" : v.serviceType === "GUIDE" ? "Full day" : "Two-day package"} className="h-10" /></Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Lowest fair (Rs)" htmlFor="r-low" error={err("lowInr")}><Input id="r-low" type="number" inputMode="numeric" min={1} value={v.lowInr} onChange={set("lowInr")} className="h-10" /></Field>
        <Field label="Highest fair (Rs)" htmlFor="r-high" error={err("highInr")}><Input id="r-high" type="number" inputMode="numeric" min={1} value={v.highInr} onChange={set("highInr")} className="h-10" /></Field>
        <Field label="Unit" htmlFor="r-unit"><NativeSelect id="r-unit" className="w-full" value={v.unit} onChange={set("unit")}>{Object.entries(UNIT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Source" htmlFor="r-source" error={err("sourceLabel")} hint="Shown with the result, e.g. Tariff sheet, Airport fare board."><Input id="r-source" value={v.sourceLabel} onChange={set("sourceLabel")} className="h-10" /></Field>
        <Field label="Board (optional)" htmlFor="r-board"><NativeSelect id="r-board" className="w-full" value={v.boardId} onChange={set("boardId")}><option value="">None</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</NativeSelect></Field>
        <Field label="Source link (optional)" htmlFor="r-url" error={err("sourceUrl")}><Input id="r-url" value={v.sourceUrl} onChange={set("sourceUrl")} placeholder="https://" className="h-10" /></Field>
        <Field label="In force from" htmlFor="r-from" error={err("effectiveOn")}><Input id="r-from" type="date" value={v.effectiveOn} onChange={set("effectiveOn")} className="h-10" /></Field>
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={pending} className="gap-2 self-end">{pending ? <Spinner /> : null}{initial.id ? "Save range" : "Add range"}</Button>
    </form>
  );
}
