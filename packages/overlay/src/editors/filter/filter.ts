import { splitTopLevel } from "../../dom/declared.ts";
import { angleText } from "../mask/mask.ts";

/**
 * filter as a list of functions the panel edits, and back (FilterEditor).
 * Each function takes one kind of value; the panel says which (`hint`), the
 * field's placeholder shows one, and a bare number takes the function's unit.
 */

/** What a function's value is. */
export type FilterKind =
  /** A length, 0 or more (blur): `4` is 4px. */
  | "length"
  /** A percentage, 0 or more (brightness): `150` is 150%, `1.5` is 150% too (CSS's number). */
  | "amount"
  /** A percentage from 0 to 100 (grayscale): more is kept at 100%. */
  | "share"
  /** An angle (hue-rotate): `90` is 90deg, negatives too. */
  | "angle"
  /** A shadow (drop-shadow): offsets, a blur, a color, as typed. */
  | "shadow";

export interface FilterSpec {
  kind: FilterKind;
  /** What + and a change of function start from: a value that shows (Tailwind's, where it has one). */
  start: string;
  /** The value that changes nothing, where there's one: the field's placeholder says it. */
  neutral?: string;
  /** In the function select, after the name, dimmed: what it takes. */
  takes: string;
  /** Under the value field: what the value means. */
  hint: string;
}

/** The filter functions, in menu order. */
export const FILTERS = {
  blur: { kind: "length", start: "4px", neutral: "0px", takes: "px", hint: "How far it blurs: 0 is sharp." },
  brightness: { kind: "amount", start: "150%", neutral: "100%", takes: "%", hint: "100% is unchanged, less is darker, more is brighter." },
  contrast: { kind: "amount", start: "150%", neutral: "100%", takes: "%", hint: "100% is unchanged, 0% is flat gray, more is punchier." },
  saturate: { kind: "amount", start: "150%", neutral: "100%", takes: "%", hint: "100% is unchanged, 0% is gray, more is more vivid." },
  grayscale: { kind: "share", start: "100%", neutral: "0%", takes: "0–100%", hint: "0% is unchanged, 100% is fully gray." },
  sepia: { kind: "share", start: "100%", neutral: "0%", takes: "0–100%", hint: "0% is unchanged, 100% is fully sepia." },
  invert: { kind: "share", start: "100%", neutral: "0%", takes: "0–100%", hint: "0% is unchanged, 100% is fully inverted." },
  opacity: { kind: "share", start: "50%", neutral: "100%", takes: "0–100%", hint: "100% is unchanged, 0% is invisible." },
  "hue-rotate": { kind: "angle", start: "90deg", neutral: "0deg", takes: "deg", hint: "Turns every hue around the color wheel: 180deg swaps them for their opposites." },
  "drop-shadow": {
    kind: "shadow",
    start: "0 4px 4px #00000040",
    takes: "shadow",
    hint: "It follows the element's shape, transparent parts too.",
  },
} as const satisfies Record<string, FilterSpec>;

export type FilterFunction = keyof typeof FILTERS;

/**
 * The panel's first select: a function, or none (filter: none). A filter the
 * page writes that isn't one of them (`url(#noise)`) is a custom chip, its
 * CSS as text; custom isn't offered (only listed while it's the value).
 */
export const FILTER_TYPES = [...(Object.keys(FILTERS) as FilterFunction[]), "none"] as const;
export type FilterType = (typeof FILTER_TYPES)[number] | "custom";

/** In the select, after custom and none, dimmed: what they are. */
export const OTHER_TAKES: Record<"custom" | "none", string> = { custom: "as written", none: "no filter" };

export const CUSTOM_HINT = "A filter the page writes that isn't one of these (url(#noise)), as CSS writes it.";
export const NONE_HINT = "Declares filter: none, taking off a filter the page sets (at a width, say). × on the chip declares nothing instead.";

export type Filter = { fn: FilterFunction; value: string } | { fn: "custom"; text: string };

/** What + adds: Tailwind's blur-xs. */
export const NEW_FILTER: Filter = { fn: "blur", value: FILTERS.blur.start };

const isFunction = (name: string): name is FilterFunction => Object.hasOwn(FILTERS, name);

/** A value as filters: null when nothing is set, `none` when it says so. */
export function parseFilter(value: string): Filter[] | "none" | null {
  const v = value.trim();
  if (!v) return null;
  if (v.toLowerCase() === "none") return "none";
  return splitTopLevel(v, " ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): Filter => {
      const m = /^([a-z-]+)\((.*)\)$/is.exec(part);
      const name = m?.[1]?.toLowerCase() ?? "";
      return m && isFunction(name) ? { fn: name, value: (m[2] as string).trim().replace(/\s+/g, " ") } : { fn: "custom", text: part };
    });
}

/** One filter's CSS: `blur(4px)`; a function with no value writes its start value. */
export function filterText(filter: Filter): string {
  if (filter.fn === "custom") return filter.text.trim();
  return `${filter.fn}(${filter.value.trim() || FILTERS[filter.fn].start})`;
}

/** The filters as filter's value ("" for none left). */
export function formatFilter(filters: Filter[] | "none"): string {
  if (filters === "none") return "none";
  return filters.map(filterText).filter(Boolean).join(" ");
}

/** Whether the browser takes `text` as a filter (where CSS.supports is real). */
export function supportedFilter(text: string): boolean {
  return typeof CSS === "undefined" || typeof CSS.supports !== "function" || CSS.supports("filter", text);
}

const NUMBER = /^-?\d*\.?\d+$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What the designer typed in the value field → the function's value, or null
 * when it isn't one:
 * - length: a bare number is px; never negative.
 * - amount / share: a whole number is a percentage (`150` → 150%, as
 *   Tailwind's brightness-150), a number with a point is CSS's factor
 *   (`1.5` → 150%); never negative; a share is kept at 100% at most.
 * - angle: a bare number is degrees.
 * - shadow: as typed, checked by the browser.
 * var() and calc() pass as typed, checked by the browser.
 */
export function parseFilterValue(fn: FilterFunction, text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  const { kind } = FILTERS[fn];
  const check = (v: string) => (supportedFilter(`${fn}(${v})`) ? v : null);
  if (/^(var|calc|min|max|clamp)\(/i.test(t)) return check(t);
  switch (kind) {
    case "length": {
      if (NUMBER.test(t)) return Number(t) >= 0 ? `${Number(t)}px` : null;
      return t.startsWith("-") ? null : check(t.toLowerCase());
    }
    case "amount":
    case "share": {
      const m = /^(\d*\.?\d+)(%?)$/.exec(t);
      if (!m) return null;
      const n = Number(m[1]);
      const percent = !m[2] && (m[1] as string).includes(".") ? n * 100 : n;
      return `${round2(kind === "share" ? Math.min(100, percent) : percent)}%`;
    }
    case "angle":
      return angleText(t);
    case "shadow":
      return check(t);
  }
}

/** The unit a value steps in, and by how much per step. */
const STEP_UNITS: Record<Exclude<FilterKind, "shadow">, string> = { length: "px", amount: "%", share: "%", angle: "deg" };

/**
 * The value `delta` steps from `text` (↑/↓, the wheel, a drag); from empty,
 * from the start value. Within the function's range: lengths and amounts
 * from 0, shares from 0 to 100%. A factor (`1.5`) steps as its percentage.
 * Null when it doesn't step (a shadow, var()).
 */
export function stepFilterValue(fn: FilterFunction, text: string, delta: number): string | null {
  const { kind, start } = FILTERS[fn];
  if (kind === "shadow") return null;
  const unit = STEP_UNITS[kind];
  const from = parseFilterValue(fn, text.trim() || start);
  const m = from && /^(-?\d*\.?\d+)([a-z%]*)$/.exec(from);
  if (!m) return null;
  // Another unit (rem, turn): it keeps its unit and steps by one of it.
  const own = (m[2] as string) || unit;
  let n = round2(Number(m[1]) + delta);
  if (kind !== "angle") n = Math.max(0, n);
  if (kind === "share") n = Math.min(100, n);
  return `${n}${own}`;
}

/**
 * A drop-shadow's parts, each a row of its own: the offsets, the blur, the
 * color. Empty parts aren't written (x and y write 0: CSS needs both).
 */
export interface Shadow {
  x: string;
  y: string;
  blur: string;
  color: string;
}

/** A length, or math that makes one: `4px`, `0`, `-2px`, `calc(…)`. */
const LENGTH = /^(-?\d*\.?\d+([a-z]+|%)?|(calc|min|max|clamp)\(.*\))$/i;
const VAR = /^var\(.*\)$/i;

/**
 * A drop-shadow's value as its parts: two or three lengths, and a color
 * before or after them. A var() is a length, unless it comes last after two
 * or three others (then it's the color: `0 4px 4px var(--shadow)`). Null when it doesn't split that way
 * (a var() for the whole shadow): it's then edited as text.
 */
export function parseShadow(value: string): Shadow | null {
  const parts = splitTopLevel(value.trim(), " ").filter(Boolean);
  const lengths: string[] = [];
  let color = "";
  for (const [i, part] of parts.entries()) {
    const last = i === parts.length - 1;
    const isColor = !LENGTH.test(part) && (!VAR.test(part) || (last && !color && lengths.length >= 2));
    if (!isColor) lengths.push(part);
    else if (!color) color = part;
    else return null;
  }
  if (lengths.length < 2 || lengths.length > 3) return null;
  return { x: lengths[0] as string, y: lengths[1] as string, blur: lengths[2] ?? "", color };
}

/** The parts as drop-shadow's value: `0 4px 4px #00000040`. */
export function formatShadow(shadow: Shadow): string {
  return [shadow.x.trim() || "0", shadow.y.trim() || "0", shadow.blur.trim(), shadow.color.trim()].filter(Boolean).join(" ");
}
