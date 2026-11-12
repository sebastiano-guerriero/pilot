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

/** The value as the field shows it: an outer `calc(…)` is left out. */
export function displayValue(value: string): string {
  const inner = unwrapCalc(value.trim());
  return inner ?? value;
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
  if (/^-?\d*\.?\d+$/.test(t)) t = `${t}px`;

  const info = cssProperty(property);
  const isKeyword = info.keywords.includes(t) || (GLOBAL_KEYWORDS as readonly string[]).includes(t);
  let candidate: string | null = null;
  if (lengthPattern(info.negative).test(t) || isKeyword || FUNCTION.test(t)) candidate = t;
  else if (isMath(t)) candidate = `calc(${normalizeMath(t)})`;
  if (!candidate) return null;

  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports(property, candidate)) return null;
  return candidate;
}

/**
 * ↑/↓ on a value: step its number and keep the unit ("100%" → "101%").
 * An empty field or a keyword (auto, fit-content…) steps from `computed` (px).
 * Math and functions aren't stepped (null). Never below 0 unless the property
 * allows negative values.
 */
export function stepValue(property: string, text: string, delta: number, computed: string | undefined): string | null {
  const t = displayValue(text.trim().toLowerCase());
  const info = cssProperty(property);
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
