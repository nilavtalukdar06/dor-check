import { describe, expect, it } from "vitest";
import { domainName, extractIdentifiers, lookalikeOf, normalizeDomain, normalizePhone, phoneVariants, similarity } from "./identifiers";

describe("normalising", () => {
  it("reduces a link to its domain", () => {
    expect(normalizeDomain("https://www.Demohills-Homestay-Booking.example/book?x=1")).toBe("demohills-homestay-booking.example");
    expect(normalizeDomain("shillonghills-homestay.example/rooms")).toBe("shillonghills-homestay.example");
  });
  it("reduces a phone number to ten digits, or null", () => {
    for (const p of ["+91 98765 43210", "09876543210", "98765-43210", "919876543210"]) expect(normalizePhone(p)).toBe("9876543210");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
    expect(phoneVariants("9876543210")).toEqual(["9876543210", "919876543210"]);
  });
});

describe("extractIdentifiers", () => {
  it("finds a link, a phone, a UPI id and an email in a pasted message", () => {
    const got = extractIdentifiers("Book at https://demohills-homestay-booking.example/book. Pay advance to ravi.k@okaxis or call +91 98765 43210. Mail info@demohills-homestay-booking.example");
    expect(got.urls).toEqual(["https://demohills-homestay-booking.example/book"]);
    expect(got.domains).toEqual(["demohills-homestay-booking.example"]);
    expect(got.phones).toEqual(["9876543210"]);
    expect(got.upis).toEqual(["ravi.k@okaxis"]);
    expect(got.emails).toEqual(["info@demohills-homestay-booking.example"]);
  });
  it("finds a bare domain with no scheme", () => {
    expect(extractIdentifiers("is shillonghills-homestay.example legit?").domains).toEqual(["shillonghills-homestay.example"]);
  });
  it("does not mistake an email's domain, an amount or a plain word for a site", () => {
    const got = extractIdentifiers("Rs 18,000 advance, mail me at a@b.com, ref 1930, hotel in Shillong.");
    expect(got.domains).toEqual([]);
    expect(got.phones).toEqual([]);
    expect(got.upis).toEqual([]);
  });
});

describe("look-alike domains", () => {
  it("names the business, ignoring generic words", () => {
    expect(domainName("shillonghills-homestay.example")).toBe("shillonghills");
    expect(domainName("www.demohills-homestay-booking.example")).toBe("demohills");
    expect(domainName("booking.example")).toBe("booking");
  });
  it("scores similar and different names", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("shillonghills", "shillonghill")).toBeGreaterThan(0.8);
    expect(similarity("shillonghills", "demohills")).toBeLessThan(0.5);
    expect(similarity("shillonghills", "kazirangalodge")).toBeLessThan(0.2);
  });
  it("flags a close name that is not the registered domain, and ignores the registered one itself", () => {
    const registered = ["shillonghills-homestay.example", "kaziranga-junglelodge.example"];
    expect(lookalikeOf("shillonghill-stay-booking.example", registered)?.domain).toBe("shillonghills-homestay.example");
    expect(lookalikeOf("shillonghills-homestay.example", registered)).toBeNull();
    expect(lookalikeOf("totally-different.example", registered)).toBeNull();
  });
});
