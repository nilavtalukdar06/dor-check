import type { PickedGeoInput, PriceCheckInput, PriceService } from "@/lib/price-schema";

// Shared by the server page (to refill the form) and the client form.

export type PriceFormValues = {
  service: PriceService;
  origin: string;
  originPlaceId: string;
  originGeo: PickedGeoInput | null;
  destination: string;
  destinationPlaceId: string;
  destinationGeo: PickedGeoInput | null;
  vehicle: string;
  location: string;
  locationPlaceId: string;
  locationGeo: PickedGeoInput | null;
  qualifier: string;
  quoted: string;
};

export const emptyValues: PriceFormValues = {
  service: "TAXI",
  origin: "",
  originPlaceId: "",
  originGeo: null,
  destination: "",
  destinationPlaceId: "",
  destinationGeo: null,
  vehicle: "SEDAN",
  location: "",
  locationPlaceId: "",
  locationGeo: null,
  qualifier: "",
  quoted: "",
};

/** Form values from a saved request (used when reopening a check). */
export function formValuesFrom(input: PriceCheckInput | null, fallbackQuoted: string): Partial<PriceFormValues> {
  if (!input) return {};
  return {
    service: input.service,
    origin: input.origin ?? "",
    originPlaceId: input.originPlaceId ?? "",
    originGeo: input.originGeo ?? null,
    destination: input.destination ?? "",
    destinationPlaceId: input.destinationPlaceId ?? "",
    destinationGeo: input.destinationGeo ?? null,
    vehicle: input.vehicle ?? "SEDAN",
    location: input.location ?? input.district ?? "",
    locationPlaceId: input.locationPlaceId ?? "",
    locationGeo: input.locationGeo ?? null,
    qualifier: input.qualifier ?? "",
    quoted: fallbackQuoted,
  };
}

