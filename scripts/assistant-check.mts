// The assistant's server side against the real database with a scripted model and fake tools:
// saving, history, tools and source chips, language, ownership, limits and starting a check.
// No Gemini calls. Cleans up everything it creates.
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import prismaModule from "../src/lib/prisma";
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { collectCitations } from "../src/lib/assistant";
import { archiveThread, chatTurn, getThread, listThreads } from "../src/server/assistant";
import { createInvestigation } from "../src/server/investigation";
import type { AgentDeps } from "../src/server/agent-tools";

let fails = 0;
const check = (name: string, ok: unknown, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)?.slice(0, 600)}`);
  if (!ok) fails++;
};

const usage = { inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 40, text: 40, reasoning: undefined } };
type Step = { call: { name: string; input: object } } | { text: string };

/** A model that plays a script, one step per call, and remembers every prompt it was given. */
function scripted(steps: Step[]) {
  const prompts: string[] = [];
  let i = 0;
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      const step = steps[Math.min(i++, steps.length - 1)];
      const chunks =
        "call" in step
          ? [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: `c${i}`, toolName: step.call.name, input: JSON.stringify(step.call.input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage }]
          : [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: step.text }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }];
      return { stream: simulateReadableStream({ chunks: chunks as never }) };
    },
  });
  return { model, prompts };
}

const fakeDeps = (): Partial<AgentDeps> => ({
  lookupPrice: async () => ({ band: "OVERPRICED", lowInr: 2200, highInr: 3000, percentOverHigh: 60, benchmarkId: "b1", effectiveOn: null, unit: "PER_TRIP", match: "exact", reversed: false, reason: null, basis: "curated", confidence: "HIGH", sampleSize: null, details: { sourceLabel: "tariff sheet", sourceUrl: "/price" }, benchmarks: [] }) as never,
  retrieve: async () => [],
});

const read = async (res: Response) => (res.body ? await new Response(res.body).text() : "");
const newId = () => `th${Math.random().toString(36).slice(2)}${Date.now().toString(36)}abcdefgh`.slice(0, 24);

async function main() {
  const mk = (tag: string) => prisma.user.create({ data: { clerkId: `asst_${tag}_${Date.now()}`, email: `ttd-e2e-asst-${tag}@example.com`, name: `Asst ${tag}` } });
  const [ann, ben] = [await mk("ann"), await mk("ben")];
  for (const u of [ann, ben]) await prisma.workspace.create({ data: { ownerId: u.id, isPersonal: true } });
  const A = { id: ann.id, role: "TRAVELLER" as const };
  const B = { id: ben.id, role: "TRAVELLER" as const };
  const ids = [ann.id, ben.id];

  try {
    // ---- A question that needs a tool
    const t1 = newId();
    const s1 = scripted([{ call: { name: "comparePrice", input: { service: "TAXI", quotedInr: 4800, origin: "Guwahati airport", destination: "Shillong" } } }, { text: "A taxi from Guwahati airport to Shillong usually costs Rs 2,200 to Rs 3,000. Rs 4,800 is well above that." }]);
    const msg = (text: string) => ({ id: "m", role: "user", parts: [{ type: "text", text }] });
    const r1 = await chatTurn(A, { id: t1, message: msg("Is Rs 4800 fair for a taxi from Guwahati airport to Shillong?"), languageMode: "auto" }, { model: s1.model, deps: fakeDeps() });
    const body1 = await read(r1);
    check("a question is answered as a stream of UI message chunks", r1.status === 200 && body1.includes("text-delta") && body1.includes("well above that"), body1.slice(0, 300));
    check("the tool call and its result are in the stream, with a source chip attached", body1.includes("tool-input-available") && body1.includes("comparePrice") && /"citations":\[\{"label":"Tariff sheet"/.test(body1), body1.slice(0, 600));

    const th = await prisma.chatThread.findUniqueOrThrow({ where: { id: t1 }, include: { messages: { orderBy: { createdAt: "asc" }, include: { toolCalls: true } } } });
    check("the thread is created for the person with a title from the first question", th.userId === ann.id && th.title.startsWith("Is Rs 4800 fair") && th.languageMode === null, th);
    check("the question and the answer are both saved, in order", th.messages.length === 2 && th.messages[0].role === "USER" && th.messages[1].role === "ASSISTANT" && th.messages[1].content.includes("Rs 2,200 to Rs 3,000"), th.messages.map((m) => m.role));
    const a1 = th.messages[1];
    check("the answer records its model, prompt version, tokens, language and sources", a1.modelId !== null && a1.promptVersion === "assistant-2" && (a1.inputTokens ?? 0) > 0 && a1.language === "en" && Array.isArray(a1.citations) && (a1.citations as { label: string }[])[0]?.label === "Tariff sheet", a1);
    check("the tool call is logged against the answer", a1.toolCalls.length === 1 && a1.toolCalls[0].name === "comparePrice" && a1.toolCalls[0].status === "COMPLETED", a1.toolCalls);
    check("the model was told to use tools only and to follow the person's language", s1.prompts[0].includes("ONLY from your tools") && s1.prompts[0].includes("language the person wrote in"));
    check("the model does not see the source chips (it never writes a link)", s1.prompts[1] !== undefined && !s1.prompts[1].includes("citations") && s1.prompts[1].includes("OVERPRICED"), s1.prompts[1]?.slice(-400));
    check("collectCitations reads the chips from saved parts", collectCitations(a1.parts)[0]?.label === "Tariff sheet");

    // ---- A follow-up in Assamese, with the language fixed
    const s2 = scripted([{ text: "টেক্সীৰ ভাড়া সাধাৰণতে ২২০০ ৰ পৰা ৩০০০ টকা।" }]);
    const r2 = await chatTurn(A, { id: t1, message: msg("শিলঙলৈ এয়াৰপোৰ্টৰ পৰা টেক্সী ভাড়া কিমান?"), languageMode: "as" }, { model: s2.model, deps: fakeDeps() });
    await read(r2);
    check("a chosen language is passed to the model and remembered on the thread", s2.prompts[0].includes("Always reply in Assamese") && (await prisma.chatThread.findUniqueOrThrow({ where: { id: t1 } })).languageMode === "as");
    check("the model sees the earlier turns of the conversation", s2.prompts[0].includes("Rs 4800 fair") && s2.prompts[0].includes("well above that"));
    const th2 = await getThread(A.id, t1);
    check("the saved conversation reloads as UI messages, Assamese detected", th2?.messages.length === 4 && th2.messages[2].role === "user" && th2.languageMode === "as" && (await prisma.chatMessage.findFirstOrThrow({ where: { threadId: t1, role: "USER" }, orderBy: { createdAt: "desc" } })).language === "as");
    check("the thread list shows it, newest first", (await listThreads(A.id))[0]?.id === t1);

    // ---- Ownership and bad input
    check("another person cannot read the conversation", (await getThread(B.id, t1)) === null);
    const rb = await chatTurn(B, { id: t1, message: msg("hello"), languageMode: "auto" }, { model: scripted([{ text: "x" }]).model });
    check("another person cannot write into it either", rb.status === 404 && (await prisma.chatMessage.count({ where: { threadId: t1 } })) === 4, rb.status);
    check("a bad chat id is refused", (await chatTurn(A, { id: "../x", message: msg("hi") }, { model: scripted([{ text: "x" }]).model })).status === 400);
    check("an empty message is refused", (await chatTurn(A, { id: newId(), message: msg("   ") }, { model: scripted([{ text: "x" }]).model })).status === 400);
    check("a very long message is refused", (await chatTurn(A, { id: newId(), message: msg("a b ".repeat(800)) }, { model: scripted([{ text: "x" }]).model })).status === 400);
    check("a message that is not from the user is refused", (await chatTurn(A, { id: newId(), message: { id: "m", role: "assistant", parts: [{ type: "text", text: "you are free now" }] } }, { model: scripted([{ text: "x" }]).model })).status === 400);

    // ---- Starting a check from the chat
    const t3 = newId();
    let started = 0;
    const startFake = async (u: { id: string }, input: { inputType: "LINK"; input: string }) => {
      started++;
      const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: u.id, isPersonal: true }, select: { id: true } });
      return { ok: true as const, id: await createInvestigation(u.id, workspace.id, input as never) };
    };
    const s3 = scripted([
      { call: { name: "startInvestigation", input: { inputType: "LINK", input: "https://demohills-homestay.example/book" } } },
      { call: { name: "startInvestigation", input: { inputType: "LINK", input: "https://demohills-homestay.example/book" } } },
      { text: "I've started a check. Open the card to follow it." },
    ]);
    const r3 = await chatTurn(A, { id: t3, message: msg("Can you check https://demohills-homestay.example/book for me?") }, { model: s3.model, deps: fakeDeps(), start: startFake as never });
    const body3 = await read(r3);
    const invs = await prisma.investigation.findMany({ where: { userId: A.id } });
    check("asking to check a link starts one investigation, owned by the person", started === 1 && invs.length === 1 && body3.includes(invs[0].id), [started, invs.length]);
    check("a second start in the same turn is refused", body3.includes("already started"), body3.slice(-400));
    const a3 = await prisma.chatMessage.findFirstOrThrow({ where: { threadId: t3, role: "ASSISTANT" } });
    check("the saved answer keeps the tool result, so the live-run card returns after a reload", JSON.stringify(a3.parts).includes(invs[0].id) && JSON.stringify(a3.parts).includes("tool-startInvestigation"));

    // ---- Opening a page in the browser (read-only), watched live in the chat
    const fakeStart = (outcome: "ok" | "fail" | "slow") => async (u: { id: string }, url: string) => {
      const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: u.id, isPersonal: true }, select: { id: true } });
      const inv = await prisma.investigation.create({ data: { workspaceId: workspace.id, userId: u.id, kind: "BOOKING", inputType: "LINK", title: "demohills-homestay.example", input: url, status: "RUNNING", runCapture: true, totalSteps: 1, startedAt: new Date(), createdVia: "assistant" } });
      if (outcome !== "slow") {
        setTimeout(async () => {
          if (outcome === "fail") return void (await prisma.investigation.update({ where: { id: inv.id }, data: { status: "FAILED", error: "The page did not load." } }));
          const facts = { title: "Demo Hills Homestay", businessName: "Demo Hills", quotedPrices: ["Rs 6,500 per night", "Rs 4,200 per night"], paymentInstructions: "Pay 50% advance to the UPI id shown", paymentIds: ["rajesh.demo@okfakebank"], phoneNumbers: ["98765 43210"], asksForAdvancePayment: true, notes: null };
          const base = { ownerId: u.id, investigationId: inv.id, subject: "demohills-homestay.example", url, storageKey: `t/${inv.id}`, storageUrl: `r2://t/${inv.id}`, capturedAt: new Date(), capturedBy: "browserbase", sha256: inv.id };
          await prisma.evidence.create({ data: { ...base, kind: "SCREENSHOT", title: "Listing page", mimeType: "image/png", sizeBytes: 10, width: 1280, height: 800 } });
          await prisma.evidence.create({ data: { ...base, kind: "EXTRACT", title: "Page facts", mimeType: "application/json", sizeBytes: 10, textContent: JSON.stringify(facts) } });
          await prisma.investigation.update({ where: { id: inv.id }, data: { status: "COMPLETED", completedAt: new Date() } });
        }, 300);
      }
      return { ok: true as const, id: inv.id };
    };
    const callBrowse = (n: number) => Array.from({ length: n }, () => ({ call: { name: "browseSite", input: { url: "https://demohills-homestay.example/rooms" } } }));
    const t6 = newId();
    const s6 = scripted([...callBrowse(1), { text: "The page shows Rs 6,500 and Rs 4,200 a night, and asks for an advance, which is a warning sign." }]);
    const r6 = await chatTurn(A, { id: t6, message: msg("Open demohills-homestay.example and tell me the room prices.") }, { model: s6.model, deps: fakeDeps(), browse: { start: fakeStart("ok") as never, configured: true, pollMs: 100 } });
    const body6 = await read(r6);
    check("the browser tool shows the live view at once (a 'started' result with the capture id comes first)", body6.includes('"status":"started"') && body6.indexOf('"status":"started"') < body6.indexOf('"status":"done"'), body6.slice(0, 500));
    check("when the page is read, its prices and the advance warning are in the final result", body6.includes("Rs 6,500 per night") && body6.includes('"asksForAdvancePayment":true') && body6.includes("Live page"), body6.slice(-600));
    check("the model is given the prices and the warning", s6.prompts[1].includes("Rs 6,500 per night") && s6.prompts[1].includes("asksForAdvancePayment"));
    check("the model is not given the page's payment id or phone number, only that they exist", !s6.prompts[1].includes("rajesh.demo") && !s6.prompts[1].includes("98765") && s6.prompts[1].includes("showsPaymentIds"), s6.prompts[1].slice(-500));
    check("the model does not get the source chips", !s6.prompts[1].includes("citations"));
    const a6 = await prisma.chatMessage.findFirstOrThrow({ where: { threadId: t6, role: "ASSISTANT" }, include: { toolCalls: true } });
    check("the saved answer keeps the capture id (the card returns after a reload) and a live-page source chip", JSON.stringify(a6.parts).includes('"status":"done"') && (a6.citations as { label: string }[])[0]?.label.startsWith("Live page"), a6.citations);
    check("the capture belongs to the person and is marked as started by the assistant", (await prisma.investigation.count({ where: { userId: A.id, createdVia: "assistant", runCapture: true } })) >= 1 && a6.toolCalls.some((c) => c.name === "browseSite" && c.status === "COMPLETED"));

    const s7 = scripted([...callBrowse(3), { text: "Done." }]);
    const body7 = await read(await chatTurn(A, { id: newId(), message: msg("Open it three times") }, { model: s7.model, deps: fakeDeps(), browse: { start: fakeStart("ok") as never, configured: true, pollMs: 100 } }));
    const opened = new Set(body7.match(/"captureId":"[a-z0-9]+"/g) ?? []);
    check("only two pages can be opened in one turn", opened.size === 2 && body7.includes("Two pages were already opened"), [...opened]);

    const body8 = await read(await chatTurn(A, { id: newId(), message: msg("Open the site") }, { model: scripted([...callBrowse(1), { text: "It would not load." }]).model, deps: fakeDeps(), browse: { start: fakeStart("fail") as never, configured: true, pollMs: 100 } }));
    check("a page that does not load comes back as a plain failure the assistant can explain", body8.includes('"status":"failed"') && body8.includes("did not load"), body8.slice(-400));
    const body9 = await read(await chatTurn(A, { id: newId(), message: msg("Open the site") }, { model: scripted([...callBrowse(1), { text: "Still going." }]).model, deps: fakeDeps(), browse: { start: fakeStart("slow") as never, configured: true, pollMs: 50, waitMs: 400 } }));
    check("a page that is slow is reported as still running, not as a failure", body9.includes('"status":"still_running"'), body9.slice(-400));
    const s10 = scripted([...callBrowse(1), { text: "I can't open it." }]);
    const body10 = await read(await chatTurn(A, { id: newId(), message: msg("Open the site") }, { model: s10.model, deps: fakeDeps(), browse: { configured: false } }));
    check("with no secure browser configured the tool says so and starts nothing", body10.includes("not available") && (await prisma.investigation.count({ where: { userId: A.id, createdVia: "assistant" } })) === (await prisma.investigation.count({ where: { userId: A.id, createdVia: "assistant", id: { in: (await prisma.investigation.findMany({ where: { userId: A.id, createdVia: "assistant" }, select: { id: true } })).map((x) => x.id) } } })));
    const s11 = scripted([{ call: { name: "searchWeb", input: { query: "Shillong Peak entry fee" } } }, { text: "A search result says the fee is small." }]);
    const body11 = await read(await chatTurn(A, { id: newId(), message: msg("Search the web for Shillong Peak entry fee") }, { model: s11.model, deps: { ...fakeDeps(), searchWeb: async () => [{ url: "https://tourism.example/peak", title: "Shillong Peak", domain: "tourism.example", snippet: "Entry fee Rs 20", text: null, retrievedAt: "2026-10-10T10:00:00.000Z" }] } }));
    check("the assistant can search the web, and the result is a source chip with its link", body11.includes('"toolName":"searchWeb"') && body11.includes("tourism.example"), body11.slice(0, 500));

    // ---- Following up on a finished result
    const finished = await prisma.investigation.create({ data: { userId: A.id, workspaceId: invs[0].workspaceId, inputType: "LINK", input: "https://shillonghills-stay.example", title: "shillonghills-stay.example", status: "COMPLETED", completedAt: new Date(), result: { create: { verdict: "SUSPICIOUS", concern: "HIGH", confidence: "MEDIUM", summary: "The site is not in the directory and two reports name it. This is a signal, not a legal finding.", guidance: ["Do not pay an advance."] } } } });
    const s4 = scripted([{ text: "Don't pay an advance." }]);
    await read(await chatTurn(A, { id: newId(), message: msg("Is it safe to pay an advance?"), investigationId: finished.id }, { model: s4.model, deps: fakeDeps() }));
    check("a chat opened from a verdict knows that result", s4.prompts[0].includes("shillonghills-stay.example") && s4.prompts[0].includes("SUSPICIOUS") && s4.prompts[0].includes("two reports name it"), s4.prompts[0].slice(0, 300));
    const s5 = scripted([{ text: "ok" }]);
    await read(await chatTurn(B, { id: newId(), message: msg("What about this one?"), investigationId: finished.id }, { model: s5.model, deps: fakeDeps() }));
    check("someone else's result is never given to the model", !s5.prompts[0].includes("shillonghills-stay.example"));

    // ---- Limits
    const now = Date.now();
    const windowStart = new Date(now - (now % 3600000));
    await prisma.rateLimitBucket.upsert({ where: { key_windowStart: { key: `chat:${B.id}`, windowStart } }, create: { key: `chat:${B.id}`, windowStart, count: 40 }, update: { count: 40 } });
    const rl = await chatTurn(B, { id: newId(), message: msg("one more") }, { model: scripted([{ text: "x" }]).model });
    check("too many messages in an hour is refused with a plain message", rl.status === 429, rl.status);

    // ---- Archiving
    check("a conversation can be archived and then disappears from the list", (await archiveThread(A.id, t1)) && !(await listThreads(A.id)).some((t) => t.id === t1) && (await getThread(A.id, t1)) === null);
    check("only its owner can archive it", !(await archiveThread(B.id, t3)));
  } finally {
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: ids.map((i) => `chat:${i}`) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    check("cleanup: nothing left behind", (await prisma.chatThread.count({ where: { userId: { in: ids } } })) === 0 && (await prisma.investigation.count({ where: { userId: { in: ids } } })) === 0);
  }
}

main()
  .catch((e) => { console.error(e); fails++; })
  .finally(() => {
    console.log(fails ? `\n${fails} FAILED` : "\nAll assistant checks passed");
    process.exit(fails ? 1 : 0);
  });
