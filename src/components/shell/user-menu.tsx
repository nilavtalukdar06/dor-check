"use client";

import { useClerk } from "@clerk/nextjs";
import { ChevronDownIcon, DownloadIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useInstallPrompt } from "@/components/pwa/use-install-prompt";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const { signOut } = useClerk();
  const { canInstall, install } = useInstallPrompt();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-10 w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 text-left text-sm font-medium shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Avatar className="size-6">
          {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
          <AvatarFallback className="bg-purple-600 text-xs font-semibold text-white">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 truncate">{name}</span>
        <ChevronDownIcon className="size-4 text-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" className="w-(--anchor-width) min-w-52">
        <DropdownMenuItem render={<Link href="/settings" />}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        {canInstall ? (
          <DropdownMenuItem onClick={install}>
            <DownloadIcon />
            Install app
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/sign-in" })}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
