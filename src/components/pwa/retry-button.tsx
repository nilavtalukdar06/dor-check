"use client";

import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RefreshCwIcon data-icon="inline-start" />
      Try again
    </Button>
  );
}
