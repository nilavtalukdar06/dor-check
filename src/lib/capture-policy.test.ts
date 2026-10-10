import { describe, expect, it } from "vitest";
import { looksLikePaymentStep } from "./capture-policy";

describe("looksLikePaymentStep", () => {
  it.each([
    "https://stay.example/checkout",
    "https://stay.example/booking/confirm",
    "https://stay.example/pay?id=1",
    "https://stay.example/Payment",
    "https://stay.example/#/upi",
    "https://stay.example/reserve-now",
  ])("flags %s", (u) => expect(looksLikePaymentStep(u)).toBe(true));

  it.each(["https://stay.example/", "https://stay.example/rooms/standard", "https://stay.example/about", "not a url"])(
    "leaves %s alone",
    (u) => expect(looksLikePaymentStep(u)).toBe(false),
  );
});
