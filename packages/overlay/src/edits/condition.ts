import type { StyleCondition } from "@pilot/protocol";

/**
 * Conditions: a modifier described in words ("the parent .card has focus
 * inside"), for what no pill lists, made with the `/` menu's Create modifier.
 * Pilot doesn't try to read the words (the owner's call, 2026-11-28: matching
 * them with rules was fragile, one word off and it misread or missed): until
 * the changes are sent, a condition is its words, with no live preview (force
 * state shows its changes). The agent, which understands them, writes it the
 * project's way and gives back a short label and the selector it wrote
 * (EditHistory.nameCondition): from then on the pill and the `/` menu show
 * the label, and the preview, force state and the check after done use the
 * selector. CSS typed as such (`.card:hover &`, `(prefers-reduced-motion:
 * reduce)`) is exact, not a guess: it's used as written from the start.
 *
 * `selector` has `&` for the element, in the subject (the last compound), so
 * the change styles the element: `.card:focus-within &`, `&[data-open]`,
 * `&:has(+ .error)`. `media` is a media condition, `container` a container
 * query. Plain JSON: saved with the history, sent to the agent.
 */
export type Condition = StyleCondition;

/**
 * A condition from what's typed after `/`: CSS as written (a selector with `&` for the element, a media
 * condition in parentheses), or the words alone, for the agent to read.
 */
export function conditionFrom(words: string): Condition {
  const text = words.trim();
  if (text.includes("&")) {
    const selector = subjectLast(text.replace(/\s+/g, " "));
    if (validSelector(selector)) return { words: text, selector };
  }
  if (/^@media\s/i.test(text) || /^\(.*\)$/.test(text)) {
    const media = text.replace(/^@media\s+/i, "");
    if (validMedia(media)) return { words: text, media };
  }
  return { words: text };
}

/** What a condition is called: the agent's label once it named it, else the designer's words. */
export function conditionLabel(condition: Condition): string {
  return condition.label ?? condition.words;
}

/**
 * The element as the subject, last: `& + .x` and `& .x` style the other element, so they're written
 * `&:has(+ .x)`, `&:has(.x)`. Only the last `&`'s compound stays the subject.
 */
export function subjectLast(selector: string): string {
  const at = selector.lastIndexOf("&");
  const after = selector.slice(at + 1);
  // The `&`'s own compound: up to a combinator outside parentheses.
  let depth = 0;
  let end = after.length;
  for (let i = 0; i < after.length; i++) {
    const c = after[i] as string;
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) {
      end = i;
      break;
    }
  }
  const rest = after.slice(end).trim();
  if (!rest) return selector.trim();
  return `${selector.slice(0, at)}&${after.slice(0, end)}:has(${rest})`.trim();
}

/** The selector with the element in `&`'s place (a selector the preview or a check can use). */
export function conditionSelector(condition: Condition, subject: string): string | null {
  return condition.selector ? condition.selector.replace(/&/g, subject) : null;
}

/** Whether the condition holds for `element` right now: its selector matches it (`:scope` is the element), its media matches. */
export function holdsNow(condition: Condition, element: Element): boolean {
  // Words only (not named yet): nothing to ask the page.
  if (!hasCss(condition)) return false;
  try {
    if (condition.selector && !element.matches(condition.selector.replace(/&/g, ":scope"))) return false;
    if (condition.media && typeof matchMedia === "function" && !matchMedia(condition.media).matches) return false;
    if (condition.container && !containerHolds(condition.container, element)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a container query holds for `element` now. Script can't evaluate one (there's no `matchMedia` for
 * containers), so the browser is asked through a probe: a rule under the query setting a custom property on
 * every element, in a sheet its root adopts for the moment (no element or stylesheet of the page touched), read on the
 * element, then the sheet taken back. Each element is matched against its own nearest container, as CSS does.
 */
export function containerHolds(query: string, element: Element): boolean {
  // Its root: the document, or the shadow root it's in (a sheet applies only there).
  const doc = element.getRootNode() as Document | ShadowRoot;
  const view = element.ownerDocument?.defaultView;
  if (typeof CSSStyleSheet === "undefined" || !view || !("adoptedStyleSheets" in doc)) return false;
  const probe = "--pilot-container-probe";
  const sheet = new CSSStyleSheet();
  try {
    // 0 everywhere first: a custom property inherits, and an ancestor's answer (its own container's) isn't this one's.
    sheet.replaceSync(`* { ${probe}: 0; } @container ${query} { * { ${probe}: 1; } }`);
  } catch {
    return false;
  }
  // A query the browser doesn't take is dropped, not thrown: nothing to ask.
  if (sheet.cssRules.length < 2) return false;
  // A copy: the list is live, and restoring it from itself would keep the probe.
  const before = [...doc.adoptedStyleSheets];
  doc.adoptedStyleSheets = [...before, sheet];
  try {
    return view.getComputedStyle(element).getPropertyValue(probe).trim() === "1";
  } finally {
    doc.adoptedStyleSheets = before;
  }
}

/** Whether the condition has CSS (typed as such, or given back by the agent): words only have none. */
export function hasCss(condition: Condition): boolean {
  return !!(condition.selector || condition.media || condition.container);
}

/** The condition's identity: its CSS when it has some (two phrasings of one condition are one), else its words. */
export function conditionKey(condition: Condition | null | undefined): string {
  if (!condition) return "";
  return hasCss(condition) ? `${condition.selector ?? ""}|${condition.media ?? ""}|${condition.container ?? ""}` : `words:${wordsKey(condition.words)}`;
}

/** Words compared as said: case and spacing aside. */
export function wordsKey(words: string): string {
  return words.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The same condition (or both none). */
export function sameCondition(a: Condition | null | undefined, b: Condition | null | undefined): boolean {
  return conditionKey(a) === conditionKey(b);
}

/** The condition as CSS, for the agent: the selector, the `@media`, the `@container`. */
export function conditionCss(condition: Condition): string {
  return [condition.media && `@media ${condition.media}`, condition.container && `@container ${condition.container}`, condition.selector]
    .filter(Boolean)
    .join(" ");
}

/** Whether a selector is one the browser takes (`&` standing for the element). */
export function validSelector(selector: string): boolean {
  const probe = selector.replace(/&/g, "a");
  const supports = typeof CSS !== "undefined" && typeof CSS.supports === "function";
  try {
    // Throws on a selector the browser can't parse; `CSS.supports` also refuses what it doesn't support.
    document.createDocumentFragment().querySelector(probe);
    return supports ? CSS.supports(`selector(${probe})`) : true;
  } catch {
    // A relative selector in `:has()` inside `:is()`: browsers parse it, some DOMs (the tests') don't; `CSS.supports` decides.
    return supports && probe.includes(":has(") && CSS.supports(`selector(${probe})`);
  }
}

function validMedia(media: string): boolean {
  if (typeof matchMedia !== "function") return true;
  try {
    return matchMedia(media).media !== "not all" || /^not all/.test(media);
  } catch {
    return false;
  }
}
