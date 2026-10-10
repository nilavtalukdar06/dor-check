import { cn } from "@/lib/utils";
import { Orb, type OrbTone } from "./orb";

/** Dashboard quick-action card: gradient orb, title, caption. */
export function OrbCard({
  tone,
  title,
  description,
  className,
  ...props
}: {
  tone: OrbTone;
  title: string;
  description: string;
} & React.ComponentProps<"div">) {
  return (
    <div
      data-slot="orb-card"
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs transition-colors hover:bg-soft",
        className,
      )}
      {...props}
    >
      <Orb tone={tone} />
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}
