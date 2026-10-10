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

/** What the second field means for each service. */
export const QUALIFIER_LABELS: Record<Exclude<PriceService, "TAXI">, string> = {
  STAY: "Room type",
  GUIDE: "Duration",
  TOUR: "Package",
};

const text = z.string().trim().min(1).max(120);

/** A place picked from Mapbox suggestions. The server only trusts it inside north-east India. */
export const pickedGeoSchema = z.object({
  mapboxId: z.string().min(1).max(300),
  name: z.string().min(1).max(200),
  detail: z.string().max(300).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  kind: z.string().max(30).optional(),
});
export type PickedGeoInput = z.infer<typeof pickedGeoSchema>;

/** Shared by the form, the server action and POST /api/price. */
export const priceCheckSchema = z
  .object({
    service: z.enum(PRICE_SERVICES),
    quotedInr: z
      .number({ error: "Enter the quoted price in rupees" })
      .int("Use whole rupees")
      .positive("The price must be more than zero")
      .max(10_000_000, "That price is too large"),
    // Taxi
    origin: text.optional(),
    originPlaceId: z.string().max(40).optional(),
    originGeo: pickedGeoSchema.optional(),
    destination: text.optional(),
    destinationPlaceId: z.string().max(40).optional(),
    destinationGeo: pickedGeoSchema.optional(),
    vehicle: text.optional(),
    // Stay, guide, tour: any place or area
    location: text.optional(),
    locationPlaceId: z.string().max(40).optional(),
    locationGeo: pickedGeoSchema.optional(),
    qualifier: text.optional(),
    /** Older callers send a district name or id instead of a location. */
    district: text.optional(),
    districtId: z.string().max(40).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.service === "TAXI") {
      if (!v.origin) ctx.addIssue({ code: "custom", path: ["origin"], message: "Enter where the trip starts" });
      if (!v.destination) ctx.addIssue({ code: "custom", path: ["destination"], message: "Enter where the trip ends" });
    } else if (!v.location && !v.district && !v.districtId) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "Enter a place or area" });
    }
  });

export type PriceCheckInput = z.infer<typeof priceCheckSchema>;

/** "Rs 4,800", "4800.0" and "4,800" all become 4800. Returns NaN when it is not a number. */
export function parseRupees(raw: string) {
  const cleaned = raw.replace(/rs\.?|inr|₹|,|\s/gi, "");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}
