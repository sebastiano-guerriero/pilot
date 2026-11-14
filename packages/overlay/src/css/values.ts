import { cssProperty, GLOBAL_KEYWORDS, LENGTH_UNITS } from "./properties.ts";

/**
 * Turning what a designer types into CSS values, and back. Shared by the
 * editors so every field accepts the same things:
 * - a bare number is px (`120` → `120px`),
 * - any of LENGTH_UNITS, the property's keywords and the global ones,
 * - min()/max()/clamp()/var()…, as typed,
 * - math without `calc()`: `100% - 20px` → `calc(100% - 20px)`. A typed
 *   `calc(…)` is accepted too, but fields never show it, so designers learn
 *   they don't need it.
 * That's for lengths. Properties of another kind (see `kind` in
 * properties.ts) take whole numbers (order), grid lines (`3`, `-1`,
 * `span 2`), or a column span (`3`, `full`) instead.
 */

// Longest first, so "rem" wins over "em" and "vmin" over "vw".
const UNIT = [...LENGTH_UNITS]
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace("%", "\\%"))
  .join("|");
const NUMBER = String.raw`\d*\.?\d+`;
const lengthPattern = (negative: boolean) => new RegExp(`^${negative ? "-?" : ""}${NUMBER}(?:${UNIT})$`);
const FUNCTION = /^(?:min|max|clamp|var|env|fit-content)\(.+\)$/;
const MATH_CHARS = /^[\d.%a-z()+\-*/\s,]+$/;
// A binary + or - sits between an operand's end (a number with its unit, or
// a closing parenthesis) and an operand's start (a number, "(" or a function).
const BINARY_PLUS_MINUS = new RegExp(String.raw`(?<=(?:\d|\))(?:${UNIT})?)\s*([+-])\s*(?=[\d.(]|[a-z-]+\()`, "g");

/**
 * The value as the field shows it: an outer `calc(…)` is left out. For a
 * column span (grid-column), `span 3 / span 3` shows as `3` and `1 / -1` as
 * `full`, the way they're typed.
 */
export function displayValue(value: string, property?: string): string {
  if (property && cssProperty(property).kind === "grid-span") {
    const v = value.trim().replace(/\s+/g, " ");
    if (v === "1 / -1") return "full";
    const count = spanCount(v);
    if (count) return count;
  }
  const inner = unwrapCalc(value.trim());
  return inner ?? value;
}

/**
 * How many columns a grid-column value spans, when it ends in `span N`
 * (`span 3 / span 3`, `2 / span 3`, `span 3`). Null for anything else.
 */
function spanCount(value: string): string | null {
  const parts = value.split("/").map((p) => p.trim());
  if (parts.length > 2) return null;
  const end = parts.at(-1) as string;
  const start = parts.length === 2 ? (parts[0] as string) : "auto";
  const match = end.match(/^span (\d+)$/);
  return match && /^(?:auto|-?\d+|span \d+)$/.test(start) ? (match[1] as string) : null;
}

/**
 * What the designer typed → a valid CSS value for `property`, or null.
 * Checked against the grammar above, then by the browser itself where
 * `CSS.supports` is real.
 */
export function parseValue(property: string, text: string): string | null {
  let t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  t = unwrapCalc(t) ?? t; // typed calc(): we add it back where needed

  const info = cssProperty(property);
  const isKeyword = info.keywords.includes(t) || (GLOBAL_KEYWORDS as readonly string[]).includes(t);
  let candidate: string | null = null;
  if (isKeyword || FUNCTION.test(t)) candidate = t;
  else if (info.kind && info.kind !== "length") candidate = parseOther(info.kind, info.negative, t);
  else {
    if (/^-?\d*\.?\d+$/.test(t)) t = `${t}px`;
    if (lengthPattern(info.negative).test(t)) candidate = t;
    else if (isMath(t)) candidate = `calc(${normalizeMath(t)})`;
  }
  if (!candidate) return null;

  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports(property, candidate)) return null;
  return candidate;
}

/** parseValue for the kinds that aren't lengths (keywords and functions are handled before). */
function parseOther(kind: "integer" | "grid-line" | "grid-span" | "ratio", negative: boolean, t: string): string | null {
  const integer = /^-?\d+$/.test(t) ? Number(t) : null;
  const span = t.match(/^span ?(\d+)$/);
  switch (kind) {
    case "integer":
      if (integer !== null) return negative || integer >= 0 ? String(integer) : null;
      return isMath(t) ? `calc(${normalizeMath(t)})` : null;
    case "grid-line":
      // Lines are numbered from 1 (or from -1 at the end): there's no line 0.
      if (integer !== null) return integer !== 0 ? String(integer) : null;
      return span && Number(span[1]) >= 1 ? `span ${Number(span[1])}` : null;
    case "grid-span": {
      if (t === "full") return "1 / -1";
      const count = integer ?? (span ? Number(span[1]) : null);
      if (count !== null) return count >= 1 ? `span ${count} / span ${count}` : null;
      // An explicit start / end (`2 / 4`, `1 / span 2`): as typed, checked by the browser.
      return /^[\w -]+\/[\w -]+$/.test(t) ? t.replace(/\s*\/\s*/, " / ") : null;
    }
    case "ratio":
      return normalizeRatio(t);
  }
}

/**
 * A width / height ratio, as CSS writes it: `16/9`, `16 / 9`, `16:9` →
 * `16 / 9`; one number (`1.5`) → `1.5 / 1`. Both positive. Null otherwise.
 */
export function normalizeRatio(text: string): string | null {
  const parts = text.trim().split(/\s*[/:]\s*/);
  if (parts.length > 2) return null;
  const [w, h = "1"] = parts as [string, string?];
  const number = /^\d*\.?\d+$/;
  if (!number.test(w) || !number.test(h) || Number(w) <= 0 || Number(h) <= 0) return null;
  return `${Number(w)} / ${Number(h)}`;
}

/**
 * ↑/↓ on a value: step its number and keep the unit ("100%" → "101%").
 * An empty field or a keyword (auto, fit-content…) steps from `computed` (px).
 * Math and functions aren't stepped (null). Never below 0 unless the property
 * allows negative values.
 */
export function stepValue(property: string, text: string, delta: number, computed: string | undefined): string | null {
  const info = cssProperty(property);
  const t = displayValue(text.trim().toLowerCase(), property);
  if (info.kind && info.kind !== "length") return stepOther(info.kind, info, t, Math.round(delta), computed);
  const match = t.match(/^(-?\d*\.?\d+)([a-z%]*)$/);
  let n: number;
  let unit: string;
  if (match) {
    n = Number(match[1]);
    unit = match[2] || "px";
    if (!(LENGTH_UNITS as readonly string[]).includes(unit)) return null;
  } else if (t === "" || info.keywords.includes(t)) {
    n = Number.parseFloat(computed ?? "");
    unit = "px";
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  let next = Math.round((n + delta) * 100) / 100;
  if (!info.negative) next = Math.max(0, next);
  return `${next}${unit}`;
}

/**
 * stepValue for the kinds that aren't lengths, by whole numbers:
 * - integer: from an empty field, from the computed value (order: 0);
 * - grid-line: skips 0 (1 → -1); `span N` steps N, from 1; from empty or
 *   `auto`, ↑ gives 1 and ↓ gives -1;
 * - grid-span: the count, from 1 (the default: ↓ on an empty field writes nothing).
 */
function stepOther(
  kind: "integer" | "grid-line" | "grid-span" | "ratio",
  info: { keywords: string[]; negative: boolean },
  t: string,
  delta: number,
  computed: string | undefined,
): string | null {
  const blank = t === "" || info.keywords.includes(t);
  const integer = /^-?\d+$/.test(t) ? Number(t) : null;
  switch (kind) {
    case "integer": {
      const n = integer ?? (blank ? Number.parseInt(computed ?? "", 10) || 0 : null);
      if (n === null) return null;
      return String(info.negative ? n + delta : Math.max(0, n + delta));
    }
    case "grid-line": {
      const span = t.match(/^span (\d+)$/);
      if (span) return `span ${Math.max(1, Number(span[1]) + delta)}`;
      const n = integer ?? (blank ? 0 : null);
      if (n === null) return null;
      const next = n + delta;
      return String(next !== 0 ? next : delta > 0 ? 1 : -1);
    }
    case "grid-span": {
      const n = integer ?? (t === "" ? 1 : null);
      if (n === null) return null;
      const next = Math.max(1, n + delta);
      if (t === "" && next === 1) return null;
      return `span ${next} / span ${next}`;
    }
    case "ratio":
      return null;
  }
}

/** "calc(…)" → its inside, if the outer parentheses really belong together; else null. */
function unwrapCalc(value: string): string | null {
  const match = value.match(/^calc\((.*)\)$/i);
  if (!match) return null;
  const inner = match[1] as string;
  // `calc(1px) + calc(2px)` starts with calc( and ends with ), but isn't one call.
  let depth = 0;
  for (const ch of inner) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) return null;
  }
  return depth === 0 ? inner.trim() : null;
}

function isMath(t: string): boolean {
  if (!MATH_CHARS.test(t)) return false;
  return /[*/]/.test(t) || /\s[+-]\s/.test(normalizeMath(t));
}

/** CSS needs spaces around + and - in calc(): `100%-20px` → `100% - 20px`. */
function normalizeMath(t: string): string {
  return t
    .replace(BINARY_PLUS_MINUS, " $1 ")
    .replace(/\s*([*/])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Units where 1 is a big jump (font- and print-relative): scrubbing steps them by 0.1. */
const FINE_UNITS = ["em", "rem", "lh", "rlh", "ex", "ch", "cm", "in", "pc"];

/**
 * How much one drag step (scrub) changes a value: 0.1 for font-relative
 * units like rem, where 1 is a big jump, 1 otherwise (px, %, vw…).
 */
export function scrubIncrement(text: string): number {
  const unit = displayValue(text.trim().toLowerCase()).match(/^-?\d*\.?\d+([a-z%]*)$/)?.[1] ?? "";
  return FINE_UNITS.includes(unit) ? 0.1 : 1;
}
