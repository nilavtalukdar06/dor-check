"use client";

import { useState } from "react";
import { PlaceInput } from "@/components/price/place-input";
import type { PlaceSuggestion } from "@/server/geocoding";

/** Search a place and use it as the map pin. Shows the coordinates it set; they can be cleared. */
export function PinPicker({ lat, lng, onChange, popular, id }: { lat: number | null; lng: number | null; onChange: (pin: { lat: number; lng: number; placeId?: string } | null) => void; popular: PlaceSuggestion[]; id?: string }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-1.5">
      <PlaceInput
        id={id}
        value={text}
        popular={popular}
        placeholder="Search a town, locality or landmark"
        onChange={(t, pick) => {
          setText(t);
          if (pick?.at) onChange({ ...pick.at, placeId: pick.placeId });
        }}
      />
      <p className="text-[13px] text-muted-foreground" data-testid="pin-value">
        {lat !== null && lng !== null ? (
          <>
            Pin at {lat.toFixed(4)}, {lng.toFixed(4)}.{" "}
            <button type="button" className="underline" onClick={() => onChange(null)}>Clear</button>
          </>
        ) : (
          "No pin yet: pick a place so it shows on the map."
        )}
      </p>
    </div>
  );
}
