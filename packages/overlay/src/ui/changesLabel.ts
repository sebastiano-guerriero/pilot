import { textRunOf } from "../dom/text.ts";

/**
 * How many changes, in words, said with what they are: "3 style changes",
 * "1 text change", "2 style changes and 1 text change". Never a bare
 * "3 changes": the designer reads what kind they are at a glance.
 */
export interface ChangeCounts {
  /** CSS properties set or removed. */
  styles: number;
  /** Texts edited in place. */
  texts: number;
}

export function changesLabel(counts: ChangeCounts | number): string {
  const { styles, texts } = typeof counts === "number" ? { styles: counts, texts: 0 } : counts;
  const part = (n: number, kind: string) => `${n} ${kind} ${n === 1 ? "change" : "changes"}`;
  const parts = [styles && part(styles, "style"), texts && part(texts, "text")].filter((p): p is string => !!p);
  return parts.join(" and ") || part(0, "style");
}

/** A history change to an element's text (`text`, `text:1`: see textProperty), not to its style. */
export function isTextChange(property: string): boolean {
  return textRunOf(property) !== null;
}

/** Counts of recorded changes, by what they change. */
export function countChanges(changes: ReadonlyArray<{ property: string }>): ChangeCounts {
  const texts = changes.filter((c) => isTextChange(c.property)).length;
  return { styles: changes.length - texts, texts };
}
