import {
  AudioWaveformIcon,
  FileIcon,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EvidenceKind = "screenshot" | "extract" | "upload" | "audio";

const KINDS: Record<EvidenceKind, { label: string; icon: LucideIcon }> = {
  screenshot: { label: "Screenshot", icon: ImageIcon },
  extract: { label: "Extract", icon: FileIcon },
  upload: { label: "Upload", icon: ImageIcon },
  audio: { label: "Audio", icon: AudioWaveformIcon },
};

export function EvidenceCard({
  title,
  subject,
  timestamp,
  kind,
  thumbnailUrl,
  className,
}: {
  title: string;
  subject: string;
  timestamp: string;
  kind: EvidenceKind;
  thumbnailUrl?: string;
  className?: string;
}) {
  const { label, icon: Icon } = KINDS[kind];
  return (
    <div
      data-slot="evidence-card"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs",
        className,
      )}
    >
      <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-b from-muted to-border/60 text-muted-foreground/70">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={title} className="size-full object-cover" />
        ) : (
          <Icon className="size-5" />
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="info">{label}</Badge>
        </div>
        <span className="text-[13px] text-muted-foreground">{subject}</span>
        <span className="font-mono text-xs text-muted-foreground">{timestamp}</span>
      </div>
    </div>
  );
}
