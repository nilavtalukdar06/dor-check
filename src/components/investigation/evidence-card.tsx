import {
  AudioWaveformIcon,
  FileIcon,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EvidenceKind = "screenshot" | "extract" | "upload" | "audio" | "document";

const KINDS: Record<EvidenceKind, { label: string; icon: LucideIcon }> = {
  screenshot: { label: "Screenshot", icon: ImageIcon },
  extract: { label: "Extract", icon: FileIcon },
  upload: { label: "Upload", icon: ImageIcon },
  audio: { label: "Audio", icon: AudioWaveformIcon },
  document: { label: "Document", icon: FileIcon },
};

export function EvidenceCard({
  title,
  subject,
  timestamp,
  kind,
  thumbnailUrl,
  href,
  className,
}: {
  title: string;
  subject?: string | null;
  timestamp: string;
  kind: EvidenceKind;
  thumbnailUrl?: string | null;
  /** Makes the whole card a link (the vault opens the item in a drawer). */
  href?: string;
  className?: string;
}) {
  const { label, icon: Icon } = KINDS[kind];
  const classes = cn(
    "flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs",
    href && "outline-none transition-colors hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
    className,
  );
  const body = (
    <>
      <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-b from-muted to-border/60 text-muted-foreground/70">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={title} className="size-full object-cover object-top" />
        ) : (
          <Icon className="size-5" />
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          <Badge variant="info">{label}</Badge>
        </div>
        {subject ? <span className="truncate text-[13px] text-muted-foreground">{subject}</span> : null}
        <span className="font-mono text-xs text-muted-foreground">{timestamp}</span>
      </div>
    </>
  );
  return href ? (
    <Link href={href} scroll={false} data-slot="evidence-card" className={classes}>
      {body}
    </Link>
  ) : (
    <div data-slot="evidence-card" className={classes}>
      {body}
    </div>
  );
}
