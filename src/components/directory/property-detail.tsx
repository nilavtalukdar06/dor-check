import { CheckIcon, ExternalLinkIcon, FlagIcon, GaugeIcon } from "lucide-react";
import Link from "next/link";
import { Orb, orbToneFromId } from "@/components/common/orb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TYPE_LABEL } from "@/lib/directory";
import { shortDate } from "@/lib/map";
import type { PropertyDetail } from "@/server/directory-queries";

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  UNDER_REVIEW: "Under review",
  VERIFIED: "Verified",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REJECTED: "Rejected",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** Server-rendered body of the drawer. */
export function PropertyDetailView({ p, priceHref }: { p: PropertyDetail; priceHref: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-start gap-4 border-b bg-soft px-6 py-6">
        <Orb tone={orbToneFromId(p.id)} className="size-12" />
        <div className="flex min-w-0 flex-col gap-1.5 pr-8">
          <h2 className="text-lg leading-6 font-semibold tracking-tight">{p.name}</h2>
          <p className="text-sm text-muted-foreground">
            {TYPE_LABEL[p.type] ?? p.type} · {p.districtName}, {p.stateName}
          </p>
          <div>
            {p.verified ? (
              <Badge variant="ok">
                <CheckIcon data-icon="inline-start" />
                Verified{p.verifiedAt ? ` ${shortDate(p.verifiedAt)}` : ""}
              </Badge>
            ) : (
              <Badge variant="outline">Listed, not verified</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6">
        {p.description ? <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p> : null}

        <dl className="grid gap-4">
          {p.address ? <Row label="Address">{p.address}</Row> : null}
          {p.phone ? (
            <Row label="Phone (business)">
              <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="underline underline-offset-2">
                {p.phone}
              </a>
            </Row>
          ) : null}
          {p.domain ? (
            <Row label="Website">
              <span className="inline-flex items-center gap-1 font-mono text-[13px]">
                {p.domain}
                <ExternalLinkIcon className="size-3 text-muted-foreground" aria-hidden />
              </span>
            </Row>
          ) : null}
          {p.businessUpi ? <Row label="Business UPI">{p.businessUpi}</Row> : null}
          {p.email ? <Row label="Email">{p.email}</Row> : null}
          {p.registrationNumber ? <Row label="Registration">{p.registrationNumber}</Row> : null}
        </dl>

        {p.tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}

        <Button className="h-10 w-full gap-2" nativeButton={false} render={<Link href={priceHref} />}>
          <GaugeIcon data-icon="inline-start" />
          Check a price
        </Button>

        <Separator />

        <section aria-label="Community reports" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FlagIcon className="size-4" aria-hidden />
              Community reports
            </h3>
            <span className="text-xs text-muted-foreground">{p.reportCount}</span>
          </div>
          {p.reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports mention this place.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Reporter allegations. Not verified.</p>
              <ul className="flex flex-col divide-y rounded-lg border">
                {p.reports.map((r) => (
                  <li key={r.reference}>
                    <Link href={`/reports/${r.reference}`} className="flex flex-col gap-1 px-3.5 py-3 hover:bg-soft">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                        <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </span>
                      <span className="text-sm">{r.summary}</span>
                      <span className="text-xs text-muted-foreground">{shortDate(r.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
