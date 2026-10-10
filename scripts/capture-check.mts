// Live check of the capture module: a real Browserbase session, Stagehand, R2 and the database.
// Uses a little Browserbase time and a few Gemini tokens. Cleans up its rows and files.
import prismaModule from "../src/lib/prisma";
// An ES module importing a CommonJS default export gets it wrapped one level deeper.
const prisma = ((prismaModule as unknown as { default?: typeof prismaModule }).default ?? prismaModule) as typeof prismaModule;
import { capturePage } from "../src/server/capture";
import { deleteObject, keyFromRef, signedUrl } from "../src/server/storage";

let fails = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + JSON.stringify(extra)}`);
  if (!ok) fails++;
};

async function main() {
  const user = await prisma.user.create({ data: { clerkId: `capture_${Date.now()}`, email: "ttd-e2e-capture@example.com", name: "Capture test" } });
  const inv = await prisma.investigation.create({
    data: {
      workspaceId: (await prisma.workspace.create({ data: { ownerId: user.id } })).id,
      userId: user.id, title: "example.com", input: "https://example.com", status: "RUNNING",
    },
  });
  const keys: string[] = [];
  try {
    const bad = await capturePage("http://169.254.169.254/latest/meta-data", { userId: user.id, workspaceId: null, investigationId: inv.id, subject: "x" });
    check("a private address is refused before any browser starts", !bad.ok && bad.reason === "unsafe_url" && bad.sessionId === null, bad);

    const events: string[] = [];
    let sessionSeen: string | null = null;
    const t = Date.now();
    const res = await capturePage("https://example.com", {
      userId: user.id, workspaceId: null, investigationId: inv.id, subject: "Example Domain",
      onSession: (s) => { sessionSeen = s; },
      emit: (type) => { events.push(type); },
    });
    console.log(`  captured in ${Date.now() - t} ms`);
    check("capture succeeds", res.ok, res);
    if (!res.ok) return;
    check("the session id was reported as soon as the browser existed", !!sessionSeen && sessionSeen === res.sessionId, sessionSeen);
    check("progress events in order: starting, session, navigating, navigated, captured", ["browser_starting", "browser_session_started", "page_navigating", "page_navigated", "page_captured"].every((e, i) => events.indexOf(e) === i), events);
    check("final URL and title come back", res.finalUrl.startsWith("https://example.com") && res.pageTitle === "Example Domain", [res.finalUrl, res.pageTitle]);

    const rows = await prisma.evidence.findMany({ where: { investigationId: inv.id }, orderBy: { capturedAt: "asc" } });
    rows.forEach((r) => { const k = keyFromRef(r.storageUrl); if (k) keys.push(k); });
    const shot = rows.find((r) => r.kind === "SCREENSHOT");
    check("a screenshot Evidence row: 1280x800 PNG, timestamped, from browserbase, with hash and session", !!shot && shot.width === 1280 && shot.height === 800 && shot.mimeType === "image/png" && shot.capturedBy === "browserbase" && !!shot.sha256 && shot.browserSessionId === res.sessionId && Date.now() - shot.capturedAt.getTime() < 120_000, shot);
    check("it is private: stored as an r2: reference, not a public URL", !!shot && shot.storageUrl.startsWith("r2:") && !shot.storageUrl.startsWith("http"), shot?.storageUrl);
    const link = shot ? await signedUrl(keyFromRef(shot.storageUrl)!) : "";
    const img = await fetch(link);
    check("a signed link serves the PNG", img.status === 200 && img.headers.get("content-type") === "image/png" && (await img.arrayBuffer()).byteLength === shot?.sizeBytes, img.status);
    const unsigned = await fetch(link.split("?")[0]);
    check("the same URL without its signature is refused", unsigned.status === 403 || unsigned.status === 400 || unsigned.status === 401, unsigned.status);
    const facts = rows.find((r) => r.kind === "EXTRACT");
    check("a page-facts EXTRACT row with the text that was read", !!facts && /Example Domain/.test(facts.textContent ?? "") && res.facts?.asksForAdvancePayment === false, facts?.textContent?.slice(0, 120));

    const dead = await capturePage("https://this-domain-does-not-exist-ttd.example", { userId: user.id, workspaceId: null, investigationId: inv.id, subject: "dead" });
    check("an unreachable page is a recorded failure, not a crash", !dead.ok && dead.reason === "navigation_failed" && !!dead.sessionId, dead);
    const after = await prisma.evidence.count({ where: { investigationId: inv.id } });
    check("a failed capture leaves no evidence behind", after === rows.length, after);
  } finally {
    for (const k of keys) await deleteObject(k).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } });
  }
  console.log(fails ? `\n${fails} FAILED` : "\nAll capture checks passed");
  process.exitCode = fails ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
