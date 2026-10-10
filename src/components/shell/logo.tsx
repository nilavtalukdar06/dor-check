import { ShieldCheckIcon } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-sky-400 to-indigo-500 text-white shadow-xs">
        <ShieldCheckIcon className="size-4" />
      </span>
      <span className="text-[18px] font-semibold tracking-tight">Trap Detector</span>
    </div>
  );
}
