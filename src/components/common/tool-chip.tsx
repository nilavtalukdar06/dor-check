import { cn } from "@/lib/utils";

/** Monospace chip. `event` = blue run event, `tool` = grey tool call. */
export function ToolChip({
  kind = "tool",
  className,
  ...props
}: { kind?: "event" | "tool" } & React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tool-chip"
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 font-mono text-xs",
        kind === "event"
          ? "border-info-border bg-info-soft text-info"
          : "border-transparent bg-muted text-foreground/80",
        className,
      )}
      {...props}
    />
  );
}
