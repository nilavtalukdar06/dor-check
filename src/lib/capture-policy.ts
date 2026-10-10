// What the browser may do while capturing evidence. It only reads: it never types into a
// form, submits anything or clicks a pay or confirm button.

/** Words in a URL path that suggest a payment or booking step. */
const PAYMENT_PATH = /(pay|payment|checkout|book|booking|reserve|confirm|order|invoice|upi)/i;

export function looksLikePaymentStep(url: string) {
  try {
    const u = new URL(url);
    return PAYMENT_PATH.test(u.pathname) || PAYMENT_PATH.test(u.hash);
  } catch {
    return false;
  }
}

/** Instruction given to the model that reads the page. It can only describe what it sees. */
export const READ_ONLY_INSTRUCTION =
  "Read what is visible on this page. Do not click, type, scroll or submit anything. " +
  "Report only what is written on the page; leave a field empty if it is not there.";

/** Payment methods and contacts the page asks for; used as evidence, never acted on. */
export type PageFacts = {
  title: string | null;
  businessName: string | null;
  quotedPrices: string[];
  paymentInstructions: string | null;
  paymentIds: string[];
  phoneNumbers: string[];
  asksForAdvancePayment: boolean;
  notes: string | null;
};
