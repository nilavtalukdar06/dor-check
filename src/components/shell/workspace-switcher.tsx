"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Only one workspace ("My trips") exists today; the menu is the future hook. */
export function WorkspaceSwitcher({ name = "My trips" }: { name?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-10 w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 text-left text-sm font-medium shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="flex size-6 items-center justify-center rounded-md bg-indigo-500 text-xs font-semibold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 truncate">{name}</span>
        <ChevronDownIcon className="size-4 text-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--anchor-width) min-w-52">
        <DropdownMenuItem>
          <CheckIcon />
          {name}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
