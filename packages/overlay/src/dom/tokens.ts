import type { FileToken } from "@pilot/protocol";
import { splitTopLevel } from "./declared.ts";
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

export type TokenKind = "color" | "length" | "font" | "number" | "shadow" | "easing" | "time" | "other";

export interface Token {
  /** As written: `--color-accent`. A file's token: the CSS variable Pilot gives it (see fileTokenVariable). */
  name: string;
  /** What it resolves to now, on the root (`#1cf69e`, `0.5rem`). */
  value: string;
  kind: TokenKind;
  /** A token from a file in the project (`color.brand.primary` in `tokens.json`), not a CSS variable on the page. */
  source?: { name: string; file: string; line?: number };
}

/** Pilot's own sheet defining the project's file tokens as CSS variables, for its previews (see setFileTokens). */
export const FILE_TOKENS_ATTRIBUTE = "data-pilot-tokens";

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
    Array.from(doc.querySelectorAll(`style[${PREVIEW_ATTRIBUTE}], style[${FILE_TOKENS_ATTRIBUTE}]`)).flatMap((el) =>
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
  if (isShadow(value)) return "shadow";
  // An easing (Tailwind's `--ease-out`, a spring's `linear(…)`), a duration (`--default-transition-duration`).
  if (/^(cubic-bezier|linear|steps)\(/i.test(value) || /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$/i.test(value)) return "easing";
  if (/^-?\d*\.?\d+(ms|s)$/i.test(value)) return "time";
  return isNamedColor(value) ? "color" : "other";
}

const SHADOW_LENGTH = /^(-?\d*\.?\d+([a-z]+|%)?|(calc|var)\(.*\))$/i;

/**
 * A shadow (box-shadow's value, Tailwind's `--shadow-md`): each layer,
 * comma-separated, is 2 to 4 lengths, `inset` at either end, and a color
 * before or after them (a var() last is the color, as the box-shadow editor
 * reads it).
 */
function isShadow(value: string): boolean {
  return splitTopLevel(value, ",").every((layer) => {
    const parts = splitTopLevel(layer.trim(), " ").filter((p) => p && p.toLowerCase() !== "inset");
    let lengths = 0;
    let others = 0;
    for (const [i, part] of parts.entries()) {
      // A var() last, after two lengths, is the color (`0 1px 2px var(--shadow-color)`).
      const colorVar = /^var\(/i.test(part) && i === parts.length - 1 && lengths >= 2;
      if (SHADOW_LENGTH.test(part) && !colorVar) lengths++;
      else others++;
    }
    return lengths >= 2 && lengths <= 4 && others <= 1;
  });
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

/**
 * The project's tokens that only live in files (Pilot's server reads them:
 * a `tokens.json`, Sass variables), as the page can use them: each a CSS
 * variable of Pilot's own, defined on the root in a sheet of its own
 * (FILE_TOKENS_ATTRIBUTE), so a picked one previews as `var(--…)` and is
 * checked like any change. The code never has them: the agent's prompt
 * says what each stands for (ChangeSet.fileTokens). One the page already
 * defines by that name is left to the page's.
 */
let fileTokenList: Token[] = [];

/** `color.brand.primary` → `--color-brand-primary`; `$brand-500` → `--brand-500`. */
export function fileTokenVariable(name: string): string {
  return `--${name.replace(/^\$/, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Takes the server's list (setting the sheet that defines them); none clears it. */
export function setFileTokens(tokens: readonly FileToken[], doc: Document = document): void {
  const onPage = new Set(pageTokens(doc).map((t) => t.name));
  const seen = new Set<string>();
  fileTokenList = tokens.flatMap((t): Token[] => {
    const name = fileTokenVariable(t.name);
    if (name === "--" || onPage.has(name) || seen.has(name)) return [];
    seen.add(name);
    return [{ name, value: t.value, kind: kindOf(t.name, t.value), source: { name: t.name, file: t.file, ...(t.line ? { line: t.line } : {}) } }];
  });
  let sheet = doc.querySelector<HTMLStyleElement>(`style[${FILE_TOKENS_ATTRIBUTE}]`);
  if (!fileTokenList.length) return sheet?.remove();
  if (!sheet) {
    sheet = doc.createElement("style");
    sheet.setAttribute(FILE_TOKENS_ATTRIBUTE, "");
    doc.head.append(sheet);
  }
  const text = `:root { ${fileTokenList.map((t) => `${t.name}: ${t.value};`).join(" ")} }`;
  if (sheet.textContent !== text) sheet.textContent = text;
}

/** The file tokens Pilot has, as page tokens with their source. */
export function fileTokensNow(): readonly Token[] {
  return fileTokenList;
}

/** Every token the page can use: its own CSS variables, then the project's file tokens. */
export function allTokens(doc: Document = document): Token[] {
  const page = pageTokens(doc);
  const names = new Set(page.map((t) => t.name));
  return [...page, ...fileTokenList.filter((t) => !names.has(t.name))];
}

