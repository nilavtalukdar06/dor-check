import Link from "next/link";
import { Suspense } from "react";
import { LanguageTab } from "@/components/settings/language-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { PrivacyTab } from "@/components/settings/privacy-tab";
import { ProfileTab } from "@/components/settings/profile-tab";
import { LoadingState } from "@/components/shell/loading";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import prisma from "@/lib/prisma";
import { clampSettings, VOICES, type VoiceLanguage } from "@/lib/voice";
import { voiceLanguageOf } from "@/lib/settings";
import { getRole } from "@/server/roles";
import { getPreferences } from "@/server/settings";
import { getCurrentUser } from "@/server/users";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "language", label: "Language and voice" },
  { value: "notifications", label: "Notifications" },
  { value: "privacy", label: "Privacy" },
] as const;
type Tab = (typeof TABS)[number]["value"];

async function Body({ searchParams }: Pick<PageProps<"/settings">, "searchParams">) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.value === sp.tab)?.value ?? "profile") as Tab;
  const user = await getCurrentUser();
  if (!user) return null;
  const [prefs, districts, role] = await Promise.all([getPreferences(user.id), prisma.district.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), getRole()]);
  const s = clampSettings({ pace: prefs.speechPace, stability: prefs.speechStability, similarity: prefs.speechSimilarity });
  const lang: VoiceLanguage = voiceLanguageOf(prefs.language);
  return (
    <>
      <nav aria-label="Settings" className="flex gap-6 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link key={t.value} href={`/settings?tab=${t.value}`} replace scroll={false} aria-current={tab === t.value ? "page" : undefined} data-tab={t.value} className={cn("-mb-px shrink-0 border-b-2 px-0.5 pb-3 text-sm outline-none focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50", tab === t.value ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>
        ))}
      </nav>
      {tab === "profile" ? <ProfileTab name={user.name ?? user.email ?? "You"} email={user.email} imageUrl={user.imageUrl} displayName={user.displayName ?? (user.name ?? "").split(/\s+/)[0] ?? ""} homeDistrictId={prefs.homeDistrictId} districts={districts} /> : null}
      {tab === "language" ? <LanguageTab initial={{ language: prefs.language, defaultVoice: VOICES[lang].some((v) => v.id === prefs.defaultVoice) ? prefs.defaultVoice : VOICES[lang][0].id, speechPace: s.pace, speechStability: s.stability, speechSimilarity: s.similarity, autoReadVerdicts: prefs.autoReadVerdicts }} /> : null}
      {tab === "notifications" ? <NotificationsTab initial={{ notifyRunAlerts: prefs.notifyRunAlerts, notifyReportUpdates: prefs.notifyReportUpdates, notifyModeration: prefs.notifyModeration }} moderator={role !== "TRAVELLER"} /> : null}
      {tab === "privacy" ? <PrivacyTab reportsAnonymous={prefs.reportsAnonymous} /> : null}
    </>
  );
}

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Account, language, voice and notification preferences." />
      <Suspense fallback={<div className="flex flex-col gap-4"><LoadingState text="Loading your settings…" /><Skeleton className="h-64 rounded-xl" /></div>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
