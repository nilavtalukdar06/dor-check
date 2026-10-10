// Holds the deferred `beforeinstallprompt` event so any component can offer
// an Install button. Module-level state is client-only; never import on the server.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function captureInstallPrompt(event: Event) {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
  emit();
}

export function clearInstallPrompt() {
  deferred = null;
  emit();
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const canInstallSnapshot = () => deferred !== null;
export const canInstallServerSnapshot = () => false;

export async function promptInstall() {
  if (!deferred) return;
  const event = deferred;
  deferred = null;
  emit();
  await event.prompt();
  await event.userChoice;
}
