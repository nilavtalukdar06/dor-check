"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" className="h-10 gap-2 shadow-xs" onClick={() => start(() => router.refresh())} disabled={pending} data-testid="refresh">
      <RefreshCwIcon className={cn("size-4", pending && "animate-spin")} aria-hidden />Refresh
    </Button>
  );
}
