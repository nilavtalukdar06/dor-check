"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** While a check on the dashboard is still running, re-read the page every few seconds so its step moves. */
export function RefreshWhileRunning({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
