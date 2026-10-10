"use client";

import { useEffect } from "react";
import { captureInstallPrompt, clearInstallPrompt } from "./install-store";

/**
 * A worker left over from testing a production build on this origin would keep
 * serving old files while `next dev` changes them. Remove it, and its caches, once.
 */
async function removeDevServiceWorker() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const keys = (await caches.keys()).filter((k) => k.startsWith("ttd-"));
    await Promise.all([...registrations.map((r) => r.unregister()), ...keys.map((k) => caches.delete(k))]);
    if (registrations.length > 0 && navigator.serviceWorker.controller) window.location.reload();
  } catch {
    // Storage can be blocked; nothing to clean up then.
  }
}

/** Registers the service worker (production only) and captures the install prompt. */
export function PwaRegister() {
  useEffect(() => {
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", clearInstallPrompt);

    if ("serviceWorker" in navigator) {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
          .catch((err) => console.error("Service worker registration failed", err));
      } else {
        void removeDevServiceWorker();
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", clearInstallPrompt);
    };
  }, []);

  return null;
}
