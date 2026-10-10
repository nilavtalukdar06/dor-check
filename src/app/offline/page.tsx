import { WifiOffIcon } from "lucide-react";
import { RetryButton } from "@/components/pwa/retry-button";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border bg-soft">
        <WifiOffIcon className="size-5 text-muted-foreground" />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">You are offline</h1>
        <p className="text-muted-foreground">
          Checks, price comparisons and reports need a connection. Reconnect and try again.
        </p>
      </div>
      <RetryButton />
      <div className="max-w-sm rounded-xl border border-danger-border bg-danger-soft p-4 text-sm">
        <p className="font-medium text-danger">Already paid a scammer?</p>
        <p className="mt-1 text-foreground/80">
          Call <a className="font-medium underline" href="tel:1930">1930</a> or report at
          cybercrime.gov.in as soon as you have signal.
        </p>
      </div>
    </main>
  );
}
