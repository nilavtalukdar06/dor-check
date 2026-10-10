import { z } from "zod";

export const PRICE_SERVICES = ["TAXI", "STAY", "GUIDE", "TOUR"] as const;
export type PriceService = (typeof PRICE_SERVICES)[number];

export const SERVICE_LABELS: Record<PriceService, string> = {
  TAXI: "Taxi",
  STAY: "Stay",
  GUIDE: "Guide",
  TOUR: "Tour",
};

export const VEHICLES = [
  { value: "SEDAN", label: "Sedan" },
  { value: "SUV", label: "SUV" },
  { value: "HATCHBACK", label: "Hatchback" },
  { value: "SHARED", label: "Shared seat" },
] as const;

export const UNIT_LABELS: Record<string, string> = {
  PER_TRIP: "per trip",
  PER_NIGHT: "per night",
  PER_DAY: "per day",
  PER_PERSON: "per person",
};

/** What the second dropdown means for each service. */
export const QUALIFIER_LABELS: Record<Exclude<PriceService, "TAXI">, string> = {
  STAY: "Room type",
  GUIDE: "Duration",
  TOUR: "Package",
};

const text = z.string().trim().min(1).max(120);

/** Shared by the form, the server action and POST /api/price. */
export const priceCheckSchema = z
  .object({
    service: z.enum(PRICE_SERVICES),
    quotedInr: z
      .number({ error: "Enter the quoted price in rupees" })
      .int("Use whole rupees")
      .positive("The price must be more than zero")
      .max(10_000_000, "That price is too large"),
    origin: text.optional(),
    originPlaceId: z.string().max(40).optional(),
    destination: text.optional(),
    destinationPlaceId: z.string().max(40).optional(),
    vehicle: text.optional(),
    districtId: z.string().max(40).optional(),
    district: text.optional(),
    qualifier: text.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.service === "TAXI") {
      if (!v.origin) ctx.addIssue({ code: "custom", path: ["origin"], message: "Enter where the trip starts" });
      if (!v.destination) ctx.addIssue({ code: "custom", path: ["destination"], message: "Enter where the trip ends" });
    } else if (!v.district && !v.districtId) {
      ctx.addIssue({ code: "custom", path: ["district"], message: "Choose a district" });
    }
  });

export type PriceCheckInput = z.infer<typeof priceCheckSchema>;

/** "Rs 4,800", "4800.0" and "4,800" all become 4800. Returns NaN when it is not a number. */
export function parseRupees(raw: string) {
  const cleaned = raw.replace(/rs\.?|inr|₹|,|\s/gi, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}
