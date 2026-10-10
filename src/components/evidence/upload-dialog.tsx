"use client";

import { ImageUpIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { evidenceHref, formatBytes, MAX_UPLOAD_BYTES, type EvidenceParams } from "@/lib/evidence";
import { cn } from "@/lib/utils";

const ACCEPT = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] };

function rejectionMessage(rejections: FileRejection[]) {
  const code = rejections[0]?.errors[0]?.code;
  if (code === "file-too-large") return `That file is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  if (code === "file-invalid-type") return "Only PNG, JPEG or WebP images can be uploaded.";
  if (code === "too-many-files") return "Upload one image at a time.";
  return "That file cannot be uploaded.";
}

export function UploadDialog({ params }: { params: Pick<EvidenceParams, "type" | "q" | "capture"> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ file: File; preview: string } | null>(null);
  const file = picked?.file ?? null;
  const preview = picked?.preview ?? null;
  const previewRef = useRef<string | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The preview is an object URL: made when a file is picked, freed when it is replaced or the dialog goes.
  const pick = (next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setPicked(next && previewRef.current ? { file: next, preview: previewRef.current } : null);
  };
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const reset = () => {
    pick(null);
    setTitle("");
    setSubject("");
    setError(null);
    setBusy(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_UPLOAD_BYTES,
    multiple: false,
    disabled: busy,
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) return setError(rejectionMessage(rejected));
      setError(null);
      if (accepted[0]) {
        pick(accepted[0]);
        setTitle((t) => t || accepted[0].name.replace(/\.[^.]+$/, "").slice(0, 80));
      }
    },
  });

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!file) return setError("Choose an image first.");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("title", title);
      body.set("subject", subject);
      const res = await fetch("/api/evidence/upload", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "The upload failed. Please try again.");
        return setBusy(false);
      }
      setOpen(false);
      reset();
      router.replace(evidenceHref({ ...params, item: data.id }), { scroll: false });
      router.refresh();
    } catch {
      setError("The upload failed. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger render={<Button variant="outline" className="h-10 gap-2 px-4 shadow-xs" />}>
        <UploadIcon data-icon="inline-start" />
        Upload
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload evidence</DialogTitle>
          <DialogDescription>A screenshot or photo, such as a chat or a payment request. PNG, JPEG or WebP, up to 8 MB. It stays private to you.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div
            {...getRootProps()}
            className={cn(
              "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-soft p-4 text-center text-sm text-muted-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              isDragActive && "border-foreground bg-muted",
              busy && "pointer-events-none opacity-60",
            )}
          >
            <input {...getInputProps()} aria-label="Image to upload" data-testid="upload-input" />
            {preview && file ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Selected image" className="max-h-40 rounded-md border object-contain" />
                <span className="text-xs">{file.name} · {formatBytes(file.size)}. Drop another to replace it.</span>
              </>
            ) : (
              <>
                <ImageUpIcon className="size-5" aria-hidden />
                <span>{isDragActive ? "Drop the image here" : "Drag an image here, or click to choose one"}</span>
              </>
            )}
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Chat screenshot)" aria-label="Title" maxLength={80} className="h-10" />
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (hotel name, route or report code)" aria-label="Subject" maxLength={120} className="h-10" />
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="h-10" disabled={busy || !file}>
            {busy ? (
              <>
                <Spinner data-icon="inline-start" />
                Uploading…
              </>
            ) : (
              "Upload to vault"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
