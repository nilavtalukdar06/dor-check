export const rs = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;

/** 165 -> "2 h 45 m", 45 -> "45 m", 120 -> "2 h". */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** "7 Oct 2026". Dates stored as UTC midnight stay on the same day. */
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
