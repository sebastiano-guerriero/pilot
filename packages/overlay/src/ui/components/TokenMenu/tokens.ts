import { cssProperty } from "../../../css/properties.ts";
import type { Token, TokenKind } from "../../../dom/tokens.ts";

/**
 * Variables in a property field: the page's tokens (dom/tokens.ts) that fit
 * the property, the `--name` being typed at the caret, and what picking one
 * writes. Typed or picked from the field's button, a token goes where the
 * caret is, so it fits inside a value as well as being the value:
 * `calc(var(--space-4) * 2)`, `var(--space-2) var(--space-4)`.
 */

/** Properties edited as colors (css/colors.ts). */
const COLOR = /(^|-)color$|^(fill|stroke)$/;

/** The kinds of token a property's field offers; none for a property no token fits (a grid line, a ratio). */
export function tokenKindsFor(property: string): TokenKind[] {
  if (COLOR.test(property)) return ["color"];
  const kind = cssProperty(property).kind;
  if (kind === "font-family") return ["font"];
  if (kind === "line-height") return ["number", "length"];
  if (kind === "integer" || kind === "number" || kind === "percent") return ["number"];
  if (!kind || kind === "length") return ["length"];
  return [];
}

/**
 * What a token's name says it's for, by property: a padding's list starts
 * with the spacing scale, a radius's with the radii. Only the order changes:
 * every token that fits is still listed.
 */
const HINTS: Array<[RegExp, RegExp]> = [
  [/^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(-|$)/, /space|spacing|gap|gutter|inset|padding|margin/],
  [/radius/, /radius|rounded|round|corner/],
  [/^font-size$/, /text|font-size|size|fs\b/],
  [/^line-height$/, /leading|line/],
  [/^letter-spacing$/, /tracking|letter/],
  [/^font-weight$/, /weight/],
  [/^opacity$/, /opacity|alpha/],
  [/^z-index$/, /\bz\b|z-|layer|index|elevation/],
  [/^(width|height|min-width|max-width|min-height|max-height|flex-basis)$/, /size|width|height|container|screen|breakpoint/],
  [/^background(-color)?$/, /bg|background|surface|canvas|fill/],
  [/^color$/, /text|ink|fg|foreground|content|muted/],
  [/border.*color|outline-color/, /border|line|divider|stroke|outline/],
];

/** The pattern a token's name matches when it's meant for `property`; null when none is known. */
export function tokenHint(property: string): RegExp | null {
  return HINTS.find(([p]) => p.test(property))?.[1] ?? null;
}

/** The `--name` being typed right before the caret (at the start, or after a space, `(` or `,`): where it starts, and what's typed after `--`. */
export function tokenAt(text: string, caret: number): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s(,])--([\w-]*)$/.exec(before);
  if (!m) return null;
  const query = m[2] as string;
  return { start: caret - query.length - 2, end: caret, query };
}

/** At most this many in the list: it narrows as you type. */
const MAX = 50;

/**
 * The tokens of `kinds` matching `query`: by name (without `--`) or by value
 * (`inter` finds `--font-sans`, `#1cf` the green), the names starting with
 * it first. Within that, the ones meant for `property` lead (tokenHint:
 * the spacing scale for a padding), then the page's order.
 */
export function matchTokens(tokens: readonly Token[], kinds: readonly TokenKind[], query: string, property?: string): Token[] {
  const q = query.toLowerCase().replace(/^--/, "");
  const hint = property ? tokenHint(property) : null;
  const meant = (list: Token[]) => (hint ? [...list.filter((t) => hint.test(t.name)), ...list.filter((t) => !hint.test(t.name))] : list);
  const fit = tokens.filter((t) => kinds.includes(t.kind));
  if (!q) return meant(fit).slice(0, MAX);
  // A file's token matches by its own name too (`color.brand`, `$brand`).
  const names = (t: Token) => [t.name.slice(2).toLowerCase(), ...(t.source ? [t.source.name.replace(/^\$/, "").toLowerCase()] : [])];
  const starts = fit.filter((t) => names(t).some((n) => n.startsWith(q)));
  const contains = fit.filter((t) => !starts.includes(t) && (names(t).some((n) => n.includes(q)) || t.value.toLowerCase().includes(q)));
  return [...meant(starts), ...meant(contains)].slice(0, MAX);
}

/** What a field takes: the kinds that fit `property`, and the property itself, for the order (see matchTokens); none when no token fits. */
export function tokensFor(property: string): { kinds: TokenKind[]; property: string } | undefined {
  const kinds = tokenKindsFor(property);
  return kinds.length ? { kinds, property } : undefined;
}

/**
 * `text` with the token `name` in place of `text.slice(at.start, at.end)`
 * (the `--query` typed, or the selection): `var(--name)`, or just the name
 * when it goes inside a `var(` already. The caret after it (after the `)`
 * that closes it, when there's one right there).
 */
export function insertToken(text: string, at: { start: number; end: number }, name: string): { text: string; caret: number } {
  const before = text.slice(0, at.start);
  const after = text.slice(at.end);
  if (/var\(\s*$/.test(before)) {
    const closed = after.startsWith(")");
    const next = `${before}${name}${closed ? "" : ")"}${after}`;
    return { text: next, caret: before.length + name.length + 1 };
  }
  const token = `var(${name})`;
  return { text: `${before}${token}${after}`, caret: before.length + token.length };
}

/** T-shirt sizes, smallest first: the order of a scale named with them (`--text-sm`, `--text-lg`) whose values can't be compared. */
const SIZES = ["3xs", "2xs", "xxs", "xs", "sm", "md", "base", "lg", "xl", "2xl", "xxl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"];

/** A length or number as px, to put a scale in order (`1rem` is 16); null for anything else (`50%`, a calc). */
function magnitude(value: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|r?em)?$/.exec(value.trim().toLowerCase());
  if (!m) return null;
  return Number(m[1]) * (m[2] === "rem" || m[2] === "em" ? 16 : 1);
}

/**
 * The scale `name` belongs to, smallest first: the tokens of its kind named
 * like it but for the last part (`--space-1` … `--space-10`, `--radius-sm` …
 * `--radius-full`, `--gray-100` … `--gray-900`). In order of their values
 * when all of them can be compared (lengths, numbers), else of that last
 * part (numbers, or t-shirt sizes). Null when it has no such scale (one
 * token alone, or names in no order: `--font-sans`, `--font-serif`).
 */
export function tokenScale(tokens: readonly Token[], name: string): Token[] | null {
  const token = tokens.find((t) => t.name === name);
  const family = /^(--.*?-)[^-]+$/.exec(name)?.[1];
  if (!token || !family) return null;
  const last = (t: Token) => t.name.slice(family.length);
  const members = tokens.filter((t) => t.kind === token.kind && t.name.startsWith(family) && !last(t).includes("-"));
  if (members.length < 2) return null;
  const sortBy = (key: (t: Token) => number) => members.map((t) => ({ t, k: key(t) })).sort((a, b) => a.k - b.k).map((m) => m.t);
  if (members.every((t) => magnitude(t.value) !== null)) return sortBy((t) => magnitude(t.value) as number);
  if (members.every((t) => /^\d*\.?\d+$/.test(last(t)))) return sortBy((t) => Number(last(t)));
  if (members.every((t) => SIZES.includes(last(t)))) return sortBy((t) => SIZES.indexOf(last(t)));
  return null;
}

/**
 * ↑/↓ (and the wheel) on a field holding one token, `var(--space-3)`: the
 * next one along its scale (tokenScale), up or down by one whatever the step
 * (Shift too). At either end it stays (`text` as is): stepping never leaves
 * the scale for a number. Null when the field holds no token of `kinds` with
 * a scale: the field then steps its number, from the computed value when it
 * holds a token or math (css/values.ts, stepValue).
 */
export function stepToken(text: string, delta: number, tokens: readonly Token[], kinds: readonly TokenKind[]): string | null {
  const name = /^var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)$/.exec(text.trim())?.[1];
  const token = name ? tokens.find((t) => t.name === name) : undefined;
  if (!name || !token || !kinds.includes(token.kind) || !delta) return null;
  const scale = tokenScale(tokens, name);
  if (!scale) return null;
  const next = scale[scale.indexOf(token) + Math.sign(delta)];
  return next ? `var(${next.name})` : text;
}
