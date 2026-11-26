import { type ColorScheme, type ElementState, isColorScheme } from "@pilot/protocol";

/**
 * The color scheme a rule is for, as the project writes it (the owner's
 * call, 2026-11-26: `dark:` and `light:` modifiers): a media query
 * (`@media (prefers-color-scheme: dark)`, Tailwind's default `dark:`), or a
 * class or attribute on the root, Tailwind's class strategy
 * (`:where(.dark, .dark *)`) and hand-written CSS (`.dark .card`,
 * `[data-theme="dark"] .card`, `html.dark .card`). Read like a state: a
 * rule for dark counts with the `dark` pill, never without it, whether or
 * not the page is dark right now (nothing is forced on the page).
 */

/** The scheme's class or attribute, as projects write it: `.dark`, `[data-theme="dark"]` (theme, mode, color-scheme, scheme). */
const token = (scheme: ColorScheme) => String.raw`(?:\.${scheme}(?![\w\\-])|\[data-(?:theme|mode|color-scheme|scheme)=["']?${scheme}["']?\])`;

/**
 * The scheme a selector puts on its element, and the selector without it, to
 * match the element as it is: `.btn:where(.dark, .dark *)` → dark, `.btn`;
 * `.dark .card` → dark, `.card`. None when it names none.
 */
export function selectorScheme(selector: string): { scheme?: ColorScheme; stripped: string } {
  for (const scheme of ["dark", "light"] as const) {
    const t = token(scheme);
    // The element itself or an ancestor: Tailwind's class strategy.
    let out = selector.replace(new RegExp(String.raw`:(?:where|is)\(\s*${t}\s*,\s*${t}\s+\*\s*\)`, "g"), "");
    // An ancestor that's only the token (on html or :root), then a combinator.
    out = out.replace(new RegExp(String.raw`(^|[\s(,>+~])(?:html|:root|\*)?${t}(?:\s*>\s*|\s+)`, "g"), "$1");
    if (out !== selector) return { scheme, stripped: out.trim() || "*" };
  }
  return { stripped: selector };
}

const MEDIA = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/i;

/** The scheme a media condition is for: `(prefers-color-scheme: dark)` → dark. */
export function mediaScheme(text: string): ColorScheme | undefined {
  return MEDIA.exec(text)?.[1]?.toLowerCase() as ColorScheme | undefined;
}

/** A media condition without its scheme: `(min-width: 768px) and (prefers-color-scheme: dark)` → `(min-width: 768px)`. */
export function withoutScheme(text: string): string {
  return text
    .replace(new RegExp(MEDIA.source, "gi"), "")
    .replace(/\band\s+and\b/gi, "and")
    .replace(/^\s*and\b|\band\s*$/gi, "")
    .trim();
}

/** The scheme among states, if any. */
export function schemeOf(states: readonly ElementState[] | undefined): ColorScheme | undefined {
  return states?.find(isColorScheme);
}

/**
 * How a rule of Pilot's own is written for a scheme, the project's way:
 * after its subject (`:where(.dark, .dark *)`), or as a media condition.
 * The project's form is read from its stylesheets: a class or attribute
 * when its rules use one (the page's toggle then shows it), else the media
 * query (also with no dark rules at all: the agent is told to use the
 * project's own).
 */
export function schemeParts(scheme: ColorScheme | undefined): { selector: string; media?: string } {
  if (!scheme) return { selector: "" };
  const form = projectForm();
  if (form.kind === "media") return { selector: "", media: `(prefers-color-scheme: ${scheme})` };
  const own = form.tokens[scheme];
  if (own) return { selector: `:where(${own}, ${own} *)` };
  // Light with only a dark class: what isn't dark.
  const other = form.tokens[scheme === "light" ? "dark" : "light"] as string;
  return { selector: `:not(${other}, ${other} *)` };
}

type Form = { kind: "media" } | { kind: "class"; tokens: Partial<Record<ColorScheme, string>> };

let cached: { signature: string; form: Form } | null = null;

/** The project's way of writing the scheme, from its stylesheets (cached until they change). */
function projectForm(): Form {
  const sheets = Array.from(document.styleSheets);
  const signature = sheets.map((s) => `${s.href ?? ""}:${safeRules(s)?.length ?? -1}`).join("|");
  if (cached?.signature === signature) return cached.form;
  const tokens: Partial<Record<ColorScheme, string>> = {};
  const visit = (rules: CSSRuleList | null | undefined) => {
    for (const rule of Array.from(rules ?? [])) {
      const r = rule as CSSRule & { selectorText?: string; cssRules?: CSSRuleList };
      if (typeof r.selectorText === "string") {
        for (const scheme of ["dark", "light"] as const) {
          if (tokens[scheme]) continue;
          const found = new RegExp(token(scheme)).exec(r.selectorText)?.[0];
          if (found && selectorScheme(r.selectorText).scheme === scheme) tokens[scheme] = found;
        }
      }
      if (r.cssRules?.length) visit(r.cssRules);
    }
  };
  for (const sheet of sheets) visit(safeRules(sheet));
  const form: Form = tokens.dark || tokens.light ? { kind: "class", tokens } : { kind: "media" };
  cached = { signature, form };
  return form;
}

function safeRules(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    return sheet.cssRules;
  } catch {
    return null;
  }
}
