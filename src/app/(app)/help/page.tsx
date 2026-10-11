import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Help and support" };

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Help and support" description="Guides, contacts and emergency numbers." />
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-xs sm:max-w-xl" aria-label="For businesses">
        <h2 className="text-[15px] font-semibold">For businesses</h2>
        <p className="text-sm text-muted-foreground">Run a stay, taxi service, guide service or tour? Ask for it to be listed in the directory. A moderator checks the details before it appears.</p>
        <Button variant="outline" className="w-fit shadow-xs" nativeButton={false} render={<Link href="/directory/request" />}>Request a listing</Button>
      </section>
    </div>
  );
}
