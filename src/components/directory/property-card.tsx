import { CheckIcon, EyeIcon } from "lucide-react";
import Link from "next/link";
import { Orb, orbToneFromId } from "@/components/common/orb";
import { Badge } from "@/components/ui/badge";
import { TYPE_LABEL } from "@/lib/directory";
import type { DirectoryItem } from "@/server/directory-queries";

/** A directory card: gradient orb, name, "Stay · District" and a Verified or Listed badge. */
export function PropertyCard({ item, href }: { item: DirectoryItem; href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={`${item.name}, ${item.verified ? "verified" : "listed"} ${TYPE_LABEL[item.type]?.toLowerCase()} in ${item.districtName}. Open details`}
      className="group flex overflow-hidden rounded-xl border bg-card shadow-xs outline-none transition-shadow hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex w-16 shrink-0 items-center justify-center border-r bg-soft">
        <Orb tone={orbToneFromId(item.id)} className="size-10" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {TYPE_LABEL[item.type] ?? item.type} · {item.districtName}
          </span>
          <span>
            {item.verified ? (
              <Badge variant="ok">
                <CheckIcon data-icon="inline-start" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline">Listed</Badge>
            )}
          </span>
        </span>
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-foreground/80 shadow-xs group-hover:bg-muted">
          <EyeIcon className="size-4" />
        </span>
      </span>
    </Link>
  );
}
