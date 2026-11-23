import type { CurrentStyle, PageToken } from "@pilot/protocol";
import { sourceOf } from "../edits/clear.ts";
import { type Declared, declaredValues, isFromReset } from "./declared.ts";
import { resolvedTokens } from "./equivalents.ts";

/**
 * An element's style now, for a comment or a task: what the agent would
 * otherwise look up in the code and the theme before it changes anything
 * ("make it bolder" starts from its weight; "which font is this?" is
 * answered). Each property the element's CSS declares, as declared and as it
 * comes out; its typography too when inherited from a parent. Read as the
 * property dialog reads its fields (declared values, Pilot's preview left
 * out), never written.
 */

/** Inherited from a parent when the element doesn't set them: said either way. */
const TYPOGRAPHY = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "color"];
/** Said only when the element's CSS sets them. */
const OWN = ["text-transform", "text-align", "background-color", "border-radius", "box-shadow", "opacity", "gap", "row-gap", "column-gap", "width", "height", "max-width"];
const SIDES = ["top", "right", "bottom", "left"];
/** Long values cut: a font stack's first families say which font. */
const MAX_VALUE = 120;

const cut = (v: string) => (v.length > MAX_VALUE ? `${v.slice(0, MAX_VALUE - 1)}…` : v);

export function currentStyle(element: Element): CurrentStyle[] {
  const boxes = ["padding", "margin"].flatMap((p) => SIDES.map((s) => `${p}-${s}`));
  const declared = declaredValues(element, [...TYPOGRAPHY, ...OWN, ...boxes]);
  const computed = getComputedStyle(element);
  const out: CurrentStyle[] = [];
  const add = (property: string, found: Declared | null, inherited = false) => {
    const now = computed.getPropertyValue(property).trim();
    // A reset's (`* { margin: 0 }`, a heading's `font-size: inherit`) isn't the element's own: typography is said as inherited.
    const d = found && (found.value.trim() === "inherit" || isFromReset(found)) ? null : found;
    if (d) {
      const value = d.value.trim();
      out.push({ property, value: cut(value), ...(now && now !== value ? { computed: cut(now) } : {}), source: sourceOf(element, d) });
    } else if (inherited && now) out.push({ property, value: cut(now), source: { kind: "inherited" } });
  };
  for (const p of TYPOGRAPHY) add(p, declared[p] ?? null, true);
  for (const p of OWN) {
    // `gap` said: its two parts only when they're set apart.
    const gap = declared.gap;
    const part = declared[p];
    if ((p === "row-gap" || p === "column-gap") && gap && part && part.value === gap.value && sameSource(part, gap)) continue;
    add(p, part ?? null);
  }
  // Padding and margin: one line when the four sides come from one declaration alike, else each side set.
  for (const box of ["padding", "margin"]) {
    const sides = SIDES.map((s) => declared[`${box}-${s}`] ?? null);
    const first = sides[0];
    const alike = first && sides.every((d) => d && d.value === first.value && sameSource(d, first));
    if (alike) add(box, { ...first, value: first.value });
    else SIDES.forEach((s, i) => add(`${box}-${s}`, sides[i] ?? null));
  }
  return out;
}

const sameSource = (a: Declared, b: Declared) =>
  a.source === "inline" || b.source === "inline" ? a.source === b.source : a.source.selector === b.source.selector;

/** At most this many tokens: the scales, not every variable a library defines. */
const MAX_TOKENS = 150;

/** The page's tokens with what each comes to now, for a comment or a task (see ChangeSet.tokens). */
export function tokensNow(doc: Document = document): PageToken[] {
  return resolvedTokens(doc).slice(0, MAX_TOKENS);
}
