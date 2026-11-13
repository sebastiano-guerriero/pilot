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
