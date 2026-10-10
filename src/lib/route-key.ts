/** "Guwahati airport" -> "guwahati-airport". Lower-case, punctuation stripped, words joined by "-". */
export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Key used to look up a tariff benchmark: "origin|destination|vehicle".
 * Stays, guides and tours use "district|qualifier" with the same normalisation.
 */
export function routeKey(...parts: (string | null | undefined)[]) {
  return parts.map((p) => normalizeText(p ?? "")).join("|");
}
