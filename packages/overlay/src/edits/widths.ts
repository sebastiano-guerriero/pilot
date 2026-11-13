import type { WidthRange } from "@pilot/protocol";

/**
 * The width chip: which viewport widths the designer's changes are for. Set
 * by typing `from-1200 ` / `to-767 ` at the start of the search, or by
 * clicking the viewport width (top right). No chip: every width.
 */

/** `from-1200` / `to-767`, followed by a space. */
const TOKEN = /^\s*(from|to)-(\d{1,5})\s+/i;

/**
 * Take the width tokens off the start of the search text: `from-768 to-1199 gap`
 * → range 768–1199 and the query `gap`. `range` is null when the text starts
 * with none (it's all search). A token only counts once followed by a space,
 * so typing `from-12` isn't taken as 12px on the way to `from-1200`.
 */
export function takeWidths(text: string, current: WidthRange | null): { range: WidthRange | null; rest: string } {
  let range: WidthRange | null = null;
  let rest = text;
  for (let match = TOKEN.exec(rest); match; match = TOKEN.exec(rest)) {
    const width = Number(match[2]);
    range = withEnd(range ?? current ?? {}, match[1]?.toLowerCase() === "from" ? "min" : "max", width);
    rest = rest.slice(match[0].length);
  }
  return { range, rest };
}

/** A width token being typed, not yet ended by a space: `from`, `from-`, `to-76`. */
const PARTIAL = /^\s*(from|to)(-(\d{0,5}))?$/i;

export interface PartialWidth {
  end: "from" | "to";
  /** The digits typed after the dash ("" for `from-`), or null with no dash yet (`from`). */
  digits: string | null;
}

/** The search text is a width token on its way (`from`, `to-`, `from-12`), or null. */
export function partialWidth(text: string): PartialWidth | null {
  const match = PARTIAL.exec(text);
  if (!match) return null;
  return { end: match[1]?.toLowerCase() === "to" ? "to" : "from", digits: match[3] ?? null };
}

/**
 * The rest of the viewport width to suggest after a token being typed, dimmed
 * after the text (Tab takes it): `from-` → `1108`, `from-11` → `08`. Only once
 * the dash is typed, and only while the digits typed so far start the width.
 */
export function widthSuggestion(text: string, viewportWidth: number): string | null {
  const partial = partialWidth(text);
  if (!partial || partial.digits === null) return null;
  const width = String(viewportWidth);
  return width.startsWith(partial.digits) && width !== partial.digits ? width.slice(partial.digits.length) : null;
}

/**
 * The range after clicking the viewport width `width` (Shift: as its upper
 * end). With no chip, or a full range, it starts over: `from` the width (Shift:
 * `to` it). With one end set, a different width becomes the other end,
 * whichever order they're clicked in; the same width changes nothing.
 */
export function clickWidth(range: WidthRange | null, width: number, shift: boolean): WidthRange {
  const end = range && (range.min === undefined) !== (range.max === undefined) ? (range.min ?? range.max) : undefined;
  if (end === undefined) return shift ? { max: width } : { min: width };
  if (end === width) return range as WidthRange;
  return { min: Math.min(end, width), max: Math.max(end, width) };
}

/** Whether the viewport width `width` is in the range. */
export function inWidths(range: WidthRange | null, width: number): boolean {
  if (!range) return true;
  return (range.min === undefined || width >= range.min) && (range.max === undefined || width <= range.max);
}

/** Set one end; when the ends cross, they swap, so `min` stays the smaller. */
function withEnd(range: WidthRange, end: "min" | "max", width: number): WidthRange {
  const next = { ...range, [end]: width };
  if (next.min !== undefined && next.max !== undefined && next.min > next.max) {
    return { min: next.max, max: next.min };
  }
  return next;
}
