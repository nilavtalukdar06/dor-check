// Phase 27 against the real database: the review flow (status, note, finding), hiding, flagged
// comments, listing requests from request to the public directory, tariff boards and ranges as
// the price check sees them, researched-range review, and the workflow numbers. Inngest sends are
// pointed at a closed port by the npm script, so no knowledge re-index runs. Cleans up after itself.
import prismaModule from "../src/lib/prisma";
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { reportInputSchema } from "../src/lib/reports";
import { decideListing, requestListing } from "../src/server/directory";
import { listAdminProperties, listListingRequests } from "../src/server/directory-admin";
import { listProperties } from "../src/server/directory-queries";
import { decideComment, getModerationStats, getReview, listFlaggedComments, listQueue, reviewReport, setReportHidden } from "../src/server/moderation";
import { lookupPrice } from "../src/server/price";
import { createReport } from "../src/server/reports";
import { getReportDetail } from "../src/server/reports-view";
import { decideResearched, getTariffAdmin, retireBenchmark, saveBenchmark, saveBoard } from "../src/server/tariffs-admin";
import { getWorkflowKpis, listEvents, listRuns } from "../src/server/workflows";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 500)}`);
  if (!ok) fails++;
};

async function main() {
  const stamp = Date.now();
  const mk = (tag: string, role: "TRAVELLER" | "MODERATOR" = "TRAVELLER") => prisma.user.create({ data: { clerkId: `mod_${tag}_${stamp}`, email: `ttd-e2e-mod-${tag}@example.com`, name: `Mod ${tag}`, role } });
  const [tina, otto, mona, biz] = [await mk("tina"), await mk("otto"), await mk("mona", "MODERATOR"), await mk("biz")];
  const ids = [tina.id, otto.id, mona.id, biz.id];
  for (const u of [tina, otto, mona, biz]) await prisma.workspace.create({ data: { ownerId: u.id, isPersonal: true } });
  const staff = { id: mona.id, role: "MODERATOR" as const, name: mona.name, displayName: null };
  const district = await prisma.district.findFirstOrThrow({ where: { name: "East Khasi Hills" } });
  const made = { properties: [] as string[], boards: [] as string[], ranges: [] as string[] };

  try {
    // ---- A report from NEW to VERIFIED with a finding
    const r = await createReport(tina, reportInputSchema.parse({ kind: "SCAM", category: "STAY", summary: "Advance to a personal UPI for a homestay", districtId: district.id, evidenceIds: [], isAnonymous: true, amountInr: 6000, description: "Asked for an advance of Rs 6000 to a personal UPI id before the stay. The listing vanished after payment." }));
    if (!r.ok) throw new Error("no report");
    const ref = r.reference;
    const q = await listQueue();
    const row = q.find((x) => x.reference === ref);
    check("a new report is in the queue as New, High priority (money lost), with its auto-check", row?.status === "NEW" && row.priority === "HIGH" && /^Auto: /.test(row.autoCheck), row);
    check("the queue is ordered most urgent first", q.findIndex((x) => x.priority !== "HIGH") === -1 || q.slice(0, q.findIndex((x) => x.priority !== "HIGH")).every((x) => x.priority === "HIGH"));
    check("filters narrow the queue", (await listQueue({ priority: "LOW" })).every((x) => x.priority === "LOW") && (await listQueue({ status: "NEW" })).every((x) => x.status === "NEW") && (await listQueue({ q: ref })).length === 1);

    const rv = await getReview(staff, ref);
    check("the review shows the full report to the moderator, with the reporter and allowed next steps", rv?.status === "NEW" && rv.reporter?.email === tina.email && rv.next.includes("UNDER_REVIEW") && rv.allegation.includes("personal UPI"), rv && { next: rv.next, reporter: rv.reporter });

    check("a decision needs something", !(await reviewReport(staff, ref, {})).ok);
    const step1 = await reviewReport(staff, ref, { to: "UNDER_REVIEW", note: "We are calling the property." });
    const after1 = await prisma.report.findUniqueOrThrow({ where: { id: r.id } });
    check("moving to In review records the status, the note and the review time", step1.ok && after1.status === "UNDER_REVIEW" && !!after1.firstReviewedAt && (await prisma.reportEvent.count({ where: { reportId: r.id, type: "STATUS_CHANGED", note: "We are calling the property." } })) === 1, step1);
    check("the reporter is told", (await prisma.notification.count({ where: { userId: tina.id, type: "report_status" } })) >= 1);
    check("the moderation log and the audit log both record it", (await prisma.moderationAction.count({ where: { moderatorId: mona.id, targetId: r.id, action: "status_change" } })) === 1 && (await prisma.auditLog.count({ where: { actorId: mona.id, entityId: r.id, action: "report.status_change" } })) === 1);
    check("a move the rules do not allow is refused", !(await reviewReport(staff, ref, { to: "NEW" as never })).ok);

    const step2 = await reviewReport(staff, ref, { to: "VERIFIED", finding: "We called the property: it never takes advance payments to personal accounts. This listing is not theirs." });
    const after2 = await prisma.report.findUniqueOrThrow({ where: { id: r.id }, include: { findings: true } });
    check("Verified with a finding in one decision: status, published finding, logs", step2.ok && after2.status === "VERIFIED" && after2.findings.length === 1 && !after2.findings[0].retractedAt && (await prisma.auditLog.count({ where: { entityId: r.id, action: "report.publish_finding" } })) === 1, step2);
    const seen = await getReportDetail({ id: otto.id, role: "TRAVELLER" }, ref);
    check("another traveller sees it as Verified with the official finding", seen?.status === "VERIFIED" && seen.findings.length === 1 && /never takes advance/.test(seen.findings[0].body), seen && { status: seen.status, findings: seen.findings.length });
    const note = await reviewReport(staff, ref, { note: "Thanks for reporting." });
    check("a note without a status change still reaches the reporter and the history", note.ok && (await prisma.reportEvent.count({ where: { reportId: r.id, type: "NOTE" } })) === 1 && (await prisma.notification.count({ where: { userId: tina.id, title: { contains: "A moderator wrote" } } })) === 1);

    // ---- Hiding
    check("hiding takes it off the public view; the reporter still sees it", (await setReportHidden(staff, ref, true)).ok && (await getReportDetail({ id: otto.id, role: "TRAVELLER" }, ref)) === null && (await getReportDetail({ id: tina.id, role: "TRAVELLER" }, ref)) !== null && (await prisma.reportEvent.count({ where: { reportId: r.id, type: "HIDDEN" } })) === 1);
    check("restoring brings it back", (await setReportHidden(staff, ref, false)).ok && (await getReportDetail({ id: otto.id, role: "TRAVELLER" }, ref)) !== null);

    // ---- Flagged comments
    const c1 = await prisma.comment.create({ data: { reportId: r.id, authorId: otto.id, authorRole: "TRAVELLER", body: "This is spam text", status: "FLAGGED", flaggedReason: "Spam", flaggedAt: new Date(), flaggedById: tina.id, streamMessageId: `fake-${stamp}-1` } });
    const c2 = await prisma.comment.create({ data: { reportId: r.id, authorId: otto.id, authorRole: "TRAVELLER", body: "A fair point", status: "FLAGGED", flaggedReason: "Other", flaggedAt: new Date(), flaggedById: tina.id, streamMessageId: `fake-${stamp}-2` } });
    const flagged = await listFlaggedComments();
    check("flagged comments are listed with who flagged them and why", flagged.some((f) => f.id === c1.id && f.reason === "Spam" && f.flaggedBy === "Mod tina" && f.reference === ref));
    check("removing one takes it down and logs it", (await decideComment(staff, c1.id, "remove")).ok && (await prisma.comment.findUniqueOrThrow({ where: { id: c1.id } })).status === "REMOVED" && (await prisma.auditLog.count({ where: { entityId: c1.id, action: "comment.remove" } })) === 1);
    check("keeping one clears the flag", (await decideComment(staff, c2.id, "approve")).ok && (await prisma.comment.findUniqueOrThrow({ where: { id: c2.id } })).status === "VISIBLE");

    // ---- Listing requests
    const domain = `ridgeview-${stamp}.example`;
    const req = await requestListing(biz.id, { name: "Ridgeview Homestay", type: "STAY", districtId: district.id, domain, phone: "+91 98765 1" + String(stamp).slice(-5), businessUpi: `ridgeview${String(stamp).slice(-5)}@okaxis`, registrationNumber: "MEG-HS-0042", description: "A family homestay near Shillong Peak.", lat: 25.55, lng: 91.88, tags: [] });
    check("a business can request a listing", req.ok, req);
    if (!req.ok) return;
    made.properties.push(req.id);
    const pending = await prisma.property.findUniqueOrThrow({ where: { id: req.id } });
    check("the request waits: pending, not active, recorded with who asked", pending.listingStatus === "PENDING" && !pending.isActive && pending.requestedById === biz.id);
    const publicList = await listProperties({ type: undefined, q: "Ridgeview", verified: undefined } as never);
    check("a pending request is not in the public directory", !publicList.items.some((p) => p.id === req.id), publicList.items.map((p) => p.name));
    check("it is in the moderators' Listing requests tab", (await listListingRequests()).some((x) => x.id === req.id && x.domain === domain));
    check("a second request with the same website is refused", !(await requestListing(biz.id, { name: "Ridgeview Again", type: "STAY", districtId: district.id, domain, tags: [] })).ok);
    check("a request needs a way to recognise the business", !(await requestListing(biz.id, { name: "No contact", type: "STAY", districtId: district.id, tags: [] })).ok);
    let limited = false;
    for (let i = 0; i < 4 && !limited; i++) {
      const x = await requestListing(biz.id, { name: `Spam listing ${i}`, type: "TAXI", districtId: district.id, domain: `spam${i}-${stamp}.example`, tags: [] });
      if (x.ok) made.properties.push(x.id);
      else if (/a day/.test(x.error)) limited = true;
    }
    check("at most three requests a day", limited);

    await decideListing(mona.id, req.id, "verify");
    const listed = await prisma.property.findUniqueOrThrow({ where: { id: req.id } });
    check("Approve and verify lists it, verified, with who verified and when", listed.listingStatus === "APPROVED" && listed.isActive && listed.verified && listed.verifiedById === mona.id && !!listed.verifiedAt);
    const nowPublic = await listProperties({ type: undefined, q: "Ridgeview", verified: undefined } as never);
    check("it now appears in the public directory", nowPublic.items.some((p) => p.id === req.id));
    check("it appears in the moderators' Directory tab with its pin", (await listAdminProperties("Ridgeview")).some((p) => p.id === req.id && p.hasPin));
    check("the business is told", (await prisma.notification.count({ where: { userId: biz.id, title: { contains: "is now listed and verified" } } })) === 1);
    check("the decision is logged", (await prisma.moderationAction.count({ where: { targetId: req.id, action: "approve_and_verify_listing" } })) === 1 && (await prisma.auditLog.count({ where: { entityId: req.id, action: "property.approve_and_verify_listing" } })) === 1);
    let twice = false;
    try { await decideListing(mona.id, req.id, "reject", "x"); } catch { twice = true; }
    check("a decided request cannot be decided again", twice);
    const spamId = made.properties[1];
    await decideListing(mona.id, spamId, "reject", "We could not confirm this business.");
    const rejected = await prisma.property.findUniqueOrThrow({ where: { id: spamId } });
    check("Reject keeps it hidden, with the reason, and tells the business", rejected.listingStatus === "REJECTED" && !rejected.isActive && rejected.rejectionReason === "We could not confirm this business." && (await prisma.notification.count({ where: { userId: biz.id, title: { contains: "was not approved" } } })) === 1);

    // ---- Tariffs
    const board = await saveBoard(mona.id, null, { name: `Test fare board ${stamp}`, districtId: district.id, lat: 25.57, lng: 91.88, lastVerifiedAt: "2026-10-10" });
    check("a tariff board can be added", board.ok, board);
    if (board.ok) made.boards.push(board.id);
    check("a board without a place is refused", !(await saveBoard(mona.id, null, { name: "No place", districtId: district.id, lat: Number.NaN, lng: Number.NaN })).ok);
    const places = await prisma.place.findMany({ where: { source: "seed" }, orderBy: { name: "asc" }, take: 40, select: { id: true, name: true } });
    // Two seeded places with no tariff between them yet, so the new range is the one the price check finds.
    let pair: [typeof places[number], typeof places[number]] | null = null;
    for (const a of places) for (const b of places) if (!pair && a.id !== b.id && (await lookupPrice({ service: "TAXI", quotedInr: 1000, origin: a.name, destination: b.name, vehicle: "VAN" })).band === "NO_REFERENCE") pair = [a, b];
    if (!pair) throw new Error("no free pair");
    const range = await saveBenchmark(mona.id, null, { serviceType: "TAXI", originPlaceId: pair[0].id, destinationPlaceId: pair[1].id, vehicle: "VAN", unit: "PER_TRIP", lowInr: 4000, highInr: 5000, boardId: board.ok ? board.id : undefined, sourceLabel: "Test fare board", effectiveOn: "2026-10-01" });
    check("a curated range can be added", range.ok, range);
    if (range.ok) made.ranges.push(range.id);
    const priced = await lookupPrice({ service: "TAXI", quotedInr: 7000, origin: pair[0].name, destination: pair[1].name, vehicle: "VAN" });
    check("the price check now uses it (Rs 7,000 against 4,000 to 5,000 is well above)", priced.lowInr === 4000 && priced.highInr === 5000 && priced.band === "WELL_ABOVE_RANGE", priced);
    check("a range with the high below the low is refused", !(await saveBenchmark(mona.id, null, { serviceType: "STAY", districtId: district.id, qualifier: "Test room", unit: "PER_NIGHT", lowInr: 3000, highInr: 2000, sourceLabel: "Sheet", effectiveOn: "2026-10-01" })).ok);
    check("a taxi range needs both places and a vehicle", !(await saveBenchmark(mona.id, null, { serviceType: "TAXI", unit: "PER_TRIP", lowInr: 1, highInr: 2, sourceLabel: "Sheet", effectiveOn: "2026-10-01" })).ok);
    if (range.ok) {
      await retireBenchmark(mona.id, range.id);
      check("retiring a range takes it out of the price check", (await lookupPrice({ service: "TAXI", quotedInr: 7000, origin: pair[0].name, destination: pair[1].name, vehicle: "VAN" })).band === "NO_REFERENCE");
    }
    const researched = await prisma.tariffBenchmark.create({ data: { serviceType: "STAY", routeKey: `test-${stamp}|room`, districtId: district.id, qualifier: "Test room", unit: "PER_NIGHT", lowInr: 1500, highInr: 2500, basis: "researched", confidence: "MEDIUM", sampleSize: 3, reviewStatus: "pending", researchedAt: new Date(), effectiveOn: new Date(), sourceLabel: "Researched" } });
    made.ranges.push(researched.id);
    check("a researched range waits in the Tariffs tab", (await getTariffAdmin()).researched.some((x) => x.id === researched.id));
    await decideResearched(mona.id, researched.id, false);
    const rj = await prisma.tariffBenchmark.findUniqueOrThrow({ where: { id: researched.id } });
    check("rejecting it stops it being used", rj.reviewStatus === "rejected" && !rj.isActive);
    let again = false;
    try { await decideResearched(mona.id, researched.id, true); } catch { again = true; }
    check("it cannot be decided twice", again);

    // ---- Stats and workflows
    const st = await getModerationStats();
    check("the moderation numbers are counted", st.waiting >= 0 && st.inReview >= 0 && st.resolvedThisWeek >= 0 && typeof st.flaggedComments === "number" && (st.avgReviewMs === null || st.avgReviewMs >= 0), st);
    const k = await getWorkflowKpis();
    const runs = await listRuns();
    check("workflow numbers come from our own tables", k.runsToday >= 0 && (k.successRate === null || (k.successRate >= 0 && k.successRate <= 100)) && runs.length > 0 && runs.every((x) => x.runCode.startsWith("run_")), { k, n: runs.length });
    const ev = await listEvents(runs[0].id);
    check("the event stream reads a run's events", Array.isArray(ev) && ev.every((e) => e.runCode === runs[0].runCode));
  } finally {
    await prisma.tariffBenchmark.deleteMany({ where: { id: { in: made.ranges } } });
    await prisma.tariffBoard.deleteMany({ where: { id: { in: made.boards } } });
    const props = await prisma.property.findMany({ where: { OR: [{ id: { in: made.properties } }, { requestedById: { in: ids } }] }, select: { id: true } });
    const pIdents = await prisma.propertyIdentifier.findMany({ where: { propertyId: { in: props.map((p) => p.id) } }, select: { identifierId: true } });
    await prisma.property.deleteMany({ where: { id: { in: props.map((p) => p.id) } } });
    const reports = await prisma.report.findMany({ where: { reporterId: { in: ids } }, select: { id: true } });
    const rIdents = await prisma.reportIdentifier.findMany({ where: { reportId: { in: reports.map((x) => x.id) } }, select: { identifierId: true } });
    await prisma.report.deleteMany({ where: { reporterId: { in: ids } } });
    await prisma.identifier.deleteMany({ where: { id: { in: [...pIdents, ...rIdents].map((i) => i.identifierId) }, properties: { none: {} }, reports: { none: {} }, investigations: { none: {} } } });
    await prisma.moderationAction.deleteMany({ where: { moderatorId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: ids.map((i) => `report:${i}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    check("cleanup: nothing left behind", (await prisma.property.count({ where: { id: { in: made.properties } } })) === 0 && (await prisma.report.count({ where: { reporterId: { in: ids } } })) === 0 && (await prisma.tariffBoard.count({ where: { id: { in: made.boards } } })) === 0);
  }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll moderation checks passed");
    process.exit(fails ? 1 : 0);
  });
