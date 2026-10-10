import { Logo } from "@/components/shell/logo";

/** A shared verdict is read-only and needs no sign-in, so it has no app chrome. */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 bg-background px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <span className="rounded-full border bg-soft px-3 py-1 text-xs text-muted-foreground">Shared verdict · read only</span>
      </header>
      {children}
    </main>
  );
}
