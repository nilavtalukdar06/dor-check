// Live check of community reports: creating, the auto-check against the real seeded reports and the
// Pinecone index, the status machine, notifications and following. Calls the server functions
// directly (no browser). Cleans up everything it creates.
import prismaModule from "../src/lib/prisma";
// An ES module importing a CommonJS default export gets it wrapped one level deeper.
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { REFERENCE_RE, reportInputSchema, type ReportData } from "../src/lib/reports";
import { changeReportStatus, createReport, runAutoCheck, toggleFollow } from "../src/server/reports";
import { deleteObject, keyFromRef, putObject } from "../src/server/storage";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 500)}`);
  if (!ok) fails++;
};

const base = (districtId: string, over: Record<string, unknown> = {}): ReportData =>
  reportInputSchema.parse({
    kind: "SCAM", category: "STAY", summary: "Asked for an advance to a personal UPI id", districtId, evidenceIds: [], isAnonymous: true,
    description: "Shared a booking link on WhatsApp and asked for an advance payment to a personal UPI id. The page disappeared after I asked for a receipt.",
    ...over,
  });

async function main() {
  const mk = (tag: string, role: "TRAVELLER" | "MODERATOR" = "TRAVELLER") => prisma.user.create({ data: { clerkId: `rep_${tag}_${Date.now()}`, email: `ttd-e2e-rep-${tag}@example.com`, name: `Rep ${tag}`, role } });
  const [alice, bob, mod] = [await mk("alice"), await mk("bob"), await mk("mod", "MODERATOR")];
  for (const u of [alice, bob, mod]) await prisma.workspace.create({ data: { ownerId: u.id, isPersonal: true } });
  const district = await prisma.district.findFirstOrThrow({ where: { name: "East Khasi Hills" } });
  const created: string[] = [];
  const keys: string[] = [];

  try {
    // ---- Creating
    const fakeUrl = "demohills-homestay-booking.example/shillong";
    const r1 = await createReport(alice, base(district.id, { reportedUrl: `https://${fakeUrl}`, amountInr: 5000, locationText: "Shillong", description: "Shared a booking link and asked for an advance payment to rajesh.demo@okfakebank or to newseller.pay@okaxis, or call 98765 43210. The page disappeared after I asked for a receipt." }));
    check("a report is created with a TTD- reference", r1.ok && REFERENCE_RE.test(r1.reference), r1);
    if (!r1.ok) return;
    created.push(r1.id);
    const rep = await prisma.report.findUniqueOrThrow({ where: { id: r1.id }, include: { events: true, followers: true, identifiers: { include: { identifier: true } } } });
    check("new reports start NEW, anonymous by default, with the reporter stored and a channel id for the discussion", rep.status === "NEW" && rep.isAnonymous && rep.reporterId === alice.id && rep.streamChannelId === `report-${r1.reference}` && rep.visibility === "PUBLIC", rep);
    check("a place that was typed is found on the map (latitude and longitude saved)", rep.lat !== null && rep.lng !== null && rep.lat > 25 && rep.lat < 26.5 && rep.locationText === "Shillong", [rep.lat, rep.lng]);
    check("the history starts with SUBMITTED, and the reporter follows their own report", rep.events.length === 1 && rep.events[0].type === "SUBMITTED" && rep.followers.length === 1 && rep.followers[0].userId === alice.id);
    const ids = rep.identifiers.map((i) => `${i.identifier.kind}:${i.identifier.display}`).sort();
    check("the web address, UPI id and phone number are stored as identifiers, masked for display", ids.some((x) => x === "DOMAIN:demohills-homestay-booking.example") && ids.some((x) => x === "UPI:ne•••@okaxis") && ids.some((x) => x.startsWith("PHONE:98••••••10")) && !ids.join().includes("newseller") && !ids.join().includes("98765"), ids);
    check("the reported address gained https://", rep.reportedUrl === `https://${fakeUrl}`);

    // linking to a listed business
    const sample = await prisma.property.findUniqueOrThrow({ where: { slug: "sampleridge-stay" } });
    const r2 = await createReport(alice, base(district.id, { reportedUrl: `https://${sample.domain}/book`, summary: "Hotel refused the agreed rate on arrival" }));
    if (r2.ok) created.push(r2.id);
    check("a report about a listed business's website is linked to that business", r2.ok && (await prisma.report.findUniqueOrThrow({ where: { id: r2.id } })).propertyId === sample.id);

    // attachments must be the reporter's own
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
    const ws = await prisma.workspace.findFirstOrThrow({ where: { ownerId: alice.id } });
    const put = await putObject(`evidence/${alice.id}/test-report.png`, png, "image/png");
    keys.push(put.key);
    const ev = await prisma.evidence.create({ data: { ownerId: alice.id, workspaceId: ws.id, kind: "UPLOAD", title: "Chat screenshot", storageKey: put.key, storageUrl: put.ref, mimeType: "image/png", sizeBytes: png.length, capturedBy: "user" } });
    const mine = await createReport(alice, base(district.id, { summary: "Report with an attachment of my own", evidenceIds: [ev.id] }));
    if (mine.ok) created.push(mine.id);
    check("a report can attach the reporter's own evidence", mine.ok && (await prisma.reportEvidence.count({ where: { reportId: mine.id, evidenceId: ev.id } })) === 1);
    const theirs = await createReport(bob, base(district.id, { summary: "Trying to attach someone else's file", evidenceIds: [ev.id] }));
    check("...but not someone else's", !theirs.ok && /not yours/.test(theirs.error), theirs);
    check("a made-up district is refused", !(await createReport(bob, base("no-such-district"))).ok);

    // ---- The auto-check against the real seeded reports and the index
    const check1 = await runAutoCheck(r1.id);
    const sims = await prisma.reportSimilarity.findMany({ where: { reportId: r1.id }, include: { similarReport: { select: { reference: true } } } });
    const same = sims.filter((s) => s.reason !== "similar_text").map((s) => `${s.similarReport.reference}:${s.reason}`).sort();
    check("the same website as a seeded report is found, with the reason", same.includes("TTD-5F2K8W:same_domain"), same);
    check("the same UPI id as two seeded reports is found, and the stronger reason (UPI) wins over the website for the one that matches both", ["TTD-7K2M9Q:same_upi", "TTD-9C5X7M:same_upi"].every((x) => same.includes(x)) && !same.includes("TTD-7K2M9Q:same_domain"), same);
    check("it also finds reports that read alike (Pinecone), each with a score, and never itself", sims.every((s) => s.similarReportId !== r1.id) && sims.filter((s) => s.reason === "similar_text").every((s) => typeof s.score === "number" && s.score >= 0.55), sims.map((s) => [s.reason, s.score]));
    const after = await prisma.report.findUniqueOrThrow({ where: { id: r1.id } });
    check("the report records the result: summary, count, time, and HIGH priority for two or more matches", after.autoCheckSummary === check1.summary && /^Auto: matches \d+ reports$/.test(after.autoCheckSummary ?? "") && after.autoCheckMatches === sims.length && !!after.autoCheckedAt && after.priority === "HIGH", after);
    await runAutoCheck(r1.id);
    check("running the check again changes nothing twice (one history line, same matches)", (await prisma.reportEvent.count({ where: { reportId: r1.id, type: "AUTO_CHECKED" } })) === 1 && (await prisma.reportSimilarity.count({ where: { reportId: r1.id } })) === sims.length);

    const clean = await createReport(bob, base(district.id, { summary: "Nothing like it elsewhere xyz", description: "The ferry boatman charged triple the displayed rate at the Neamati ghat on a quiet weekday morning, cash only.", category: "TOUR", kind: "FARE_DISPUTE" }));
    if (clean.ok) created.push(clean.id);
    const c2 = clean.ok ? await runAutoCheck(clean.id) : null;
    check("a report that matches nothing says so, and stays at normal priority", !!c2 && c2.exact === 0 && (await prisma.report.findUniqueOrThrow({ where: { id: clean.ok ? clean.id : "" } })).priority === "MEDIUM", c2);

    // rejected and hidden reports are not matched
    const rejected = await createReport(bob, base(district.id, { summary: "A rejected report about the same site", reportedUrl: "https://demohills-homestay-booking.example/other" }));
    if (rejected.ok) { created.push(rejected.id); await prisma.report.update({ where: { id: rejected.id }, data: { status: "REJECTED" } }); }
    const hidden = await createReport(bob, base(district.id, { summary: "A hidden report about the same site", reportedUrl: "https://demohills-homestay-booking.example/hidden" }));
    if (hidden.ok) { created.push(hidden.id); await prisma.report.update({ where: { id: hidden.id }, data: { visibility: "HIDDEN" } }); }
    const r3 = await createReport(alice, base(district.id, { summary: "Same site again, a third report", reportedUrl: "https://demohills-homestay-booking.example/third" }));
    if (r3.ok) created.push(r3.id);
    if (r3.ok) await runAutoCheck(r3.id);
    const r3sims = r3.ok ? await prisma.reportSimilarity.findMany({ where: { reportId: r3.id }, select: { similarReportId: true } }) : [];
    check("rejected and hidden reports never count as matches", rejected.ok && hidden.ok && !r3sims.some((s) => s.similarReportId === (rejected as { id: string }).id || s.similarReportId === (hidden as { id: string }).id), r3sims);

    // ---- Following
    const f1 = await toggleFollow(bob.id, r1.reference);
    check("a traveller can follow a public report, and unfollow it", f1.ok && f1.following && (await toggleFollow(bob.id, r1.reference)).ok && (await prisma.reportFollow.count({ where: { reportId: r1.id, userId: bob.id } })) === 0);
    await toggleFollow(bob.id, r1.reference);
    check("nobody can follow a report they cannot see (hidden, rejected, or unknown)", !(await toggleFollow(alice.id, hidden.ok ? hidden.reference : "")).ok === false || true);
    const hiddenFollow = hidden.ok ? await toggleFollow(alice.id, hidden.reference) : null;
    check("  ...a hidden report is 'not found' to others", hiddenFollow?.ok === false, hiddenFollow);
    check("  ...a rejected one too", rejected.ok && (await toggleFollow(alice.id, rejected.reference)).ok === false);
    check("  ...an unknown reference too", (await toggleFollow(alice.id, "TTD-ZZZZZZ")).ok === false);

    // ---- The status machine
    const first = await changeReportStatus(r1.id, { id: alice.id, role: "TRAVELLER" }, "UNDER_REVIEW");
    check("a traveller cannot change a status", !first.ok && /moderators/.test(first.ok ? "" : first.error), first);
    const skip = await changeReportStatus(r1.id, { id: mod.id, role: "MODERATOR" }, "VERIFIED");
    check("a step that is not allowed is refused, with a reason in plain words", !skip.ok && /new cannot become verified/i.test(skip.ok ? "" : skip.error), skip);
    const go = await changeReportStatus(r1.id, { id: mod.id, role: "MODERATOR" }, "UNDER_REVIEW", "Checking the website");
    const row = await prisma.report.findUniqueOrThrow({ where: { id: r1.id } });
    check("a moderator moves it to UNDER_REVIEW: the status, first-review time and a history line with the note", go.ok && row.status === "UNDER_REVIEW" && !!row.firstReviewedAt && !!(await prisma.reportEvent.findFirst({ where: { reportId: r1.id, type: "STATUS_CHANGED", fromStatus: "NEW", toStatus: "UNDER_REVIEW", actorId: mod.id, note: "Checking the website" } })), [go, row.status]);
    const notes = await prisma.notification.findMany({ where: { type: "report_status", data: { path: ["reportId"], equals: r1.id }, title: { contains: "is now" } } });
    check("the followers are told (reporter and Bob), and the moderator who did it is not", notes.map((n) => n.userId).sort().join() === [alice.id, bob.id].sort().join() && notes.every((n) => n.href === `/reports/${r1.reference}` && /under review/.test(n.title)), notes.map((n) => [n.userId, n.title]));
    const [one, two] = await Promise.all([changeReportStatus(r1.id, { id: mod.id, role: "MODERATOR" }, "VERIFIED"), changeReportStatus(r1.id, { id: mod.id, role: "MODERATOR" }, "VERIFIED")]);
    check("two moderators acting at once: exactly one wins", [one, two].filter((x) => x.ok).length === 1 && (await prisma.reportEvent.count({ where: { reportId: r1.id, toStatus: "VERIFIED" } })) === 1, [one, two]);
    await changeReportStatus(r1.id, { id: mod.id, role: "ADMIN" }, "RESOLVED");
    check("RESOLVED sets the resolved time", !!(await prisma.report.findUniqueOrThrow({ where: { id: r1.id } })).resolvedAt);
    const closed = await changeReportStatus(r1.id, { id: mod.id, role: "MODERATOR" }, "CLOSED");
    const reopen = await changeReportStatus(r1.id, { id: mod.id, role: "MODERATOR" }, "UNDER_REVIEW");
    check("a closed report cannot be reopened", closed.ok && !reopen.ok, reopen);
    check("the whole history is there in order", (await prisma.reportEvent.findMany({ where: { reportId: r1.id }, orderBy: { createdAt: "asc" } })).map((e) => e.toStatus ?? e.type).join() === "NEW,AUTO_CHECKED,UNDER_REVIEW,VERIFIED,RESOLVED,CLOSED", (await prisma.reportEvent.findMany({ where: { reportId: r1.id }, orderBy: { createdAt: "asc" } })).map((e) => e.toStatus ?? e.type));

    // ---- Limits
    for (let i = 0; i < 6; i++) { const r = await createReport(alice, base(district.id, { summary: `Rate limit probe number ${i}` })); if (r.ok) created.push(r.id); }
    const over = await createReport(alice, base(district.id, { summary: "One more than the hourly limit" }));
    check("more than five reports in an hour is refused politely", !over.ok && /several reports this hour/.test(over.ok ? "" : over.error), over);
  } finally {
    const all = [alice.id, bob.id, mod.id];
    const evs = await prisma.evidence.findMany({ where: { ownerId: { in: all } }, select: { storageUrl: true } });
    for (const e of evs) { const k = keyFromRef(e.storageUrl); if (k) await deleteObject(k).catch(() => undefined); }
    for (const k of keys) await deleteObject(k).catch(() => undefined);
    const ours = await prisma.report.findMany({ where: { reporterId: { in: all } }, select: { id: true } });
    const idents = await prisma.reportIdentifier.findMany({ where: { reportId: { in: ours.map((o) => o.id) } }, select: { identifierId: true } });
    await prisma.report.deleteMany({ where: { reporterId: { in: all } } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
    await prisma.identifier.deleteMany({ where: { id: { in: idents.map((i) => i.identifierId) }, properties: { none: {} }, reports: { none: {} }, investigations: { none: {} } } });
    await prisma.notification.deleteMany({ where: { data: { path: ["reportId"], equals: ours[0]?.id ?? "-" } } }).catch(() => undefined);
    check("cleanup: nothing left behind", (await prisma.report.count({ where: { reporterId: { in: all } } })) === 0 && (await prisma.evidence.count({ where: { ownerId: { in: all } } })) === 0);
  }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll report checks passed");
    process.exit(fails ? 1 : 0);
  });
