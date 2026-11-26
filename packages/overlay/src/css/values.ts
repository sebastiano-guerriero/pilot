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
const MATH_CHARS = /^[\d.%a-zA-Z_()+\-*/\s,]+$/;
// A binary + or - sits between an operand's end (a number with its unit, or
// a closing parenthesis) and an operand's start (a number, "(" or a function).
const BINARY_PLUS_MINUS = new RegExp(String.raw`(?<=(?:\d|\))(?:${UNIT})?)\s*([+-])\s*(?=[\d.(]|[a-z-]+\()`, "g");

/**
 * A value that's one token, as a field shows it: its name, `var(--space-4)`
 * → `--space-4` (with a fallback, `var(--a, 4px)`, it stays as is). Anything
 * else as it is: a token inside a value keeps its var(), `calc(var(--a) * 2)`.
 */
export function bareToken(value: string): string {
  return /^var\(\s*(--[\w-]+)\s*\)$/.exec(value.trim())?.[1] ?? value;
}

/**
 * Typed text with every token written as a name (`--space-4`, as fields
 * show a lone one, bareToken) in its var(): `--a * 2` → `var(--a) * 2`.
 * The ones in a var() already are left alone.
 */
export function withVars(text: string): string {
  return text.replace(/(?<![\w-])(?<!var\(\s*)--[\w-]+/g, (name) => `var(${name})`);
}

/**
 * The value as the field shows it: a lone token by its name (bareToken), an
 * outer `calc(…)` left out. For a
 * column span (grid-column), `span 3 / span 3` shows as `3` and `1 / -1` as
 * `full`, the way they're typed. A percent (opacity) shows 0–100 without
 * the %: `50%` and `0.5` both show as `50`.
 */
export function displayValue(value: string, property?: string): string {
  if (property && cssProperty(property).kind === "content") return displayContent(value);
  if (property && cssProperty(property).kind === "percent") {
    const percent = percentOf(value.trim());
    if (percent !== null) return String(percent);
  }
  if (property && cssProperty(property).kind === "grid-span") {
    const v = value.trim().replace(/\s+/g, " ");
    if (v === "1 / -1") return "full";
    const count = spanCount(v);
    if (count) return count;
  }
  const inner = unwrapCalc(value.trim());
  return bareToken(inner ?? value);
}

/**
 * A percent value (opacity) as a number from 0 to 100: `50%` → 50, a bare
 * number as CSS reads it, a fraction of 1 (`0.5` → 50). Null for anything else.
 */
function percentOf(value: string): number | null {
  const percent = value.match(/^(\d*\.?\d+)%$/);
  if (percent) return round2(Math.min(100, Number(percent[1])));
  if (/^\d*\.?\d+$/.test(value)) return round2(Math.min(1, Number(value)) * 100);
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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
export function parseValue(property: string, typed: string): string | null {
  const text = withVars(typed);
  let t = lowerExceptNames(text.trim().replace(/\s+/g, " "));
  if (!t) return null;
  const info = cssProperty(property);
  const named = info.named?.[t];
  if (named) return supported(property, named);
  if (info.kind === "font-family") return supported(property, parseFontFamily(text, t));
  if (info.kind === "marker") return supported(property, parseMarker(text, t));
  if (info.kind === "content") return supported(property, parseContent(text, t));
  t = unwrapCalc(t) ?? t; // typed calc(): we add it back where needed

  const isKeyword = info.keywords.includes(t) || (GLOBAL_KEYWORDS as readonly string[]).includes(t);
  let candidate: string | null = null;
  if (isKeyword || FUNCTION.test(t)) candidate = t;
  else if (info.kind && info.kind !== "length") candidate = parseOther(info.kind, info.negative, t);
  else {
    if (/^-?\d*\.?\d+$/.test(t)) t = `${t}px`;
    if (lengthPattern(info.negative).test(t)) candidate = t;
    else if (isMath(t)) candidate = `calc(${normalizeMath(t)})`;
  }
  return supported(property, candidate);
}

/** `text` lowercased, but for custom property names (`var(--colorPrimary)`): those are case-sensitive, and a token is named as the project wrote it. */
function lowerExceptNames(text: string): string {
  return text
    .split(/(--[A-Za-z0-9_-]+)/)
    .map((part, i) => (i % 2 ? part : part.toLowerCase()))
    .join("");
}

/** The candidate, if the browser accepts it for `property` (where `CSS.supports` is real). */
function supported(property: string, candidate: string | null): string | null {
  if (!candidate) return null;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports(property, candidate)) return null;
  return candidate;
}

/**
 * A font-family list as typed, case kept (`Inter, sans-serif`): the names
 * trimmed and joined with ", ". Global keywords and var() as they are.
 */
function parseFontFamily(text: string, lower: string): string | null {
  if ((GLOBAL_KEYWORDS as readonly string[]).includes(lower)) return lower;
  const typed = text.trim().replace(/\s+/g, " ");
  if (FUNCTION.test(lower)) return typed;
  const names = splitTopLevel(typed).map((n) => n.trim());
  return names.every((n) => n) ? names.join(", ") : null;
}

/**
 * A list marker: a keyword or counter style's name (lowercase), a quoted
 * string as typed, or any other text quoted (`—` → `"—"`), case kept.
 */
function parseMarker(text: string, lower: string): string | null {
  const typed = text.trim();
  if (/^-?[a-z][a-z0-9-]*$/.test(lower) || FUNCTION.test(lower)) return lower;
  if (/^(["']).*\1$/.test(typed)) return typed;
  return JSON.stringify(typed);
}

/** A function content takes (`attr(data-label)`, `counter(step)`, `url(…)`, `var(…)`), maybe followed by more. */
const CONTENT_FUNCTION = /^[a-z-]+\(/;

/**
 * A ::before's or ::after's content (kind "content"): CSS as typed when it is
 * (a quoted string, `none`, `normal`, a global keyword, a function such as
 * `attr()` or `url()`), else the text quoted, case kept (`Popular` →
 * `"Popular"`).
 */
function parseContent(text: string, lower: string): string | null {
  const typed = text.trim();
  if (lower === "none" || lower === "normal" || (GLOBAL_KEYWORDS as readonly string[]).includes(lower)) return lower;
  if (/^["']/.test(typed) || CONTENT_FUNCTION.test(lower)) return typed;
  return JSON.stringify(typed);
}

/**
 * A content value as the field shows it: one string without its quotes
 * (`"Popular"` → `Popular`). Kept quoted where the bare text would read as
 * something else when typed back: `""` (the empty box), a keyword, a function.
 */
function displayContent(value: string): string {
  const match = /^(["'])((?:\\.|(?!\1).)*)\1$/.exec(value.trim());
  if (!match) return value.trim();
  const text = (match[2] as string).replace(/\\(.)/g, "$1");
  const lower = text.trim().toLowerCase();
  const ambiguous = !text || /^["']/.test(text) || lower === "none" || lower === "normal" || (GLOBAL_KEYWORDS as readonly string[]).includes(lower) || CONTENT_FUNCTION.test(lower);
  return ambiguous ? value.trim() : text;
}

/** Split on commas that aren't inside quotes or parentheses. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** parseValue for the kinds that aren't lengths (keywords and functions are handled before). */
function parseOther(kind: NonLengthKind, negative: boolean, t: string): string | null {
  const integer = /^-?\d+$/.test(t) ? Number(t) : null;
  const span = t.match(/^span ?(\d+)$/);
  switch (kind) {
    case "integer":
      if (integer !== null) return negative || integer >= 0 ? String(integer) : null;
      return isMath(t) ? `calc(${normalizeMath(t)})` : null;
    case "number": {
      // A plain number, no unit, decimals allowed (flex-grow: 0.5).
      const number = /^-?\d*\.?\d+$/.test(t) ? Number(t) : null;
      if (number !== null) return negative || number >= 0 ? String(number) : null;
      return isMath(t) ? `calc(${normalizeMath(t)})` : null;
    }
    case "line-height": {
      // A bare number stays unitless (a multiple of the font size), unlike
      // lengths, where it would be px; lengths and percentages as usual.
      if (/^\d*\.?\d+$/.test(t)) return String(Number(t));
      if (lengthPattern(false).test(t)) return t;
      return isMath(t) ? `calc(${normalizeMath(t)})` : null;
    }
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
    case "idents": {
      // Names, comma-separated (`opacity, transform`), joined with ", ".
      const parts = t.split(",").map((p) => p.trim());
      return parts.every((p) => /^-?[a-z][a-z0-9-]*$/.test(p)) ? parts.join(", ") : null;
    }
    case "marker":
    case "content":
      return null; // parsed before (parseMarker, parseContent)
    case "position": {
      // Up to four parts: side keywords, lengths (a bare number is px) and
      // percentages, by spaces or Tailwind's `_`.
      const parts = t.replace(/_/g, " ").trim().split(" ");
      if (parts.length > 4) return null;
      const length = lengthPattern(negative);
      const out = parts.map((p) =>
        POSITION_KEYWORDS.includes(p) ? p : /^-?\d*\.?\d+$/.test(p) ? `${p}px` : length.test(p) || /^-?\d*\.?\d+%$/.test(p) ? p : null,
      );
      return out.every((p) => p !== null) ? out.join(" ") : null;
    }
    case "percent": {
      // `50` and `50%` are 50%; a fraction of 1 written with a point (`0.5`,
      // `.25`, `1.0`) is that share, as CSS would read it. Within 0–100.
      const m = t.match(/^(\d*\.?\d+)(%?)$/);
      if (!m) return isMath(t) ? `calc(${normalizeMath(t)})` : null;
      const n = Number(m[1]);
      const fraction = !m[2] && (m[1] as string).includes(".") && n <= 1;
      return `${round2(Math.min(100, fraction ? n * 100 : n))}%`;
    }
  }
}

type NonLengthKind =
  | "integer"
  | "number"
  | "line-height"
  | "grid-line"
  | "grid-span"
  | "ratio"
  | "percent"
  | "idents"
  | "marker"
  | "content"
  | "position";

const POSITION_KEYWORDS = ["top", "right", "bottom", "left", "center"];

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
 * An empty field, a keyword (auto, fit-content…), a token or math
 * (`var(--gap)`, `100% - 20px`) steps from `computed` (px): the number the
 * element ends up with replaces it. (A token in a scale steps along the scale
 * before this: stepToken in TokenMenu/tokens.ts.) Never below 0 unless the
 * property allows negative values.
 */
export function stepValue(property: string, text: string, delta: number, computed: string | undefined): string | null {
  const info = cssProperty(property);
  // A percent's text is the field's, already 0–100: showing it again would
  // read `50` as a CSS fraction.
  const t = info.kind === "percent" ? text.trim().toLowerCase() : displayValue(text.trim().toLowerCase(), property);
  if (info.kind === "font-family") return null; // names: nothing to step
  // Infinite (`full`, calc(infinity * 1px)): no number to step from, its computed one is huge.
  if (/\binfinity\b/.test(t)) return null;
  // Whole steps for the other kinds, except line-height, whose lengths drag
  // finely like any length (0.1em).
  if (info.kind && info.kind !== "length") {
    return stepOther(info.kind, info, t, info.kind === "line-height" ? delta : Math.round(delta), computed);
  }
  const match = t.match(/^(-?\d*\.?\d+)([a-z%]*)$/);
  let n: number;
  let unit: string;
  if (match) {
    n = Number(match[1]);
    unit = match[2] || "px";
    if (!(LENGTH_UNITS as readonly string[]).includes(unit)) return null;
  } else if (t === "" || info.keywords.includes(t) || isExpression(t)) {
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
 * - number: the same, by whole numbers, keeping decimals (0.5 → 1.5);
 * - grid-line: skips 0 (1 → -1); `span N` steps N, from 1; from empty or
 *   `auto`, ↑ gives 1 and ↓ gives -1;
 * - grid-span: the count, from 1 (the default: ↓ on an empty field writes nothing);
 * - percent: by whole numbers within 0–100, from the computed value (opacity's
 *   `1` is 100).
 */
function stepOther(
  kind: NonLengthKind,
  info: { keywords: string[]; negative: boolean },
  t: string,
  delta: number,
  computed: string | undefined,
): string | null {
  // A token or math steps from the computed value too, where that's a number (not a grid line or span).
  const blank = t === "" || info.keywords.includes(t) || (kind !== "grid-line" && kind !== "grid-span" && isExpression(t));
  const integer = /^-?\d+$/.test(t) ? Number(t) : null;
  switch (kind) {
    case "integer": {
      const n = integer ?? (blank ? Number.parseInt(computed ?? "", 10) || 0 : null);
      if (n === null) return null;
      return String(info.negative ? n + delta : Math.max(0, n + delta));
    }
    case "number": {
      const number = /^-?\d*\.?\d+$/.test(t) ? Number(t) : null;
      const n = number ?? (blank ? Number.parseFloat(computed ?? "") || 0 : null);
      if (n === null) return null;
      const next = Math.round((n + delta) * 100) / 100;
      return String(info.negative ? next : Math.max(0, next));
    }
    case "line-height": {
      // Unitless by tenths (1.5 → 1.6, Shift: 2.5); lengths by whole units,
      // keeping the unit. From normal (or nothing set), unitless from 1.2,
      // about what normal is.
      const unitless = t.match(/^\d*\.?\d+$/);
      const length = t.match(/^(\d*\.?\d+)([a-z%]+)$/);
      const round = (n: number) => Math.max(0, Math.round(n * 100) / 100);
      if (unitless) return String(round(Number(t) + delta / 10));
      if (length && (LENGTH_UNITS as readonly string[]).includes(length[2] as string)) {
        return `${round(Number(length[1]) + delta)}${length[2]}`;
      }
      if (!blank) return null;
      const px = computed?.match(/^(\d*\.?\d+)px$/);
      return px ? `${round(Number(px[1]) + delta)}px` : String(round(1.2 + delta / 10));
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
    case "idents":
    case "marker":
    case "content":
    case "position":
      return null;
    case "percent": {
      // `t` is the field's text, 0–100 (`50` or `50%`); an empty field steps
      // from the computed value, a fraction (opacity's `1` is 100).
      const shown = t.match(/^(\d*\.?\d+)%?$/);
      const n = blank ? (percentOf(computed ?? "") ?? 100) : shown ? Number(shown[1]) : null;
      if (n === null) return null;
      return `${Math.min(100, Math.max(0, Math.round(n + delta)))}%`;
    }
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

/**
 * What a field holding math or a token shows on hover: the value it comes
 * to, `computed` (`100% - 20px` → `180px`, `--container-6xl` → `1152px`),
 * its numbers to 2 decimals. Null for anything else, and when it comes to
 * nothing else (`computed` the same as the text).
 */
export function mathResult(text: string, computed: string | undefined): string | null {
  const t = text.trim();
  const token = /^--[\w-]+$/.test(t) || /^var\(\s*--[\w-]+\s*\)$/.test(t);
  // Infinite: its computed value (1.67772e+07px) says nothing the text doesn't.
  if (!computed || /\binfinity\b/i.test(t) || !(token || /\b(calc|min|max|clamp)\(/i.test(t) || isMath(t))) return null;
  const shown = computed.trim().replace(/-?\d*\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100));
  return shown && shown !== t ? shown : null;
}

/** A function (`var(--gap)`, `min(…)`) or math (`100% - 20px`, a calc() shown without it): what the field holds isn't a number of its own. */
function isExpression(t: string): boolean {
  return /[()]/.test(t) || /^--[\w-]+$/.test(t) || isMath(t);
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
/**
 * How much the value moves for a step of 1: 0.1 for a unitless line-height
 * (it steps by tenths; an empty field too, unless it steps from a computed px
 * value), 1 otherwise. Drags use it to stop at 0.
 */
export function stepSize(property: string, text: string, computed?: string): number {
  if (cssProperty(property).kind !== "line-height") return 1;
  const t = displayValue(text.trim());
  const unitless = /^\d*\.?\d+$/.test(t) || ((t === "" || t === "normal") && !/px$/.test(computed ?? ""));
  return unitless ? 0.1 : 1;
}

export function scrubIncrement(text: string): number {
  const unit = displayValue(text.trim().toLowerCase()).match(/^-?\d*\.?\d+([a-z%]*)$/)?.[1] ?? "";
  return FINE_UNITS.includes(unit) ? 0.1 : 1;
}

/**
 * `text` with the parentheses it leaves open closed at the end
 * (`var(--shadow-card` → `var(--shadow-card)`). The browser accepts an
 * unclosed value (CSS closes it while parsing) but it mustn't be written so.
 * Quotes are skipped.
 */
export function closeParens(text: string): string {
  let depth = 0;
  let quote = "";
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && depth > 0) depth--;
  }
  return text + ")".repeat(depth);
}
