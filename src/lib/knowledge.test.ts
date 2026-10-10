import { describe, expect, it } from "vitest";
import {
  advisoryDraft,
  batches,
  buildRecords,
  chunkText,
  CHUNK_TOKENS,
  draftHash,
  estimateTokens,
  propertyDraft,
  redactContacts,
  reportDraft,
  tariffDraft,
  type TariffInput,
} from "./knowledge";

const taxi: TariffInput = {
  id: "t1",
  serviceType: "TAXI",
  vehicle: "SEDAN",
  qualifier: null,
  unit: "PER_TRIP",
  lowInr: 2200,
  highInr: 3000,
  distanceKm: "98",
  durationMin: 165,
  via: "NH 6",
  nightSurchargePct: 20,
  sourceLabel: "Demo tariff",
  sourceUrl: null,
  effectiveOn: new Date("2026-10-07T00:00:00Z"),
  basis: "curated",
  originName: "Guwahati airport",
  destinationName: "Shillong, Police Bazar",
  districtId: null,
  districtName: null,
};

describe("chunkText", () => {
  it("keeps short text as one chunk and drops empty text", () => {
    expect(chunkText("A short note.")).toEqual(["A short note."]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("splits long text under the token limit, with overlap, losing nothing", () => {
    const sentences = Array.from(
      { length: 120 },
      (_, i) =>
        `Sentence number ${i} says the fare is Rs ${1000 + i} per trip.`,
    );
    const chunks = chunkText(sentences.join(" "));
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks)
      expect(estimateTokens(c)).toBeLessThanOrEqual(CHUNK_TOKENS);
    // every sentence appears in some chunk, and neighbours share text
    for (const s of sentences)
      expect(chunks.some((c) => c.includes(s))).toBe(true);
    expect(
      chunks[1].startsWith(
        chunks[0].slice(-60).split(". ").pop()!.slice(0, 10),
      ) ||
        chunks.some((c, i) => i > 0 && chunks[i - 1].includes(c.slice(0, 40))),
    ).toBe(true);
  });

  it("cuts a single enormous sentence by length instead of looping or exceeding the limit", () => {
    const chunks = chunkText("word ".repeat(5000));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks)
      expect(estimateTokens(c)).toBeLessThanOrEqual(CHUNK_TOKENS);
  });

  it("splits paragraphs and keeps their order", () => {
    const paras = Array.from(
      { length: 12 },
      (_, i) => `Paragraph ${i}. ${"Detail sentence here. ".repeat(40)}`,
    );
    const chunks = chunkText(paras.join("\n\n"));
    const order = paras.map((_, i) =>
      chunks.findIndex((c) => c.includes(`Paragraph ${i}.`)),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("redactContacts", () => {
  it("removes phone numbers, UPI ids and emails", () => {
    const out = redactContacts(
      "Call +91 98765 43210 or 9876543210, pay ravi@okaxis, mail help@seller.example.",
    );
    expect(out).not.toMatch(/9876|ravi@|help@/);
    expect(out).toContain("[phone number]");
    expect(out).toContain("[upi id]");
    expect(out).toContain("[email]");
  });

  it("catches the common ways people write a number", () => {
    for (const n of [
      "98765 43210",
      "98765-43210",
      "+91-9876543210",
      "09876543210",
      "919876543210",
      "9876543210,",
      "(9876543210)",
      "+44 7911 123456",
    ]) {
      expect(redactContacts(`call ${n} now`), n).toMatch(/\[phone number\]/);
      expect(redactContacts(`call ${n} now`), n).not.toMatch(/987654|7911/);
    }
  });

  it("keeps amounts, years, distances and the 1930 helpline", () => {
    const text =
      "Paid Rs 18,000 on 5 Oct 2026 for a 98 km trip; helpline 1930 123456; fares Rs 2200 3000; ref 5000000000.";
    expect(redactContacts(text)).toBe(text);
  });
});

describe("document builders", () => {
  it("writes a taxi tariff a person would search for", () => {
    const d = tariffDraft(taxi);
    expect(d.text).toMatch(
      /sedan.*Guwahati airport to Shillong, Police Bazar.*Rs 2,200 to Rs 3,000 per trip/,
    );
    expect(d.text).toMatch(/98 km, about 2 h 45 m/);
    expect(d.text).toMatch(/reverse direction/);
    expect(d.text).toMatch(/night surcharge of 20%/);
    expect(d.text).toMatch(/Source: Demo tariff, effective 7 Oct 2026/);
    expect(d.url).toBe("/price?service=TAXI&place=Guwahati+airport");
    expect(
      tariffDraft({ ...taxi, sourceUrl: "https://tariffs.example/sheet" }).url,
    ).toBe("https://tariffs.example/sheet");
    expect(d.externalKey).toBe("tariff:t1");
    expect(d.links.benchmarkId).toBe("t1");
  });

  it("writes stay and guide tariffs by place", () => {
    const d = tariffDraft({
      ...taxi,
      serviceType: "STAY",
      vehicle: null,
      qualifier: "Homestay",
      unit: "PER_NIGHT",
      lowInr: 1500,
      highInr: 2500,
      originName: null,
      destinationName: null,
      districtName: "Majuli",
    });
    expect(d.text).toMatch(/homestay.*Majuli.*Rs 1,500 to Rs 2,500 per night/);
  });

  it("never puts contact details in a directory entry", () => {
    const d = propertyDraft({
      id: "p1",
      slug: "hotel-x",
      name: "Hotel X",
      type: "STAY",
      description: "Call 9876543210 or pay hotelx@okicici for rooms",
      domain: "hotel-x.example",
      tags: ["river view"],
      verified: true,
      districtId: "d1",
      districtName: "Kaziranga",
      updatedAt: new Date(),
    });
    expect(d.text).not.toMatch(/9876|hotelx@/);
    expect(d.text).toMatch(/verified in the directory/);
    expect(d.url).toBe("/directory?property=hotel-x");
  });

  it("labels reports as not verified and leaves out the reporter, contact details and web address", () => {
    const d = reportDraft({
      id: "r1",
      reference: "TTD-1",
      category: "TOUR",
      summary: "Tour page vanished after payment",
      description:
        "Paid advance to ravi@okaxis, phone 9876543210 stopped working.",
      locationText: "Jorhat",
      status: "NEW",
      amountInr: 18000,
      districtId: "d1",
      districtName: "Jorhat",
      incidentAt: null,
      createdAt: new Date(),
    });
    expect(d.text).toMatch(/\(not verified\)/);
    expect(d.text).not.toMatch(/ravi@|9876/);
    expect(d.text).toMatch(/Rs 18,000/);
    expect(d.text).not.toMatch(/https?:/);
    expect(d.url).toBeNull();
    expect(d.extra).toMatchObject({ status: "NEW", reference: "TTD-1" });
  });

  it("builds an advisory even when it has no body", () => {
    const d = advisoryDraft({
      id: "a1",
      title: "Fake booking pages near Shillong",
      body: null,
      kind: "ADVISORY",
      label: "Demo advisory",
      sourceUrl: null,
      districtId: "d",
      districtName: "Shillong",
      publishedAt: new Date("2026-10-08"),
    });
    expect(d.text).toMatch(/^Fake booking pages near Shillong\./);
    expect(d.text).toMatch(/Demo advisory for Shillong/);
  });
});

describe("hashing and records", () => {
  it("changes the hash only when indexed content changes", () => {
    const a = tariffDraft(taxi);
    expect(draftHash(a)).toBe(draftHash(tariffDraft(taxi)));
    expect(draftHash(a)).not.toBe(
      draftHash(tariffDraft({ ...taxi, highInr: 3100 })),
    );
  });

  it("builds Pinecone records with stable ids, embedded text and no null fields", () => {
    const at = new Date("2026-10-10T00:00:00Z");
    const recs = buildRecords(
      {
        id: "doc1",
        title: "T",
        url: null,
        docType: "tariff",
        districtName: null,
        language: null,
        retrievedAt: at,
        extra: { service: "TAXI", lowInr: 1 },
      },
      { id: "s1", name: "Tariffs" },
      ["a", "b"],
    );
    expect(recs.map((r) => r._id)).toEqual(["doc1:0", "doc1:1"]);
    expect(recs[0]).toMatchObject({
      text: "a",
      type: "tariff",
      source: "Tariffs",
      sourceId: "s1",
      docId: "doc1",
      service: "TAXI",
      retrievedTs: at.getTime(),
      language: "en",
    });
    for (const r of recs)
      for (const v of Object.values(r)) expect(v).not.toBeNull();
    expect("url" in recs[0]).toBe(false);
    expect("district" in recs[0]).toBe(false);
  });

  it("batches", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 3)).toEqual([]);
  });
});
