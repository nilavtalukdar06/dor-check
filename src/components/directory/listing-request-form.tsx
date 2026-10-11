"use client";

import { CheckCircle2Icon, FileUpIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { requestListingAction } from "@/app/(app)/directory/actions";
import { EMPTY_PROPERTY, PropertyForm, toPropertyInput } from "@/components/moderation/property-form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MAX_UPLOAD_BYTES } from "@/lib/evidence";
import type { PlaceSuggestion } from "@/server/geocoding";

/** A business asks to be listed. A moderator checks it before it appears anywhere. */
export function ListingRequestForm({ districts, popular }: { districts: { id: string; name: string }[]; popular: PlaceSuggestion[] }) {
  const [doc, setDoc] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const upload = async (file: File) => {
    setUploadError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setUploadError("That file is larger than 8 MB.");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", `Listing document: ${file.name}`.slice(0, 80));
      const res = await fetch("/api/evidence/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) return setUploadError(data.error ?? "The upload failed.");
      setDoc({ id: data.id, name: file.name });
    } catch {
      setUploadError("The upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-ok-border bg-ok-soft p-6" role="status" data-testid="request-sent">
        <CheckCircle2Icon className="size-5 text-ok" aria-hidden />
        <h2 className="text-lg font-semibold">Request sent</h2>
        <p className="text-sm">A moderator will check the details (registration, website, phone and UPI id) before the business is listed. You will get a notification either way.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/directory" />}>Back to the directory</Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
      <PropertyForm
        initial={EMPTY_PROPERTY}
        districts={districts}
        popular={popular}
        submitLabel="Send request"
        onSubmit={async (v) => {
          const r = await requestListingAction({ ...toPropertyInput(v), documentEvidenceId: doc?.id });
          if (r.ok) setSent(true);
          return r;
        }}
        extra={
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Supporting document (optional)</span>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed bg-soft px-3 py-3 text-sm text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50">
              {uploading ? <Spinner /> : <FileUpIcon className="size-4" aria-hidden />}
              <span>{doc ? `Attached: ${doc.name}` : "Registration certificate or licence: PDF or image, up to 8 MB"}</span>
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} data-testid="listing-document" />
            </label>
            {uploadError ? <p role="alert" className="text-[13px] text-danger">{uploadError}</p> : <p className="text-[13px] text-muted-foreground">Only moderators can open it.</p>}
          </div>
        }
      />
    </div>
  );
}
