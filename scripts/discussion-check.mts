// Live check of the report discussion against the real Stream app and database: posting, screening,
// the chat mirror, flagging, moderation, official findings, the locked-down channel type and the
// webhook. Cleans up everything it creates (database rows and Stream channels/users).
import { createHmac } from "node:crypto";
import { StreamChat } from "stream-chat";
import prismaModule from "../src/lib/prisma";
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { reportInputSchema } from "../src/lib/reports";
import { flagComment, listComments, mirrorStreamMessage, moderateComment, postComment, publishFinding, retractFinding, findViewableReport } from "../src/server/comments";
import { createReport } from "../src/server/reports";
import { ensureChannelType, joinChannel, streamServer, streamToken, upsertStreamUser } from "../src/server/stream";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 500)}`);
  if (!ok) fails++;
};

async function main() {
  const mk = (tag: string, role: "TRAVELLER" | "MODERATOR" = "TRAVELLER", name = `Rep ${tag}`) => prisma.user.create({ data: { clerkId: `disc_${tag}_${Date.now()}`, email: `ttd-e2e-disc-${tag}@example.com`, name, role } });
  const [alice, bob, mod, carol] = [await mk("alice", "TRAVELLER", "Alice Sharma"), await mk("bob", "TRAVELLER", "Bob Das"), await mk("mod", "MODERATOR", "Moira Mod"), await mk("carol")];
  const all = [alice, bob, mod, carol];
  for (const u of all) await prisma.workspace.create({ data: { ownerId: u.id, isPersonal: true } });
  const actor = (u: (typeof all)[number]) => ({ id: u.id, role: u.role as "TRAVELLER" | "MODERATOR", name: u.name, displayName: u.displayName });
  const district = await prisma.district.findFirstOrThrow({ where: { name: "East Khasi Hills" } });
  const server = streamServer();
  let channelId = "";

  try {
    const r = await createReport(alice, reportInputSchema.parse({ kind: "SCAM", category: "STAY", summary: "Asked for an advance to a personal account", districtId: district.id, evidenceIds: [], isAnonymous: true, description: "Shared a booking link on WhatsApp and asked for an advance payment to a personal account. The page disappeared after I asked for a receipt." }));
    if (!r.ok) throw new Error("report not created");
    const ref = r.reference;
    channelId = `report-${ref}`;
    const rep = await prisma.report.findUniqueOrThrow({ where: { id: r.id } });

    // ---- The channel type
    await ensureChannelType();
    const types: Any = await server.listChannelTypes();
    const g = types.channel_types.report.grants;
    check("the report channel type exists and nobody can create messages from the browser", g.user.length === 0 && !g.channel_member.includes("create-message") && !g.channel_moderator.includes("create-message") && g.channel_member.includes("read-channel"), g);

    // ---- Posting
    const p1 = await postComment(actor(bob), ref, "I stayed near there in March and the owner asked for an advance too.");
    check("a clean comment is posted", p1.ok && p1.comment.state === "visible" && p1.comment.badge === "Traveller", p1);
    if (!p1.ok) return;
    const row = await prisma.comment.findUniqueOrThrow({ where: { id: p1.comment.id } });
    check("it is mirrored in the database with the Stream message id", row.status === "VISIBLE" && row.streamMessageId === row.id && row.authorId === bob.id && row.authorRole === "TRAVELLER", row);
    const ch = server.channel("report", channelId);
    const q = await ch.query({ messages: { limit: 20 } });
    const msg = q.messages.find((m) => m.id === row.id) as Any;
    check("the same message exists in the Stream channel with its badge and public name", !!msg && msg.text === row.body && msg.badge === "Traveller" && msg.author_name === "Bob", msg);
    check("the public name is a first name only, never an email", !JSON.stringify(msg).includes("@") && !JSON.stringify(msg).includes("Das"), msg);

    const rejected = await postComment(actor(bob), ref, "Call him on 98765 43210 or pay rajesh@okaxis");
    check("phone numbers and payment ids are turned back, nothing saved", !rejected.ok && (await prisma.comment.count({ where: { reportId: r.id } })) === 1, rejected);

    const held = await postComment(actor(carol), ref, "Check https://example.com/proof for the screenshots");
    check("a comment with a link is held for a moderator", held.ok && held.comment.state === "held" && !!held.heldReason, held);
    if (!held.ok) return;
    const heldRow = await prisma.comment.findUniqueOrThrow({ where: { id: held.comment.id } });
    check("a held comment is saved as flagged and never sent to Stream", heldRow.status === "FLAGGED" && heldRow.streamMessageId === null && !(await ch.query({ messages: { limit: 20 } })).messages.some((m) => m.id === heldRow.id), heldRow);

    const seen = async (u: (typeof all)[number]) => (await listComments(actor(u), { id: r.id, reporterId: rep.reporterId, isAnonymous: rep.isAnonymous })).map((c) => c.id);
    check("a held comment is visible to its author and moderators only", (await seen(carol)).includes(heldRow.id) && (await seen(mod)).includes(heldRow.id) && !(await seen(bob)).includes(heldRow.id) && !(await seen(alice)).includes(heldRow.id));

    // ---- Moderators
    const pm = await postComment(actor(mod), ref, "We contacted the property and are checking their listing.");
    check("a moderator's comment carries the Official badge and the team name", pm.ok && pm.comment.badge === "Official" && pm.comment.author === "Moderation team", pm);
    const pa = await postComment(actor(alice), ref, "Thank you, this is my report.");
    const list = await listComments(actor(bob), { id: r.id, reporterId: rep.reporterId, isAnonymous: rep.isAnonymous });
    const aliceCard = list.find((c) => pa.ok && c.id === pa.comment.id);
    check("the anonymous reporter is shown as Reporter, not by name", aliceCard?.author === "Reporter" && aliceCard.reporter === true, aliceCard);

    const approve = await moderateComment(actor(mod), heldRow.id, "approve");
    const afterApprove = await prisma.comment.findUniqueOrThrow({ where: { id: heldRow.id } });
    check("approving a held comment posts it to the chat", approve.ok && afterApprove.status === "VISIBLE" && afterApprove.streamMessageId === heldRow.id && (await ch.query({ messages: { limit: 20 } })).messages.some((m) => m.id === heldRow.id), afterApprove);
    check("a traveller cannot moderate", !(await moderateComment(actor(bob), heldRow.id, "remove")).ok);

    // ---- Flagging
    const fl = await flagComment(actor(alice), p1.comment.id, "Spam");
    const flagged = await prisma.comment.findUniqueOrThrow({ where: { id: p1.comment.id } });
    check("flagging marks the comment for review but keeps it visible", fl.ok && flagged.status === "FLAGGED" && flagged.flaggedById === alice.id && flagged.flaggedReason === "Spam" && (await seen(carol)).includes(p1.comment.id), flagged);
    check("you cannot flag your own comment", !(await flagComment(actor(bob), p1.comment.id, "Spam")).ok);
    const flaggedInStream = ((await ch.query({ messages: { limit: 20 } })).messages.find((m) => m.id === p1.comment.id) as Any)?.flagged;
    check("the Stream message is marked flagged too", flaggedInStream === true, flaggedInStream);
    const ok2 = await moderateComment(actor(mod), p1.comment.id, "approve");
    const cleared = await prisma.comment.findUniqueOrThrow({ where: { id: p1.comment.id } });
    check("approving a flagged comment clears the flag", ok2.ok && cleared.status === "VISIBLE" && !cleared.flaggedReason && cleared.moderatedById === mod.id, cleared);

    const rm = await moderateComment(actor(mod), p1.comment.id, "remove");
    const gone = await prisma.comment.findUniqueOrThrow({ where: { id: p1.comment.id } });
    check("removing a comment hides it from travellers and leaves a moderation record", rm.ok && gone.status === "REMOVED" && !(await seen(carol)).includes(gone.id) && (await seen(mod)).includes(gone.id) && (await prisma.moderationAction.count({ where: { targetType: "comment", targetId: gone.id, moderatorId: mod.id } })) >= 1, gone);
    const inStream = (await ch.query({ messages: { limit: 20 } })).messages.find((m) => m.id === gone.id);
    check("a removed comment is deleted in Stream", !inStream || inStream.type === "deleted" || !!inStream.deleted_at, inStream);

    // ---- Notifications
    await prisma.reportFollow.create({ data: { reportId: r.id, userId: carol.id } });
    await postComment(actor(bob), ref, "Another note from the same visit last month.");
    const notes = await prisma.notification.findMany({ where: { userId: { in: [alice.id, carol.id] }, type: "report_comment" } });
    check("followers and the reporter are told about new comments, the author is not", notes.some((n) => n.userId === alice.id) && notes.some((n) => n.userId === carol.id) && !(await prisma.notification.count({ where: { userId: bob.id, type: "report_comment" } })), notes.length);

    // ---- Rate limit
    const eve = await mk("eve");
    all.push(eve);
    await prisma.workspace.create({ data: { ownerId: eve.id, isPersonal: true } });
    let limited = false;
    for (let i = 0; i < 20 && !limited; i++) {
      const x = await postComment(actor(eve), ref, `Short note number ${i} about the stay.`);
      if (!x.ok) { console.log("   post", i, x.error); if (/fast/i.test(x.error)) limited = true; }
    }
    check("commenting too fast is rate limited", limited);

    // ---- Official findings
    check("a traveller cannot publish a finding", !(await publishFinding(actor(bob), ref, "I think this is a scam for sure, be careful everyone.")).ok);
    check("a finding must say something", !(await publishFinding(actor(mod), ref, "Scam.")).ok);
    const f = await publishFinding(actor(mod), ref, "We called the listed number and the property confirmed it does not take advance payments to personal accounts.");
    const fRow = f.ok && f.id ? await prisma.officialFinding.findUniqueOrThrow({ where: { id: f.id } }) : null;
    check("a moderator publishes a finding, stored in the database", f.ok && !!fRow && !fRow.retractedAt && fRow.authorId === mod.id, f);
    check("the finding is not a chat message", !(await ch.query({ messages: { limit: 50 } })).messages.some((m) => m.text?.includes("does not take advance payments")));
    check("publishing is recorded in the history and told to followers", (await prisma.reportEvent.count({ where: { reportId: r.id, type: "FINDING_PUBLISHED" } })) === 1 && (await prisma.notification.count({ where: { userId: carol.id, type: "report_finding" } })) === 1);
    if (fRow) {
      check("a traveller cannot withdraw it", !(await retractFinding(actor(bob), fRow.id)).ok);
      check("a moderator can withdraw it", (await retractFinding(actor(mod), fRow.id, "Superseded")).ok && !!(await prisma.officialFinding.findUniqueOrThrow({ where: { id: fRow.id } })).retractedAt);
    }

    // ---- Visibility
    check("people who cannot see a hidden report cannot reach its discussion", await (async () => {
      await prisma.report.update({ where: { id: r.id }, data: { visibility: "HIDDEN" } });
      const out = (await findViewableReport(actor(bob), ref)) === null && (await findViewableReport(actor(alice), ref)) !== null && (await findViewableReport(actor(mod), ref)) !== null;
      const post = await postComment(actor(bob), ref, "Can I still comment here?");
      await prisma.report.update({ where: { id: r.id }, data: { visibility: "PUBLIC" } });
      return out && !post.ok;
    })());

    // ---- A browser client cannot post straight to the chat
    const apiKey = process.env.NEXT_PUBLIC_STREAM_KEY!;
    await upsertStreamUser(carol.id, "Carol");
    await joinChannel(channelId, ref, carol.id, false);
    const browser = new StreamChat(apiKey);
    await browser.connectUser({ id: carol.id }, streamToken(carol.id));
    const bch = browser.channel("report", channelId);
    await bch.watch({ messages: { limit: 5 } });
    check("a member can read the channel", bch.state.messages.length > 0);
    let direct = "sent";
    try { await bch.sendMessage({ text: "I am bypassing the screening" }); } catch (e) { direct = (e as Error).message; }
    check("a member cannot post straight to the chat from the browser", direct !== "sent" && /permission|not allowed|403/i.test(direct), direct);
    // A person who was never added cannot watch it.
    const outsider = await mk("outsider");
    all.push(outsider);
    await upsertStreamUser(outsider.id, "Outsider");
    const o = new StreamChat(apiKey);
    await o.connectUser({ id: outsider.id }, streamToken(outsider.id));
    let watched = "watched";
    try { await o.channel("report", channelId).watch(); } catch (e) { watched = (e as Error).message; }
    check("someone who is not a member cannot watch the channel", watched !== "watched", watched);
    await browser.disconnectUser();
    await o.disconnectUser();

    // ---- Realtime delivery between two accounts
    const aClient = new StreamChat(apiKey);
    await upsertStreamUser(alice.id, "Reporter");
    await joinChannel(channelId, ref, alice.id, false);
    await aClient.connectUser({ id: alice.id }, streamToken(alice.id));
    const aCh = aClient.channel("report", channelId);
    await aCh.watch();
    const got = new Promise<Any>((res) => { const t = setTimeout(() => res(null), 8000); aCh.on("message.new", (e) => { clearTimeout(t); res(e.message); }); });
    const live = await postComment(actor(mod), ref, "Update: the finding has been published above.");
    const delivered = await got;
    check("another account sees a new comment live, with the Official badge", live.ok && delivered?.id === (live.ok ? live.comment.id : "") && delivered?.badge === "Official", delivered);
    await aClient.disconnectUser();

    // ---- Webhook
    const body = JSON.stringify({ type: "message.new", channel_id: channelId, channel_type: "report", message: { id: "outside-1", text: "Sent some other way", user: { id: carol.id } } });
    const sig = createHmac("sha256", process.env.STREAM_SECRET!).update(body).digest("hex");
    check("a webhook signature is verified over the raw body", server.verifyWebhook(body, sig) && !server.verifyWebhook(body + " ", sig) && !server.verifyWebhook(body, "bad"));
    const m1 = await mirrorStreamMessage(JSON.parse(body));
    const mirrored = await prisma.comment.findUnique({ where: { id: "outside-1" } });
    check("a message that reached the chat another way is mirrored, flagged for review", m1.mirrored && mirrored?.status === "FLAGGED" && mirrored.streamMessageId === "outside-1", mirrored);
    check("our own messages and repeats are not mirrored twice", !(await mirrorStreamMessage({ type: "message.new", channel_id: channelId, channel_type: "report", message: { id: row.id, text: "x", user: { id: bob.id } } })).mirrored && !(await mirrorStreamMessage(JSON.parse(body))).mirrored);
    check("events for other channel types are ignored", !(await mirrorStreamMessage({ type: "message.new", channel_id: "x", channel_type: "messaging", message: { id: "y", text: "z" } })).mirrored);
  } finally {
    if (channelId) await server.deleteChannels([`report:${channelId}`], { hard_delete: true }).catch(() => undefined);
    const ids = all2();
    await server.deleteUsers(ids, { user: "hard", messages: "hard" }).catch(() => undefined);
    const ours = await prisma.report.findMany({ where: { reporterId: { in: ids } }, select: { id: true } });
    await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { data: { path: ["reportId"], equals: ours[0]?.id ?? "-" } }] } });
    await prisma.rateLimitBucket.deleteMany({ where: { OR: [{ key: { startsWith: "comment:" } }, { key: { startsWith: "flag:" } }] } }).catch(() => undefined);
    await prisma.moderationAction.deleteMany({ where: { moderatorId: { in: ids } } });
    await prisma.report.deleteMany({ where: { reporterId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    check("cleanup: nothing left behind", (await prisma.user.count({ where: { id: { in: ids } } })) === 0 && (await prisma.comment.count({ where: { reportId: { in: ours.map((o) => o.id) } } })) === 0);
  }
  function all2() { return all.map((u) => u.id); }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll discussion checks passed");
    process.exit(fails ? 1 : 0);
  });
