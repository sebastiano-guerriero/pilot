import { splitColor } from "../css/colors.ts";
import { pageTokens } from "./tokens.ts";
import { PREVIEW_ATTRIBUTE } from "./preview.ts";

/**
 * What already gives a value on the page, for the agent to use instead of the
 * raw value: the page's tokens (`--space-md`) and its single-purpose classes
 * (`.padding-md { padding: var(--space-md) }`, a utility CSS framework's,
 * Bootstrap's, the project's own) that come to exactly that value now, at
 * the page's width. Any project styled with CSS has them, whatever its tools.
 *
 * Values are compared as the browser computes them, so `24px`,
 * `1.5rem` and a fluid `clamp(1.5rem, 1.125rem + 0.78vw, 1.75rem)` at this
 * width are the same: a probe inside Pilot's own Shadow DOM, which inherits
 * the page's root variables, takes each value. The page's elements are never
 * touched. A fluid token matches at this width only, and the prompt says so.
 */

export interface Equivalents {
  /** Tokens, as `var(--name)`. */
  tokens: string[];
  /** Classes whose only declaration gives it, as `.name`. */
  classes: string[];
  /** Some of the tokens are fluid (they change with the viewport): equal at this width. */
  fluid?: boolean;
}

/** At most this many of each: the first ones are the ones the page defines first. */
const MAX = 3;
/** Pilot's own sheets: its preview holds the designer's edits, not the page's styles. */
const OWN_SHEETS = `style[${PREVIEW_ATTRIBUTE}], style[data-pilot-tokens]`;
const FLUID = /\b(vw|vh|vmin|vmax|vi|vb|cqw|cqi)\b|clamp\(|min\(|max\(/;
const COLOR_PROPERTIES = /color$|^fill$|^stroke$|^background$/;
const LENGTH_PROPERTIES = /^(padding|margin|gap|row-gap|column-gap|width|height|min-|max-|inset|top|right|bottom|left|border-radius|border(-\w+)?-width|font-size|letter-spacing|line-height|outline-offset|outline-width|text-indent|translate)/;

/** What a length is for, by a property's or a token's name: a font size token isn't a padding's, though both are 16px. */
const USES: Array<[string, RegExp, RegExp]> = [
  ["type", /^(font-size)$/, /(^|-)(text|font|fs|type|size-(xs|sm|md|lg|xl|base))(-|$)/],
  ["radius", /radius$/, /(^|-)(radius|rounded|corner)(-|$)/],
  ["leading", /^line-height$/, /(^|-)(leading|line-height|lh)(-|$)/],
  ["tracking", /^letter-spacing$/, /(^|-)(tracking|letter-spacing|ls)(-|$)/],
  ["border", /^border(-\w+)?-width$|^outline-width$/, /(^|-)(border|stroke|outline)(-|$)/],
  // Spacing tokens also size things (Tailwind's `w-12` is its spacing scale).
  ["space", /^(padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-|max-|text-indent|translate)/, /(^|-)(space|spacing|spacer|gap|gutter|inset|pad|padding|margin)(-|$)/],
];
/** Whether a token can be meant for `property`: its name says nothing, or says the same use. */
function sameUse(token: string, property: string): boolean {
  const name = token.replace(/^--/, "").toLowerCase();
  const forToken = USES.find(([, , re]) => re.test(name))?.[0];
  if (!forToken) return true;
  return USES.find(([, re]) => re.test(property))?.[0] === forToken;
}

/** A probe in Pilot's shadow root, to read values as the browser computes them. Null without Pilot mounted. */
function probe(doc: Document): { element: HTMLElement; remove: () => void } | null {
  const shadow = doc.querySelector("pilot-root")?.shadowRoot;
  if (!shadow) return null;
  const element = doc.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;box-sizing:content-box;";
  shadow.append(element);
  return { element, remove: () => element.remove() };
}

/** What `value` computes to, read as `as` (a length as `width`, a color as `color`); null when it doesn't apply. */
function computed(element: HTMLElement, as: "width" | "color", value: string): string | null {
  // A percentage is the probe's container's, not the element's: no comparison.
  if (as === "width" && /%/.test(value)) return null;
  element.style.setProperty(as, "");
  element.style.setProperty(as, value);
  if (!element.style.getPropertyValue(as)) return null; // Not a value for it.
  const out = getComputedStyle(element).getPropertyValue(as).trim();
  element.style.setProperty(as, "");
  return out || null;
}

const same = (a: string, b: string, as: "width" | "color") => {
  if (as === "color") {
    // As hex and opacity, whichever form the browser gives (`rgb(…)`, `#…`).
    const x = splitColor(a);
    const y = splitColor(b);
    return x.color.toLowerCase() === y.color.toLowerCase() && x.opacity === y.opacity;
  }
  const x = Number.parseFloat(a);
  const y = Number.parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.01;
};

/**
 * The page's tokens and single-purpose classes that give `value` for
 * `property` now; empty when the value is already a token, or isn't a length
 * or a color Pilot can compare.
 */
export function equivalentsOf(property: string, value: string, doc: Document = document): Equivalents | null {
  if (!value || /var\(/.test(value)) return null;
  const as = COLOR_PROPERTIES.test(property) ? "color" : LENGTH_PROPERTIES.test(property) ? "width" : null;
  // A length value of one part only: `24px`, not `8px 16px`.
  if (!as || (as === "width" && /\s/.test(value.replace(/\([^)]*\)/g, "")))) return null;
  const p = probe(doc);
  if (!p) return null;
  try {
    const target = computed(p.element, as, value);
    if (!target) return null;
    const tokens: string[] = [];
    let fluid = false;
    for (const t of pageTokens(doc)) {
      if (tokens.length >= MAX) break;
      if (as === "color" ? t.kind !== "color" : t.kind === "color" || t.kind === "font") continue;
      if (!sameUse(t.name, property)) continue;
      const got = computed(p.element, as, `var(${t.name})`);
      if (got && same(got, target, as)) {
        tokens.push(`var(${t.name})`);
        if (FLUID.test(t.value)) fluid = true;
      }
    }
    const classes = singlePurposeClasses(doc, property)
      .filter((c) => {
        const got = computed(p.element, as, c.value);
        return !!got && same(got, target, as);
      })
      .map((c) => c.name)
      .slice(0, MAX);
    if (!tokens.length && !classes.length) return null;
    return { tokens, classes, ...(fluid ? { fluid } : {}) };
  } finally {
    p.remove();
  }
}

/** A shorthand's longhands, as a rule's declarations list them (`padding: 24px` is four). */
function longhands(property: string): string[] {
  const sides = ["top", "right", "bottom", "left"];
  if (/^(padding|margin)$/.test(property)) return sides.map((s) => `${property}-${s}`);
  if (/^(padding|margin)-(inline|block)$/.test(property)) return [`${property}-start`, `${property}-end`];
  if (property === "inset") return sides;
  if (property === "gap") return ["row-gap", "column-gap"];
  if (property === "border-radius") return ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
  return [];
}

/** The page's classes that set just `property` (one class per selector, outside `@media`), with the value each gives. */
function singlePurposeClasses(doc: Document, property: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  const own = new Set(Array.from(doc.querySelectorAll(OWN_SHEETS)).map((el) => (el as HTMLStyleElement).sheet));
  const seen = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const r = rule as CSSRule & { selectorText?: string; style?: CSSStyleDeclaration; cssRules?: CSSRuleList; media?: unknown; styleSheet?: CSSStyleSheet | null };
      if (r.styleSheet) walkSheet(r.styleSheet);
      if (r.media) continue; // `@media`: a responsive variant, not the class itself.
      if (r.style && r.selectorText) {
        const declared = Array.from({ length: r.style.length }, (_, i) => r.style?.item(i) as string).filter((n) => !n.startsWith("--") && !n.startsWith("-webkit-"));
        const value = r.style.getPropertyValue(property).trim();
        if (value && declared.length && declared.every((n) => n === property || longhands(property).includes(n))) {
          for (const part of r.selectorText.split(",")) {
            const name = part.trim();
            if (/^\.(?:[\w-]|\\.)+$/.test(name) && !seen.has(name)) {
              seen.add(name);
              out.push({ name: name.replace(/\\(.)/g, "$1"), value });
            }
          }
        }
      }
      if (r.cssRules?.length) walk(r.cssRules);
    }
  };
  const walkSheet = (sheet: CSSStyleSheet) => {
    if (own.has(sheet) || sheet.disabled) return;
    try {
      walk(sheet.cssRules);
    } catch {
      // Cross-origin: can't be read.
    }
  };
  for (const sheet of Array.from(doc.styleSheets ?? [])) walkSheet(sheet);
  return out;
}
