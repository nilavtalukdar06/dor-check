import { DownloadIcon, ExternalLinkIcon, FileIcon, AudioWaveformIcon } from "lucide-react";
import { DeleteEvidenceButton } from "@/components/evidence/delete-evidence-button";
import type { EvidenceKind } from "@/components/investigation/evidence-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, type EvidenceParams } from "@/lib/evidence";
import type { EvidenceDetail } from "@/server/evidence";

const KIND_LABEL: Record<EvidenceDetail["kind"], string> = { SCREENSHOT: "Screenshot", EXTRACT: "Extract", UPLOAD: "Upload", AUDIO: "Audio", DOCUMENT: "Document" };
const BY_LABEL: Record<string, string> = { browserbase: "Browserbase browser", firecrawl: "Firecrawl", user: "You (uploaded)", sarvam: "Sarvam" };

/** Full timestamp in Indian time: "10 Oct 2026, 10:41:19 IST". */
const fullStamp = (d: Date) =>
  `${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(d)} IST`;

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** The drawer body: preview, where and when the item was captured, and what it is attached to. */
export function EvidenceDetailView({ e, params }: { e: EvidenceDetail; params: Pick<EvidenceParams, "type" | "q" | "capture"> }) {
  const file = `/api/evidence/${e.id}/file`;
  const kind = e.kind.toLowerCase() as EvidenceKind;
  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1 pr-8">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{e.title}</h2>
          <Badge variant="info" data-kind={kind}>{KIND_LABEL[e.kind]}</Badge>
        </div>
        {e.subject ? <p className="text-sm text-muted-foreground">{e.subject}</p> : null}
      </div>

      {e.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.imageUrl} alt={e.title} width={e.width ?? undefined} height={e.height ?? undefined} className="w-full rounded-lg border bg-muted" data-testid="evidence-image" />
      ) : e.kind === "EXTRACT" && e.textContent ? (
        <pre className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed" data-testid="evidence-text">{prettyJson(e.textContent)}</pre>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          {e.kind === "AUDIO" ? <AudioWaveformIcon className="size-6" /> : <FileIcon className="size-6" />}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-9 gap-2 shadow-xs" nativeButton={false} render={<a href={file} target="_blank" rel="noopener noreferrer" />}>
          <ExternalLinkIcon data-icon="inline-start" />
          Open file
        </Button>
        <Button variant="outline" className="h-9 gap-2 shadow-xs" nativeButton={false} render={<a href={`${file}?download=1`} />}>
          <DownloadIcon data-icon="inline-start" />
          Download
        </Button>
        <DeleteEvidenceButton id={e.id} params={params} citedByReports={e.reportCount > 0} />
      </div>

      <dl className="divide-y rounded-xl border bg-card px-4 shadow-xs">
        {e.url ? (
          <Row label="Source page">
            <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">{e.url}</a>
          </Row>
        ) : null}
        <Row label="Captured"><time dateTime={e.capturedAt.toISOString()} className="font-mono text-[13px]">{fullStamp(e.capturedAt)}</time></Row>
        <Row label="Captured by">{BY_LABEL[e.capturedBy] ?? e.capturedBy}</Row>
        <Row label="File">
          {e.mimeType} · {formatBytes(e.sizeBytes)}
          {e.width && e.height ? ` · ${e.width} × ${e.height}` : ""}
        </Row>
        {e.sha256 ? (
          <Row label="SHA-256">
            <span className="font-mono text-xs break-all" title="A fingerprint of the file: if the file changes, this changes">{e.sha256}</span>
          </Row>
        ) : null}
        {e.browserSessionId ? <Row label="Browser session"><span className="font-mono text-xs">{e.browserSessionId}</span></Row> : null}
        {e.investigation ? <Row label="Investigation">{e.investigation.title}</Row> : null}
        <Row label="Used in">{e.reportCount === 0 ? "No reports yet" : `${e.reportCount} ${e.reportCount === 1 ? "report" : "reports"}`}</Row>
      </dl>
    </div>
  );
}
