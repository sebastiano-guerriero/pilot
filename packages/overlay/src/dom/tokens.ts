import { PREVIEW_ATTRIBUTE } from "./preview.ts";

/**
 * The page's design tokens that are CSS variables: the custom properties its
 * stylesheets define on the document's root (`:root`, `html`, `:host`, the
 * selectors Tailwind v4's `@theme`, shadcn/ui and Open Props use), with the
 * value each resolves to now. Read live, as the breakpoints are, never
 * stored: a token changed in the project shows after hot reload.
 *
 * Tokens that only live in code (a `tokens.json`, a Tailwind v3 config)
 * never reach the page readable: Pilot's server reads those (planned,
 * docs/design-tokens.md). Tailwind's own `--tw-*` plumbing isn't a token.
 */

export type TokenKind = "color" | "length" | "font" | "number" | "other";

export interface Token {
  /** As written: `--color-accent`. */
  name: string;
  /** What it resolves to now, on the root (`#1cf69e`, `0.5rem`). */
  value: string;
  kind: TokenKind;
}

/** Selectors whose variables are the page's tokens (each part of a selector list). */
const ROOT = /^(?::root|html|:host)$/;
/** At most this many: Tailwind and shadcn define many. */
const MAX_TOKENS = 1000;

/** The page's tokens, in the order its stylesheets define them (the first definition counts). */
export function pageTokens(doc: Document = document): Token[] {
  const names = new Set<string>();
  const sheets = [
    ...Array.from(doc.styleSheets ?? []),
    ...Array.from((doc as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets ?? []),
  ];
  // Pilot's own preview sheet holds the designer's edits, not the page's tokens.
  const seen = new Set<CSSStyleSheet>(
    Array.from(doc.querySelectorAll(`style[${PREVIEW_ATTRIBUTE}]`)).flatMap((el) =>
      (el as HTMLStyleElement).sheet ? [(el as HTMLStyleElement).sheet as CSSStyleSheet] : [],
    ),
  );
  const walkSheet = (sheet: CSSStyleSheet) => {
    if (seen.has(sheet) || sheet.disabled) return;
    seen.add(sheet);
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return; // cross-origin: can't be read
    }
    walkRules(rules);
  };
  const walkRules = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (names.size >= MAX_TOKENS) return;
      const r = rule as CSSRule & {
        selectorText?: string;
        style?: CSSStyleDeclaration;
        cssRules?: CSSRuleList;
        styleSheet?: CSSStyleSheet | null;
      };
      if (r.styleSheet) walkSheet(r.styleSheet); // @import
      if (r.style && r.selectorText && r.selectorText.split(",").some((s) => ROOT.test(s.trim()))) {
        for (let i = 0; i < r.style.length; i++) {
          const name = r.style.item(i);
          if (name.startsWith("--") && !name.startsWith("--tw-")) names.add(name);
        }
      }
      if (r.cssRules?.length) walkRules(r.cssRules); // @layer, @media, @supports
    }
  };
  for (const sheet of sheets) walkSheet(sheet);
  const root = getComputedStyle(doc.documentElement);
  return [...names].flatMap((name) => {
    const value = root.getPropertyValue(name).trim();
    return value ? [{ name, value, kind: kindOf(name, value) }] : [];
  });
}

/** What a token's value is: the value decides, the name helps where it's ambiguous (a font stack). */
export function kindOf(name: string, value: string): TokenKind {
  if (/^-?\d*\.?\d+$/.test(value)) return "number";
  if (/^-?\d*\.?\d+(px|rem|em|%|vw|vh|vmin|vmax|ch|ex)$/.test(value) || /^calc\(/.test(value)) return "length";
  if (/^#[\da-f]{3,8}$/i.test(value) || /^(rgb|hsl|hwb|lab|lch|oklab|oklch|color)a?\(/i.test(value)) return "color";
  // A font's name can read as a color keyword's shape (one word): the name decides first.
  if (/font|family/i.test(name) || /,\s*(sans-serif|serif|monospace|system-ui)\b/.test(value)) return "font";
  return isNamedColor(value) ? "color" : "other";
}

/** A color by name (`rebeccapurple`), as the browser reads it. */
function isNamedColor(value: string): boolean {
  if (!/^[a-z]+$/i.test(value)) return false;
  try {
    return (
      typeof CSS !== "undefined" &&
      CSS.supports?.("color", value) === true &&
      !/^(inherit|initial|unset|currentcolor|transparent)$/i.test(value)
    );
  } catch {
    return false;
  }
}
