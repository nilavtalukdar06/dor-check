import { describe, expect, it } from "vitest";
import { withRetry, withTimeout, TimeoutError } from "./retry";
import { hostOf, isAllowedSource, isDeniedDomain, isSafePublicUrl, truncateToBudget } from "./research-policy";

describe("isSafePublicUrl", () => {
  it.each([
    "https://example.com/page",
    "http://www.tourism-board.example/directory?q=1",
    "https://sub.domain.co.in:8443/x",
  ])("accepts %s", (u) => expect(isSafePublicUrl(u)).toBe(true));

  it.each([
    "ftp://example.com/file",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hi",
    "not a url",
    "http://localhost:3000/admin",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://172.16.4.1/",
    "http://172.32.0.1/x".replace("172.32", "172.20"),
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://intranet/",
    "http://printer.local/",
    "http://db.internal/",
    "https://user:pass@example.com/",
  ])("rejects %s", (u) => expect(isSafePublicUrl(u)).toBe(false));

  it("accepts public IPs just outside the private ranges", () => {
    expect(isSafePublicUrl("http://172.32.0.1/")).toBe(true);
    expect(isSafePublicUrl("http://8.8.8.8/")).toBe(true);
  });
});

describe("denied domains", () => {
  it("blocks social sites and their subdomains", () => {
    expect(isDeniedDomain("facebook.com")).toBe(true);
    expect(isDeniedDomain("m.facebook.com")).toBe(true);
    expect(isDeniedDomain("www.instagram.com")).toBe(true);
    expect(isDeniedDomain("notfacebook.com")).toBe(false);
  });
  it("isAllowedSource combines both checks", () => {
    expect(isAllowedSource("https://cabbazar.com/x")).toBe(true);
    expect(isAllowedSource("https://www.facebook.com/page")).toBe(false);
    expect(isAllowedSource("http://192.168.0.1/")).toBe(false);
  });
  it("hostOf strips www", () => {
    expect(hostOf("https://WWW.Uber.com/in")).toBe("uber.com");
    expect(hostOf("junk")).toBe("");
  });
});

describe("truncateToBudget", () => {
  it("leaves short text alone", () => {
    expect(truncateToBudget("hello", 100)).toBe("hello");
  });
  it("cuts long text near the budget", () => {
    const out = truncateToBudget("word ".repeat(5000), 100);
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out.endsWith("…")).toBe(true);
  });
  it("prefers a paragraph boundary", () => {
    const text = `${"a".repeat(300)}\n\n${"b".repeat(300)}`;
    expect(truncateToBudget(text, 100)).toBe(`${"a".repeat(300)}…`);
  });
});

describe("withRetry and withTimeout", () => {
  it("retries until it succeeds", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("flaky");
        return "ok";
      },
      { retries: 2, baseDelayMs: 1 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });
  it("gives up after the retries and throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error(`fail ${calls}`);
      }, { retries: 1, baseDelayMs: 1 }),
    ).rejects.toThrow("fail 2");
  });
  it("does not retry errors that will not recover", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("401 unauthorized");
      }, { retries: 3, baseDelayMs: 1, shouldRetry: (e) => !/401/.test(String(e)) }),
    ).rejects.toThrow("401");
    expect(calls).toBe(1);
  });
  it("times out a slow attempt", async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 200)), 20)).rejects.toBeInstanceOf(TimeoutError);
  });
});
