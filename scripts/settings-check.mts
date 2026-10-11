// Phase 28 against the real database: saving preferences, notifications that respect the switches,
// usage counting (investigations, voice, storage) and the plan page's data. Cleans up after itself.
import prismaModule from "../src/lib/prisma";
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { reportInputSchema } from "../src/lib/reports";
import { changeReportStatus, createReport, toggleFollow } from "../src/server/reports";
import { notifyUsers } from "../src/server/notify";
import { getPlanPage, getPreferences, getUsageSummary, listNotifications, markAllRead, markRead, recordVoiceSeconds, saveDisplayName, savePreferences, unreadReportUpdates } from "../src/server/settings";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 400)}`);
  if (!ok) fails++;
};

async function main() {
  const stamp = Date.now();
  const mk = (tag: string, role: "TRAVELLER" | "MODERATOR" = "TRAVELLER") => prisma.user.create({ data: { clerkId: `set_${tag}_${stamp}`, email: `ttd-e2e-set-${tag}@example.com`, name: `Set ${tag}`, role } });
  const [sam, tess, mod] = [await mk("sam"), await mk("tess"), await mk("mod", "MODERATOR")];
  const ids = [sam.id, tess.id, mod.id];
  for (const u of [sam, tess, mod]) await prisma.workspace.create({ data: { ownerId: u.id, isPersonal: true } });
  const district = await prisma.district.findFirstOrThrow({ where: { name: "East Khasi Hills" } });

  try {
    const first = await getPreferences(sam.id);
    check("preferences are created with the defaults: auto language, alerts on, anonymous reports", first.language === "auto" && first.notifyRunAlerts && first.notifyReportUpdates && first.reportsAnonymous && !first.autoReadVerdicts && first.speechStability === 0.5 && first.speechSimilarity === 0.75, first);
    check("a preference can be saved", (await savePreferences(sam.id, { language: "as-IN", defaultVoice: "eBjbdlli9b8tJL1ng9Vx", speechPace: 1.1, autoReadVerdicts: true, homeDistrictId: district.id })).ok);
    const saved = await prisma.userPreference.findUniqueOrThrow({ where: { userId: sam.id } });
    check("it is stored", saved.language === "as-IN" && saved.defaultVoice === "eBjbdlli9b8tJL1ng9Vx" && saved.speechPace === 1.1 && saved.autoReadVerdicts && saved.homeDistrictId === district.id, saved);
    check("a language that is not offered is refused", !(await savePreferences(sam.id, { language: "fr-FR" as never })).ok);
    check("a pace outside the range is refused", !(await savePreferences(sam.id, { speechPace: 5 })).ok);
    check("a voice that is not ours is refused", !(await savePreferences(sam.id, { defaultVoice: "nope" })).ok);
    check("a district that does not exist is refused", !(await savePreferences(sam.id, { homeDistrictId: "nope" })).ok);
    check("someone else's preferences are untouched", (await getPreferences(tess.id)).language === "auto");
    check("a display name can be saved and trimmed", (await saveDisplayName(sam.id, "  Sam  ")).ok && (await prisma.user.findUniqueOrThrow({ where: { id: sam.id } })).displayName === "Sam");
    check("an empty or very long display name is refused", !(await saveDisplayName(sam.id, "  ")).ok && !(await saveDisplayName(sam.id, "x".repeat(60))).ok);

    // ---- Notifications respect the switches
    await savePreferences(tess.id, { notifyRunAlerts: false });
    const sent = await notifyUsers([
      { userId: sam.id, type: "run_completed", title: "Sam: run done" },
      { userId: tess.id, type: "run_completed", title: "Tess: run done" },
      { userId: tess.id, type: "report_status", title: "Tess: report moved" },
      { userId: tess.id, type: "system", title: "Tess: system note" },
    ]);
    const titles = (await prisma.notification.findMany({ where: { userId: { in: [sam.id, tess.id] } }, select: { title: true } })).map((n) => n.title).sort();
    check("a notification type switched off is not created; others are", sent === 3 && JSON.stringify(titles) === JSON.stringify(["Sam: run done", "Tess: report moved", "Tess: system note"]), { sent, titles });
    await savePreferences(mod.id, { notifyModeration: false });
    check("moderation alerts have their own switch", (await notifyUsers([{ userId: mod.id, type: "moderation_assigned", title: "Mod: needs review" }])) === 0);

    // ---- The bell
    const list = await listNotifications(tess.id);
    check("the bell lists notifications newest first with the unread count", list.unread === 2 && list.items.length === 2 && list.items.every((n) => !n.read), list);
    check("report updates are counted for the Community badge", (await unreadReportUpdates(tess.id)) === 1);
    await markRead(tess.id, list.items[0].id);
    check("one can be marked read, and only by its owner", (await listNotifications(tess.id)).unread === 1 && (await (async () => { await markRead(sam.id, list.items[1].id); return (await listNotifications(tess.id)).unread; })()) === 1);
    await markAllRead(tess.id);
    check("all can be marked read", (await listNotifications(tess.id)).unread === 0 && (await unreadReportUpdates(tess.id)) === 0);

    // ---- A followed report's update reaches the follower only if they left report updates on
    const rep = await createReport(sam, reportInputSchema.parse({ kind: "SCAM", category: "STAY", summary: "Settings test report for notifications", districtId: district.id, evidenceIds: [], isAnonymous: true, description: "Asked for an advance to a personal UPI id before the stay. The listing vanished." }));
    if (!rep.ok) throw new Error("no report");
    await toggleFollow(tess.id, rep.reference);
    await toggleFollow(sam.id, rep.reference).catch(() => undefined);
    await savePreferences(tess.id, { notifyReportUpdates: false });
    await changeReportStatus(rep.id, { id: mod.id, role: "MODERATOR" }, "UNDER_REVIEW", "Looking into it");
    check("a follower who switched report updates off is not notified of a status change", (await prisma.notification.count({ where: { userId: tess.id, type: "report_status", title: { contains: rep.reference } } })) === 0);
    await savePreferences(tess.id, { notifyReportUpdates: true });
    await changeReportStatus(rep.id, { id: mod.id, role: "MODERATOR" }, "VERIFIED", "Checked");
    check("and is notified once they switch it back on", (await prisma.notification.count({ where: { userId: tess.id, type: "report_status", title: { contains: rep.reference } } })) === 1);

    // ---- Usage and the plan page
    const empty = await getUsageSummary(sam.id, "TRAVELLER");
    check("a new person is on the Free plan with its limits and nothing used", empty.planTier === "FREE" && empty.investigations.limit === 5 && empty.voiceMinutes.limit === 15 && empty.storageMb.limit === 50 && empty.investigations.used === 0 && empty.voiceMinutes.used === 0 && empty.storageMb.used === 0, empty);
    await recordVoiceSeconds(sam.id, 125);
    await recordVoiceSeconds(sam.id, 40);
    check("voice seconds add up into minutes this month", (await getUsageSummary(sam.id, "TRAVELLER")).voiceMinutes.used === 3, await getUsageSummary(sam.id, "TRAVELLER"));
    await prisma.evidence.create({ data: { ownerId: sam.id, kind: "UPLOAD", title: "t", storageKey: "t/k", storageUrl: "r2:t/k", mimeType: "image/png", sizeBytes: 3 * 1024 * 1024, capturedBy: "user", sha256: `x${stamp}` } });
    check("evidence storage is counted in MB", (await getUsageSummary(sam.id, "TRAVELLER")).storageMb.used === 3);
    const staff = await getUsageSummary(mod.id, "MODERATOR");
    check("moderators have no limits", staff.investigations.limit === null && staff.voiceMinutes.limit === null && staff.storageMb.limit === null, staff);
    const plans = await getPlanPage(sam.id);
    check("the plan page has Free, Traveller and Group in order, Free current, and no invoices yet", plans.plans.map((p) => p.tier).join() === "FREE,TRAVELLER,GROUP" && plans.currentTier === "FREE" && plans.invoices.length === 0, plans.plans.map((p) => p.tier));
    const traveller = await prisma.plan.findUniqueOrThrow({ where: { tier: "TRAVELLER" } });
    await prisma.subscription.create({ data: { userId: sam.id, planId: traveller.id, status: "ACTIVE" } });
    await prisma.invoice.create({ data: { userId: sam.id, planId: traveller.id, amountInr: 199, status: "PAID", paidAt: new Date() } });
    const paid = await getUsageSummary(sam.id, "TRAVELLER");
    const page = await getPlanPage(sam.id);
    check("an active Traveller subscription changes the limits, the current plan and lists its invoice", paid.planTier === "TRAVELLER" && paid.investigations.limit === 50 && paid.voiceMinutes.limit === 60 && page.currentTier === "TRAVELLER" && page.invoices.length === 1 && page.invoices[0].amountInr === 199, { paid, page: page.currentTier });
  } finally {
    await prisma.invoice.deleteMany({ where: { userId: { in: ids } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
    const reports = await prisma.report.findMany({ where: { reporterId: { in: ids } }, select: { id: true } });
    const idents = await prisma.reportIdentifier.findMany({ where: { reportId: { in: reports.map((r) => r.id) } }, select: { identifierId: true } });
    await prisma.report.deleteMany({ where: { reporterId: { in: ids } } });
    await prisma.identifier.deleteMany({ where: { id: { in: idents.map((i) => i.identifierId) }, properties: { none: {} }, reports: { none: {} }, investigations: { none: {} } } });
    await prisma.moderationAction.deleteMany({ where: { moderatorId: { in: ids } } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: ids.map((i) => `report:${i}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    check("cleanup: nothing left behind", (await prisma.userPreference.count({ where: { userId: { in: ids } } })) === 0 && (await prisma.notification.count({ where: { userId: { in: ids } } })) === 0 && (await prisma.usageRecord.count({ where: { userId: { in: ids } } })) === 0);
  }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll settings checks passed");
    process.exit(fails ? 1 : 0);
  });
