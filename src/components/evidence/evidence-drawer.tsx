"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { evidenceHref, type EvidenceParams } from "@/lib/evidence";

/**
 * Drawer driven by the URL (?item=id): refreshing keeps it open, closing removes the
 * parameter. The details are rendered on the server and passed in as children.
 */
export function EvidenceDrawer({
  title,
  params,
  children,
}: {
  title: string;
  params: Pick<EvidenceParams, "type" | "q" | "capture">;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.replace(evidenceHref(params), { scroll: false });
      }}
    >
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Details, source and timestamp for {title}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
