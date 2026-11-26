/**
 * The page's breakpoints: the viewport widths its `@media` queries test, in
 * CSS px, read from its stylesheets as they are now (so a breakpoint changed
 * in the project's tokens shows up after hot reload). Shown on the ruler
 * (ViewportWidth).
 *
 * Any width condition counts: `(min-width: 768px)`, `(max-width: 767.98px)`,
 * Tailwind v4's `(width >= 48rem)` and `(width < 48rem)`, `(768px <= width < 1024px)`.
 * `em` and `rem` are 16px: in media queries they're the browser's initial font
 * size, not the page's. Values are rounded to whole pixels, and values 1px
 * apart (`max-width: 767px` next to `min-width: 768px`) count once, as the
 * larger, the width where the layout changes. Names (`md`) aren't read: the
 * agent maps widths to them. Container queries, device-width and
 * cross-origin stylesheets are left out.
 */

/** Media query `em`/`rem`: the initial font size. */
const EM = 16;

export function pageBreakpoints(root: Document | ShadowRoot = document): number[] {
  const widths = new Set<number>();
  const sheets = [
    ...Array.from(root.styleSheets ?? []),
    ...Array.from((root as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []),
  ];
  for (const sheet of sheets) walkSheet(sheet, widths, new Set());
  return merge([...widths].sort((a, b) => a - b));
}

/** Widths in one media condition: `(min-width: 768px) and (max-width: 1023px)` → 768, 1023. */
export function mediaWidths(text: string): number[] {
  const out: number[] = [];
  // Each parenthesized feature that tests `width` (not device-width, height…).
  for (const feature of text.match(/\([^()]*\)/g) ?? []) {
    if (!/(^\(|[\s:<>=(])(min-|max-)?width\b/.test(feature) || /device-width/.test(feature)) continue;
    for (const [, number, unit] of feature.matchAll(/(\d*\.?\d+)(px|r?em)\b/g)) {
      const px = Number(number) * (unit === "px" ? 1 : EM);
      if (px > 0) out.push(Math.round(px));
    }
  }
  return out;
}

/**
 * The viewport widths a media condition holds for, as Pilot's width ranges
 * (CSS px, both ends included, `WidthRange`): `(min-width: 768px)` → from
 * 768, `(max-width: 767.98px)` → to 767, `(width < 64rem)` → to 1023,
 * `(768px <= width < 1024px)` → 768–1023, `screen and (…)` the same. Null
 * when it tests anything else too (orientation, color scheme, height, `or`,
 * `not`, a comma list): not a width range, so it can't be placed among the
 * breakpoints. `{}` for no condition (`all`, `screen`).
 *
 * A device capability that's true now (`(hover: hover)`, `(pointer: fine)`)
 * counts as no condition: it holds for the whole session, whatever the
 * window, so it's no modifier of its own. Tailwind v4 puts every `hover:` in
 * `@media (hover: hover)` (no hover effects on touch screens, where they'd
 * take an extra tap): `hover:bg-…` is the hover rule, `md:hover:bg-…` hover
 * from 768px (the owner's call, 2026-11-26). False now: null, it never
 * applies here. Dark mode and print are choices that switch, not
 * capabilities: still null (placing them is open).
 */
export function mediaRange(text: string): { min?: number; max?: number } | null {
  const t = text.trim().toLowerCase();
  if (/,|\bor\b|\bnot\b/.test(t)) return null;
  const range: { min?: number; max?: number } = {};
  const px = (n: string, unit: string) => Number(n) * (unit === "px" ? 1 : EM);
  const atLeast = (v: number, strict: boolean) => (range.min = Math.max(range.min ?? 0, Math.ceil(strict ? v + 0.01 : v - 0.01)));
  const atMost = (v: number, strict: boolean) => (range.max = Math.min(range.max ?? Number.POSITIVE_INFINITY, Math.floor(strict ? v - 0.01 : v + 0.01)));
  const N = String.raw`(\d*\.?\d+)(px|r?em)`;
  const S = String.raw`\s*`;
  // What's outside the features: only `and`, `only`, `screen`, `all`.
  if (!/^[\s]*$/.test(t.replace(/\([^()]*\)/g, " ").replace(/\b(and|only|screen|all)\b/g, " "))) return null;
  for (const feature of t.match(/\([^()]*\)/g) ?? []) {
    const f = feature.slice(1, -1).trim();
    let m: RegExpMatchArray | null;
    if ((m = new RegExp(`^min-width${S}:${S}${N}$`).exec(f))) atLeast(px(m[1] as string, m[2] as string), false);
    else if ((m = new RegExp(`^max-width${S}:${S}${N}$`).exec(f))) atMost(px(m[1] as string, m[2] as string), false);
    else if ((m = new RegExp(`^width${S}(>=|>|<=|<)${S}${N}$`).exec(f))) {
      const v = px(m[2] as string, m[3] as string);
      if (m[1]?.startsWith(">")) atLeast(v, m[1] === ">");
      else atMost(v, m[1] === "<");
    } else if ((m = new RegExp(`^${N}${S}(<=|<)${S}width${S}(<=|<)${S}${N}$`).exec(f))) {
      atLeast(px(m[1] as string, m[2] as string), m[3] === "<");
      atMost(px(m[5] as string, m[6] as string), m[4] === "<");
    } else if ((m = CAPABILITY.exec(f))) {
      if (!holdsNow(`(${f})`)) return null;
    } else return null;
  }
  if (range.max === Number.POSITIVE_INFINITY) delete range.max;
  return range;
}

/** A device capability: what the device can do (hover, a fine pointer), not a choice that switches. */
const CAPABILITY = /^(any-)?(hover|pointer)\s*:\s*[a-z]+$/;

function holdsNow(query: string): boolean {
  try {
    return typeof matchMedia === "function" ? matchMedia(query).matches : true;
  } catch {
    return false;
  }
}

function walkSheet(sheet: CSSStyleSheet, widths: Set<number>, seen: Set<CSSStyleSheet>) {
  if (seen.has(sheet) || sheet.disabled) return;
  seen.add(sheet);
  if (sheet.media?.mediaText) for (const w of mediaWidths(sheet.media.mediaText)) widths.add(w);
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return; // cross-origin: can't be read
  }
  walkRules(rules, widths, seen);
}

function walkRules(rules: CSSRuleList, widths: Set<number>, seen: Set<CSSStyleSheet>) {
  for (const rule of Array.from(rules)) {
    const r = rule as CSSRule & { media?: MediaList; cssRules?: CSSRuleList; styleSheet?: CSSStyleSheet | null };
    // @media (and @import with a media list). Not @container: it has no `media`.
    if (r.media?.mediaText) for (const w of mediaWidths(r.media.mediaText)) widths.add(w);
    if (r.styleSheet) walkSheet(r.styleSheet, widths, seen);
    if (r.cssRules?.length) walkRules(r.cssRules, widths, seen);
  }
}

/** Sorted widths, with any 1px apart from the next one dropped (767 before 768). */
function merge(sorted: number[]): number[] {
  return sorted.filter((w, i) => sorted[i + 1] !== w + 1);
}
