/**
 * Search text without separators: "min-w", "min w" and "minw" are the same
 * query, and "min-width" is matched as "minwidth". Designers typing fast skip
 * the hyphens. (Its own module so editors can use it without importing the
 * registry, which imports them.)
 */
export function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/[\s-]+/g, "");
}
