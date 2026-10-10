import { notFound } from "next/navigation";
import { HelloButton } from "./hello-button";

export const metadata = { title: "Inngest check" };

export default function InngestDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Inngest check</h1>
      <p className="text-muted-foreground">
        Sends a <code className="font-mono text-sm">dev/hello.requested</code> event. The hello-world function runs two steps; watch it
        complete in the Inngest dev dashboard.
      </p>
      <HelloButton />
    </main>
  );
}
