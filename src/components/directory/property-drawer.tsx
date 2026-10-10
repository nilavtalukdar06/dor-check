"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { directoryHref, type DirectoryParams } from "@/lib/directory";

/**
 * Drawer driven by the URL (?property=slug): refreshing keeps it open, closing removes the
 * parameter. The details themselves are rendered on the server and passed in as children.
 */
export function PropertyDrawer({
  name,
  params,
  children,
}: {
  name: string;
  params: Pick<DirectoryParams, "type" | "q" | "verified">;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.replace(directoryHref(params), { scroll: false });
      }}
    >
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="sr-only">
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>Details and community reports for {name}</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
