import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LiveBrowser } from "@/components/investigation/live-browser";
import { LoadingState } from "@/components/shell/loading";
import { hostOf } from "@/lib/research-policy";
import prisma from "@/lib/prisma";
import { keyFromRef, signedUrl } from "@/server/storage";
import { getCurrentUser } from "@/server/users";
import { AutoRefresh } from "./auto-refresh";
import { CaptureForm } from "./capture-form";

export const metadata = { title: "Capture check" };

async function View({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { id } = await searchParams;
  const invId = typeof id === "string" ? id : null;

  const inv = invId
    ? await prisma.investigation.findFirst({
        where: { id: invId, userId: user.id },
        include: {
          evidence: { orderBy: { capturedAt: "asc" } },
          workflowRuns: { orderBy: { createdAt: "desc" }, take: 1, include: { events: { orderBy: { id: "asc" } } } },
        },
      })
    : null;

  const run = inv?.workflowRuns[0];
  const running = inv?.status === "RUNNING";
  const evidence = inv
    ? await Promise.all(
        inv.evidence.map(async (e) => {
          const key = keyFromRef(e.storageUrl);
          return { ...e, link: key ? await signedUrl(key) : null };
        }),
      )
    : [];

  return (
    <>
      <CaptureForm />
      {inv ? (
        <section className="flex flex-col gap-4" aria-label="Capture result">
          {running ? <AutoRefresh /> : null}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{inv.title}</h2>
            <span className="rounded-full border px-2.5 py-0.5 text-xs" data-testid="status">{inv.status}</span>
          </div>
          {running ? <LiveBrowser investigationId={inv.id} host={hostOf(inv.input)} /> : null}
          {inv.error ? <p className="text-sm text-danger" role="alert">{inv.error}</p> : null}
          <ul className="flex flex-col gap-1 font-mono text-xs text-muted-foreground" aria-label="Run events">
            {run?.events.map((e) => (
              <li key={e.id}>{e.type}: {e.message}</li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-2">
            {evidence.map((e) => (
              <figure key={e.id} className="flex flex-col gap-2 rounded-xl border p-3" data-kind={e.kind}>
                <figcaption className="text-sm font-medium">{e.title} <span className="text-xs text-muted-foreground">· {e.kind} · {e.capturedAt.toISOString()} · {e.capturedBy}</span></figcaption>
                {e.kind === "SCREENSHOT" && e.link ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.link} alt={e.title} width={e.width ?? 1280} height={e.height ?? 800} className="w-full rounded-lg border" />
                ) : (
                  <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs">{e.textContent}</pre>
                )}
              </figure>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export default function CapturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Capture check</h1>
      <p className="text-muted-foreground">
        Opens a page in a remote browser, watches it live, saves a screenshot to R2 and reads what the page says. The browser only
        reads: it never types, clicks or submits.
      </p>
      <Suspense fallback={<LoadingState text="Loading…" />}>
        <View searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
