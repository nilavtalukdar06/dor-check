import {
  AudioLinesIcon,
  BuildingIcon,
  DatabaseIcon,
  FlagIcon,
  HeadsetIcon,
  HouseIcon,
  ImageIcon,
  IndianRupeeIcon,
  MapIcon,
  MessageSquareIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Top bar title when it differs from the sidebar label. */
  pageTitle?: string;
  /** Key into the sidebar `counts` prop for the little count badge. */
  badge?: string;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

export const mainNav: NavGroup = {
  items: [
    { title: "Dashboard", href: "/dashboard", icon: HouseIcon },
    { title: "Investigate", href: "/investigate", icon: SearchIcon, pageTitle: "Investigations" },
    { title: "Price check", href: "/price", icon: IndianRupeeIcon },
    { title: "Assistant", href: "/assistant", icon: MessageSquareIcon },
    { title: "Voice", href: "/voice", icon: AudioLinesIcon, pageTitle: "Read aloud" },
    { title: "Explore map", href: "/map", icon: MapIcon },
    { title: "Community", href: "/reports", icon: FlagIcon, pageTitle: "Community reports", badge: "reports" },
    { title: "Directory", href: "/directory", icon: BuildingIcon, pageTitle: "Explore directory" },
    { title: "Evidence vault", href: "/evidence", icon: ImageIcon },
  ],
};

export const othersNav: NavGroup = {
  label: "Others",
  items: [
    { title: "Settings", href: "/settings", icon: SettingsIcon },
    { title: "Help and support", href: "/help", icon: HeadsetIcon },
  ],
};

export const moderatorNav: NavGroup = {
  label: "Moderator",
  items: [
    { title: "Moderation queue", href: "/moderation", icon: ShieldCheckIcon, badge: "moderation" },
    { title: "Workflow runs", href: "/workflows", icon: WorkflowIcon },
    { title: "Knowledge base", href: "/knowledge", icon: DatabaseIcon },
  ],
};

const allItems: NavItem[] = [
  ...mainNav.items,
  ...othersNav.items,
  ...moderatorNav.items,
  { title: "Plan and usage", href: "/settings/plan", icon: SettingsIcon },
];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Longest matching href wins, so /settings/plan beats /settings. */
export function pageTitleFor(pathname: string) {
  let best: NavItem | undefined;
  for (const item of allItems) {
    if (
      isActivePath(pathname, item.href) &&
      (!best || item.href.length > best.href.length)
    ) {
      best = item;
    }
  }
  return best ? (best.pageTitle ?? best.title) : "Trap Detector";
}
