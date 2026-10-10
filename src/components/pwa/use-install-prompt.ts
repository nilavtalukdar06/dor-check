"use client";

import { useSyncExternalStore } from "react";
import {
  canInstallServerSnapshot,
  canInstallSnapshot,
  promptInstall,
  subscribeInstall,
} from "./install-store";

export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    subscribeInstall,
    canInstallSnapshot,
    canInstallServerSnapshot,
  );
  return { canInstall, install: promptInstall };
}
