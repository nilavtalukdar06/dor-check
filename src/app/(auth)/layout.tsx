import { Logo } from "@/components/shell/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-soft px-4 py-10">
      <Logo />
      {children}
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Results are signals backed by sources, not legal findings. For urgent
        fraud call 1930 or use cybercrime.gov.in.
      </p>
    </main>
  );
}
