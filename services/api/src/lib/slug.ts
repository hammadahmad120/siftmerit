// A company's short name ("slug"): lower-case letters, digits and dashes,
// 1 to 63 long, starting and ending with a letter or digit. The same rule is
// written in the database (tenants_slug_format).

const MAX_LENGTH = 63;

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Makes a short name from a company name: "Acme Trading Co." becomes
 * "acme-trading-co". Returns "" when nothing usable is left, for example for
 * a name with no Latin letters or digits.
 */
export function slugFromName(name: string, prefix = ""): string {
  const base = name
    .normalize("NFKD")
    // Drop accent marks, so "Café" becomes "cafe".
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base === "") return "";
  return `${prefix}${base}`.slice(0, MAX_LENGTH).replace(/-+$/, "");
}
