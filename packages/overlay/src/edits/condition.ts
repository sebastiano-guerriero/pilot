import type { StyleCondition } from "@pilot/protocol";

/**
 * Conditions: a modifier described in words ("the parent .card has focus
 * inside"), for what no pill lists. Pilot reads the words into CSS once, with
 * its own rules (`readCondition`), and from then on it's a modifier like the
 * states: changes made under it are for it, the preview applies them only
 * while it holds (real CSS), and the agent gets both the words and Pilot's
 * reading. Made with the `/` menu's "Create modifier" (the owner's call,
 * 2026-11-27); words Pilot can't read say how to reword them (an agent run
 * for those is a later step).
 *
 * `selector` has `&` for the element, in the subject (the last compound), so
 * the change styles the element: `.card:focus-within &`, `&[data-open]`,
 * `&:has(+ .error)`. `media` is a media condition (`(prefers-reduced-motion:
 * reduce)`, `print`). Plain JSON: saved with the history, sent to the agent.
 */
export type Condition = StyleCondition;

/** What `readCondition` makes of the words: the condition and the element it's about (the parent…), or why not. */
export type Reading = { condition: Condition; target?: Element } | { error: string };

/** Said when the words don't read: how to put it. */
export const REWORD =
  "Pilot can't read that yet. Try “the parent .card has focus inside”, “it has data-open”, “the previous sibling is checked”, “with reduced motion”, or CSS with & for the element (.card:hover &).";

/** Media conditions in words. */
const MEDIA: Array<[RegExp, string]> = [
  [/\breduced?\s+motion\b/, "(prefers-reduced-motion: reduce)"],
  [/\bprint(?:ing|ed)?\b/, "print"],
  [/\bportrait\b/, "(orientation: portrait)"],
  [/\blandscape\b/, "(orientation: landscape)"],
  [/\b(?:touch(?:\s*screen)?s?|no\s+hover|can'?t\s+hover|cannot\s+hover)\b/, "(hover: none)"],
  [/\b(?:more|high|higher|increased)\s+contrast\b/, "(prefers-contrast: more)"],
];

/** States in words → their CSS, most specific first ("focus inside" before "focus"). */
const STATES: Array<[RegExp, string]> = [
  [/\b(?:has\s+|with\s+|gets\s+)?focus\s+(?:inside|within)\b|\bfocus-within\b|\bsomething\s+inside\s+(?:it\s+)?(?:is\s+|has\s+)?focus(?:ed)?\b/, ":focus-within"],
  [/\bfocus[-\s]visible\b|\bkeyboard\s+focus(?:ed)?\b/, ":focus-visible"],
  [/\b(?:is\s+|gets\s+|has\s+)?focus(?:ed)?\b/, ":focus"],
  [/\b(?:is\s+)?hover(?:ed)?\b|\bmouse\s+(?:is\s+)?over\b/, ":hover"],
  [/\b(?:is\s+)?(?:pressed|active)\b/, ":active"],
  [/\b(?:is\s+)?(?:checked|ticked|selected)\b|\bon\b(?=\s*$)/, ":checked"],
  [/\b(?:is\s+)?disabled\b/, ":disabled"],
  [/\b(?:is\s+)?expanded\b/, '[aria-expanded="true"]'],
  [/\b(?:is\s+)?open(?:ed)?\b/, "[open]"],
  [/\b(?:is\s+)?(?:the\s+)?first(?:\s+child|\s+one|\s+item)?\b/, ":first-child"],
  [/\b(?:is\s+)?(?:the\s+)?last(?:\s+child|\s+one|\s+item)?\b/, ":last-child"],
  [/\b(?:is\s+)?empty\b/, ":empty"],
  [/\b(?:is\s+)?(?:invalid)\b/, ":invalid"],
  [/\b(?:is\s+)?(?:required)\b/, ":required"],
];

/** Who the condition is about, before the "what": the element itself, its parent or an ancestor, a sibling. */
type Who = "self" | "parent" | "ancestor" | "previous" | "next";
const WHO: Array<[RegExp, Who]> = [
  [/\b(?:previous|preceding|prior)\s+(?:sibling|element|one)\b|\bthe\s+(?:sibling|element)\s+before\b/, "previous"],
  [/\bnext\s+(?:sibling|element|one)\b|\bthe\s+(?:sibling|element)\s+after\b|\bfollowing\s+(?:sibling|element)\b/, "next"],
  [/\bparent\b/, "parent"],
  [/\b(?:ancestor|container|wrapper|inside|within|in\s+a|in\s+an|in\s+the)\b/, "ancestor"],
];

/** Read `words` for `element`: a condition (and the element it names), or why it can't. */
export function readCondition(words: string, element: Element): Reading {
  const text = words.trim();
  if (!text) return { error: "Describe when: “the parent .card has focus inside”." };

  // CSS as written: a selector with & for the element, or a media condition.
  if (text.includes("&")) {
    const selector = subjectLast(text.replace(/\s+/g, " "));
    if (!validSelector(selector)) return { error: `“${text}” isn't a selector the browser takes.` };
    return { condition: { words: text, selector }, ...targetOfSelector(selector, element) };
  }
  if (/^@media\s/i.test(text) || /^\(.*\)$/.test(text)) {
    const media = text.replace(/^@media\s+/i, "");
    if (!validMedia(media)) return { error: `“${text}” isn't a media condition the browser takes.` };
    return { condition: { words: text, media } };
  }

  const lower = text.toLowerCase();
  const negated = /\b(?:not|isn'?t|doesn'?t|does\s+not|hasn'?t|has\s+no|without)\b/.test(lower);

  // What: a state, a class, an attribute.
  const what = whatOf(text, lower);
  if (!what) {
    // Only media words: a media condition.
    for (const [pattern, media] of MEDIA) if (pattern.test(lower)) return { condition: { words: text, media: negated ? `not all and ${wrap(media)}` : media } };
    return { error: REWORD };
  }
  const css = negated ? `:not(${what.css})` : what.css;

  // Who, from the words before the "what" (else the element itself), and its own class or attribute (`.card`).
  const before = lower.slice(0, what.at);
  const who = WHO.find(([pattern]) => pattern.test(before))?.[1] ?? "self";
  const qualifier = qualifierOf(text.slice(0, what.at));

  let selector: string;
  let target: Element | null | undefined;
  switch (who) {
    case "self":
      selector = `&${qualifier}${css}`;
      target = undefined;
      break;
    case "parent": {
      const parent = element.parentElement;
      // "The parent .card": the nearest ancestor that is one (designers say parent loosely); none: the direct parent.
      target = qualifier ? (parent?.matches(qualifier) ? parent : parent?.closest(qualifier)) : parent;
      if (qualifier && !target) return { error: `No ${qualifier} around this element.` };
      selector = qualifier && target !== parent ? `${qualifier}${css} &` : `${qualifier}${css} > &`;
      break;
    }
    case "ancestor":
      target = qualifier ? element.parentElement?.closest(qualifier) : element.parentElement;
      if (qualifier && !target) return { error: `No ${qualifier} around this element.` };
      selector = `${qualifier}${css} &`;
      break;
    case "previous":
      target = element.previousElementSibling;
      selector = `${qualifier}${css} + &`;
      break;
    case "next":
      target = element.nextElementSibling;
      selector = `&:has(+ ${qualifier || "*"}${css})`;
      break;
  }
  if (!validSelector(selector)) return { error: REWORD };
  // With a media word too ("hovered, with reduced motion"): both.
  const media = MEDIA.find(([pattern]) => pattern.test(lower))?.[1];
  return { condition: { words: text, selector, ...(media ? { media } : {}) }, ...(target ? { target } : {}) };
}

/** The "what" of the words: its CSS, and where in the words it starts (the "who" is before it). */
function whatOf(text: string, lower: string): { css: string; at: number } | null {
  let best: { css: string; at: number } | null = null;
  const consider = (css: string, at: number) => {
    if (!best || at < best.at) best = { css, at };
  };
  // An attribute: `data-open`, `[data-state="open"]`, `aria-pressed is true`, "has the attribute hidden".
  const bracket = /\[[^\]]+\]/.exec(text);
  const verbs = /\b(?:has|have|with|gets|is|are|when)\b/g;
  const attribute = /\b((?:data|aria)-[\w-]+)\b(?:\s*(?:=|is|of|set\s+to|equals)\s*["'“]?([\w-]+)["'”]?)?/i.exec(text);
  const named = /\b(?:the\s+)?attribute\s+["'“]?([\w-]+)["'”]?(?:\s*(?:=|is|set\s+to)\s*["'“]?([\w-]+)["'”]?)?/i.exec(text);
  const classed = /\b(?:has|gets)\s+(?:the\s+)?class\s+\.?([\w-]+)|\b(?:has|gets)\s+(\.[\w-]+)/i.exec(text);
  // A bracket or an attribute name counts only after a verb ("the parent [data-x] is open": the parent's own).
  const afterVerb = (at: number) => {
    verbs.lastIndex = 0;
    for (let m = verbs.exec(lower); m; m = verbs.exec(lower)) if (m.index < at) return true;
    return false;
  };
  if (classed) consider(`.${(classed[1] ?? classed[2] ?? "").replace(/^\./, "")}`, classed.index);
  if (named) consider(named[2] ? `[${named[1]}="${named[2]}"]` : `[${named[1]}]`, named.index);
  // Or with no "who" before it (`data-state is open`: the element's own).
  const ownAt = (at: number) => afterVerb(at) || !WHO.some(([pattern]) => pattern.test(lower.slice(0, at)));
  if (attribute && ownAt(attribute.index))
    consider(attribute[2] ? `[${attribute[1]}="${attribute[2]}"]` : `[${attribute[1]}]`, verbAt(lower, attribute.index));
  if (bracket && ownAt(bracket.index)) consider(bracket[0], verbAt(lower, bracket.index));
  for (const [pattern, css] of STATES) {
    const m = pattern.exec(lower);
    if (m) {
      consider(css, m.index);
      break;
    }
  }
  return best;
}

/** Where the verb before `at` starts (the "what" begins there, not at the attribute's name). */
function verbAt(lower: string, at: number): number {
  const head = lower.slice(0, at);
  const m = /\b(?:has|have|with|gets|is|are|when)\b(?!.*\b(?:has|have|with|gets|is|are|when)\b)/.exec(head);
  return m ? m.index : at;
}

/** The other element's own class, id or attribute, in the words before the "what": `.card`, `#nav`, "with class card". */
function qualifierOf(words: string): string {
  const parts: string[] = [];
  for (const m of words.matchAll(/(?:^|[\s(])([.#][A-Za-z_][\w-]*|\[[^\]]+\])/g)) parts.push(m[1] as string);
  for (const m of words.matchAll(/\b(?:with\s+(?:the\s+)?)?class\s+["'“]?([A-Za-z_][\w-]*)["'”]?/gi)) parts.push(`.${m[1]}`);
  return [...new Set(parts)].join("");
}

/**
 * The element as the subject, last: `& + .x` and `& .x` style the other element, so they're written
 * `&:has(+ .x)`, `&:has(.x)`. Only the first `&`'s compound stays the subject.
 */
function subjectLast(selector: string): string {
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
  return `${selector.slice(0, at)}&${after.slice(0, end)}:has(${/^[>+~]/.test(rest) ? rest : rest})`.trim();
}

const wrap = (media: string) => (media.startsWith("(") ? media : `(${media})`);

/** The selector with the element in `&`'s place (a selector the preview or a check can use). */
export function conditionSelector(condition: Condition, subject: string): string | null {
  return condition.selector ? condition.selector.replace(/&/g, subject) : null;
}

/** Whether the condition holds for `element` right now: its selector matches it (`:scope` is the element), its media matches. */
export function holdsNow(condition: Condition, element: Element): boolean {
  try {
    if (condition.selector && !element.matches(condition.selector.replace(/&/g, ":scope"))) return false;
    if (condition.media && typeof matchMedia === "function" && !matchMedia(condition.media).matches) return false;
    return true;
  } catch {
    return false;
  }
}

/** The condition's identity: its CSS, not its words (two phrasings of one condition are one). */
export function conditionKey(condition: Condition | null | undefined): string {
  return condition ? `${condition.selector ?? ""}|${condition.media ?? ""}` : "";
}

/** The same condition (or both none). */
export function sameCondition(a: Condition | null | undefined, b: Condition | null | undefined): boolean {
  return conditionKey(a) === conditionKey(b);
}

/** The condition as CSS, for the agent: the selector, the `@media`, or both. */
export function conditionCss(condition: Condition): string {
  return [condition.media && `@media ${condition.media}`, condition.selector].filter(Boolean).join(" ");
}

/** Its element, for the on-page highlight, found again from the selector (a raw one): an ancestor or sibling it names. */
function targetOfSelector(selector: string, element: Element): { target?: Element } {
  const head = selector.slice(0, selector.indexOf("&")).trim();
  if (!head) return {};
  const compound = head.replace(/\s*[>+~]\s*$/, "").split(/\s+(?![^(]*\))/).at(-1) ?? "";
  const bare = compound.replace(/:(?:hover|focus|focus-within|focus-visible|active|checked|disabled)\b/g, "") || "*";
  try {
    if (/\+\s*$/.test(head)) return element.previousElementSibling?.matches(bare) ? { target: element.previousElementSibling } : {};
    const found = element.parentElement?.closest(bare);
    return found ? { target: found } : {};
  } catch {
    return {};
  }
}

function validSelector(selector: string): boolean {
  const probe = selector.replace(/&/g, "a");
  try {
    // Throws on a selector the browser can't parse; `CSS.supports` also refuses what it doesn't support.
    document.createDocumentFragment().querySelector(probe);
    if (typeof CSS !== "undefined" && typeof CSS.supports === "function") return CSS.supports(`selector(${probe})`);
    return true;
  } catch {
    return false;
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
