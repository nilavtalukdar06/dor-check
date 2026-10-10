import { CheckIcon, XIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { ToolChip } from "@/components/common/tool-chip";
import { cn } from "@/lib/utils";

export type StepStatus = "done" | "running" | "waiting" | "retrying" | "failed";

export type TimelineStep = {
  title: string;
  status: StepStatus;
  /** e.g. "0.4s"; falls back to the status label */
  duration?: string;
  events?: string[];
  tools?: string[];
};

function StepIcon({ status }: { status: StepStatus }) {
  const base = "flex size-5 shrink-0 items-center justify-center rounded-full border";
  if (status === "done")
    return (
      <span className={cn(base, "border-ok-border bg-ok-soft text-ok")}>
        <CheckIcon className="size-3" />
      </span>
    );
  if (status === "failed")
    return (
      <span className={cn(base, "border-danger-border bg-danger-soft text-danger")}>
        <XIcon className="size-3" />
      </span>
    );
  if (status === "running" || status === "retrying")
    return <Spinner className="size-5 text-info" />;
  return <span className={cn(base, "border-border bg-background")} />;
}

export function StepTimeline({
  steps,
  className,
}: {
  steps: TimelineStep[];
  className?: string;
}) {
  return (
    <ol data-slot="step-timeline" className={cn("flex flex-col gap-5", className)}>
      {steps.map((s) => (
        <li key={s.title} className="flex gap-3">
          <StepIcon status={s.status} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{s.title}</span>
              <span className="text-xs text-muted-foreground">
                {s.duration ?? s.status}
              </span>
            </div>
            {(s.events?.length || s.tools?.length) && (
              <div className="flex flex-wrap gap-1.5">
                {s.events?.map((e) => (
                  <ToolChip key={e} kind="event">
                    {e}
                  </ToolChip>
                ))}
                {s.tools?.map((t) => (
                  <ToolChip key={t}>{t}</ToolChip>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
