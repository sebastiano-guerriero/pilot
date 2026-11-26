import { describeWidths, type WidthRange } from "@pilot/protocol";

/**
 * The width chip: which viewport widths the designer's changes are for. Set
 * by typing `from-1200 ` / `to-767 ` / `base ` / `all-widths ` at the start
 * of the search, from the `/` menu, or by clicking the viewport width. No
 * chip: each change goes to the rule that applies at the window's width
 * (edits/reach.ts), following resizes (the owner's call, 2026-11-26).
 */

/**
 * The chip: a range (`from-768`), Base (`{}`: the value without a media
 * query, whatever the window's width), or All widths (the base value, and the
 * property's breakpoint rules removed).
 */
export type WidthChip = WidthRange | typeof ALL_WIDTHS;
export const ALL_WIDTHS = "all";

/** The chip is Base: a range with neither end. */
export function isBaseChip(chip: WidthChip | null | undefined): chip is WidthRange {
  return typeof chip === "object" && chip !== null && chip.min === undefined && chip.max === undefined;
}

/** The chip's range, when it's one (not Base, not All widths). */
export function chipRange(chip: WidthChip | null | undefined): WidthRange | null {
  return typeof chip === "object" && chip !== null && !isBaseChip(chip) ? chip : null;
}

/** The pill's text: `from 768px`, `Base`, `All widths`. */
export function chipLabel(chip: WidthChip): string {
  if (chip === ALL_WIDTHS) return "All widths";
  return isBaseChip(chip) ? "Base" : describeWidths(chip);
}

/** The same chip. */
export function sameChip(a: WidthChip | null | undefined, b: WidthChip | null | undefined): boolean {
  if (a === ALL_WIDTHS || b === ALL_WIDTHS || !a || !b) return (a ?? null) === (b ?? null);
  return a.min === b.min && a.max === b.max;
}

/** `from-1200` / `to-767` / `base` / `all-widths`, followed by a space. */
const TOKEN = /^\s*(?:(from|to)-(\d{1,5})|(base|all-widths))\s+/i;

/**
 * Take the width tokens off the start of the search text: `from-768 to-1199 gap`
 * → range 768–1199 and the query `gap`. `range` is null when the text starts
 * with none (it's all search). A token only counts once followed by a space,
 * so typing `from-12` isn't taken as 12px on the way to `from-1200`.
 */
export function takeWidths(text: string, current: WidthChip | null): { range: WidthChip | null; rest: string } {
  let range: WidthChip | null = null;
  let rest = text;
  for (let match = TOKEN.exec(rest); match; match = TOKEN.exec(rest)) {
    const word = match[3]?.toLowerCase();
    if (word) range = word === "base" ? {} : ALL_WIDTHS;
    else {
      // A width after All widths starts a range over; after Base, Base gains that end.
      const from = range ?? current;
      range = withEnd(from === ALL_WIDTHS || !from ? {} : from, match[1]?.toLowerCase() === "from" ? "min" : "max", Number(match[2]));
    }
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
 * A width end being finished, whose widths the search lists (PropertySearch's
 * width list): `from-`, `to-76`, the dash typed (picking From width in the `/`
 * menu types it). Null for anything else, plain `from` included (it may be a
 * search). The `/` menu's `/from` doesn't open them: From width is picked
 * first, then the width (the owner's call, 2026-11-26, after trying it).
 */
export function widthToFinish(text: string): PartialWidth | null {
  const typed = partialWidth(text);
  return typed && typed.digits !== null ? typed : null;
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
export function clickWidth(chip: WidthChip | null, width: number, shift: boolean): WidthRange {
  const range = chipRange(chip);
  const end = range && (range.min === undefined) !== (range.max === undefined) ? (range.min ?? range.max) : undefined;
  if (end === undefined) return shift ? { max: width } : { min: width };
  if (end === width) return range as WidthRange;
  return { min: Math.min(end, width), max: Math.max(end, width) };
}

/** Whether the viewport width `width` is in the range (Base and All widths: any width). */
export function inWidths(chip: WidthChip | null, width: number): boolean {
  const range = chipRange(chip);
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
