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
export type Reading = { condition: Condition; target?: Element } | { error: string; hint?: string };

/** Said when the words don't read (short, the owner's call), and how to put them. */
export const REWORD = { error: "Pilot can't read that yet.", hint: "Try “the parent .card is hovered”, “it has data-open”, or CSS (.card:hover &)." };

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
  [/\bplaceholder\s+(?:is\s+)?(?:shown|showing|visible)\b|\bshow(?:s|ing)\s+(?:its\s+|the\s+|a\s+)?placeholder\b/, ":placeholder-shown"],
  [/\b(?:is\s+)?(?:checked|ticked|selected)\b|\bon\b(?=\s*$)/, ":checked"],
  [/\b(?:is\s+)?disabled\b/, ":disabled"],
  [/\b(?:is\s+)?expanded\b/, '[aria-expanded="true"]'],
  [/\b(?:is\s+)?open(?:ed)?\b/, "[open]"],
  [/\b(?:is\s+)?closed\b/, ":not([open])"],
  [/\b(?:is\s+)?(?:the\s+)?only\s+(?:child|one|item)\b/, ":only-child"],
  [/\b(?:odd|every\s+other)(?:\s+(?:one|row|item|child))?\b/, ":nth-child(odd)"],
  [/\beven(?:\s+(?:ones?|rows?|items?|child(?:ren)?))?\b/, ":nth-child(even)"],
  [/\b(?:is\s+)?(?:the\s+)?first(?:\s+child|\s+one|\s+item)?\b/, ":first-child"],
  [/\b(?:is\s+)?(?:the\s+)?last(?:\s+child|\s+one|\s+item)?\b/, ":last-child"],
  [/\b(?:is\s+)?empty\b/, ":empty"],
  [/\b(?:is\s+)?(?:invalid)\b/, ":invalid"],
  [/\b(?:is\s+)?valid\b/, ":valid"],
  [/\b(?:is\s+)?(?:required)\b/, ":required"],
  [/\b(?:is\s+)?read[-\s]?only\b/, ":read-only"],
  [/\b(?:is\s+|was\s+|been\s+)?visited\b/, ":visited"],
  [/\b(?:is\s+)?(?:the\s+)?(?:url'?s?\s+)?target(?:ed)?\b|\blinked\s+to\b/, ":target"],
];

/** Ordinals in words, for "the third item" (first and last are their own). */
const ORDINALS = ["second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** What it may contain, in words → a selector inside `:has()`: "contains an image" → `:has(img)`. */
const CONTAINS: Record<string, string> = {
  image: "img",
  picture: "img",
  photo: "img",
  img: "img",
  icon: "svg",
  svg: "svg",
  link: "a",
  button: "button",
  input: "input",
  field: ":is(input, textarea, select)",
  checkbox: 'input[type="checkbox"]',
  video: "video",
  list: ":is(ul, ol)",
  table: "table",
  heading: ":is(h1, h2, h3, h4, h5, h6)",
  title: ":is(h1, h2, h3, h4, h5, h6)",
  label: "label",
};

/** Elements named in plain words that are tags ("the list is hovered"); other nouns are looked for as classes. */
const NOUN_TAGS: Record<string, string> = {
  list: ":is(ul, ol)",
  item: "li",
  row: "tr",
  form: "form",
  section: "section",
  nav: "nav",
  navigation: "nav",
  header: "header",
  footer: "footer",
  table: "table",
  button: "button",
  link: "a",
  dialog: "dialog",
  details: "details",
  article: "article",
  aside: "aside",
  sidebar: "aside",
  label: "label",
  figure: "figure",
};

/** Words that aren't an element's name: who words, pronouns, the page. */
const NOT_NOUNS = new Set([
  "it", "this", "that", "element", "one", "parent", "ancestor", "container", "wrapper", "sibling", "previous", "next",
  "preceding", "following", "prior", "page", "screen", "window", "viewport", "browser", "user", "mouse", "pointer",
  "attribute", "class", "same", "other", "only", "first", "last", "url", "placeholder", "keyboard",
]);

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
  if (!text) return { error: "Describe when.", hint: "Like “the parent .card is hovered”." };

  // CSS as written: a selector with & for the element, or a media condition.
  if (text.includes("&")) {
    const selector = subjectLast(text.replace(/\s+/g, " "));
    if (!validSelector(selector)) return { error: "The browser doesn't take that selector.", hint: "Check its syntax, with & for the element." };
    return { condition: { words: text, selector }, ...targetOfSelector(selector, element) };
  }
  if (/^@media\s/i.test(text) || /^\(.*\)$/.test(text)) {
    const media = text.replace(/^@media\s+/i, "");
    if (!validMedia(media)) return { error: "The browser doesn't take that media condition.", hint: "Check its syntax: (prefers-reduced-motion: reduce)." };
    return { condition: { words: text, media } };
  }

  const lower = text.toLowerCase();
  const negated = /\b(?:not|isn'?t|doesn'?t|does\s+not|hasn'?t|has\s+no|without)\b/.test(lower);
  // A size: the screen's (a media condition) or a container's ("the card is narrower than 400px": `@container`).
  const size = sizeOf(lower);

  // What: a state, a class, an attribute, what it contains, its place in a list.
  const what = whatOf(text, lower);
  if (!what) {
    if (size) return sizeReading(text, size, element, nounOf(lower.slice(0, lower.search(/\b(?:is|are|gets)\b/) >>> 0)));
    // Only media words: a media condition.
    for (const [pattern, media] of MEDIA) if (pattern.test(lower)) return { condition: { words: text, media: negated ? `not all and ${wrap(media)}` : media } };
    return REWORD;
  }
  let css = negated ? `:not(${what.css})` : what.css;

  // Who, from the words before the "what" (else the element itself), and its own class or attribute (`.card`).
  const before = lower.slice(0, what.at);
  let who = WHO.find(([pattern]) => pattern.test(before))?.[1] ?? "self";
  let qualifier = qualifierOf(text.slice(0, what.at));
  // An element named in plain words ("the card is hovered", "the parent card", "the list"): found around this one,
  // as a tag or by its class; the element itself when it's the one named.
  if (!qualifier) {
    const noun = nounOf(before);
    if (noun) {
      const found = resolveNoun(noun, element, who);
      if (!found) return { error: `No “${noun}” around this element.`, hint: `Name it by its class: “the parent .${noun} is hovered”.` };
      if (found.self && who === "self") qualifier = "";
      else {
        qualifier = found.selector;
        if (who === "self") who = "ancestor";
      }
    }
  }
  // A field that's empty is one showing its placeholder (`:empty` is always true for an input).
  if (who === "self" && /^(?:input|textarea)$/i.test(element.tagName)) css = css.replace(":empty", ":placeholder-shown");

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
      if (qualifier && !target) return { error: `No ${qualifier} around this element.`, hint: "Check its class, or say “the parent”." };
      selector = qualifier && target !== parent ? `${qualifier}${css} &` : `${qualifier}${css} > &`;
      break;
    }
    case "ancestor":
      target = qualifier ? element.parentElement?.closest(qualifier) : element.parentElement;
      if (qualifier && !target) return { error: `No ${qualifier} around this element.`, hint: "Check its class, or say “the parent”." };
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
  if (!validSelector(selector)) return REWORD;
  // With a media word or a size too ("hovered, with reduced motion"): both.
  const media = size?.screen ? size.query : MEDIA.find(([pattern]) => pattern.test(lower))?.[1];
  const container = size && !size.screen ? size.query : undefined;
  return {
    condition: { words: text, selector, ...(media ? { media } : {}), ...(container ? { container } : {}) },
    ...(target ? { target } : {}),
  };
}

/**
 * A width in the words: the screen's ("when the screen is narrower than 600px": a media condition) or, otherwise, a
 * container's ("the card is narrower than 400px": `@container`, its nearest container ancestor's size). Range
 * syntax, as both take it: `(width < 400px)`.
 */
function sizeOf(lower: string): { query: string; screen: boolean } | null {
  const m =
    /\b(narrower|smaller|thinner|less\s+wide|wider|larger|bigger|less|more|under|below|over|above|at\s+least|at\s+most)\s+(?:than\s+)?(\d+(?:\.\d+)?)\s*(px|rem|em)?/.exec(lower);
  if (!m) return null;
  const [, word, number, unit] = m as unknown as [string, string, string, string | undefined];
  // Without a unit, only words that say width ("narrower than 400"): "more than 3 items" is a count.
  const widthWord = /narrower|thinner|wider|less\s+wide/.test(word);
  if (!unit && !widthWord) return null;
  if (!widthWord && !/\b(?:wide|width|narrow|size|big|small)\b/.test(lower) && unit === undefined) return null;
  const op = /narrower|smaller|thinner|less|under|below/.test(word) ? "<" : /at\s+most/.test(word) ? "<=" : /at\s+least/.test(word) ? ">=" : ">";
  const query = `(width ${op} ${number}${unit ?? "px"})`;
  return { query, screen: /\b(?:screen|window|viewport|browser|page|display|device)\b/.test(lower) };
}

/**
 * A size alone: the screen's (media), or a container's. A container query is about the element's nearest container
 * (an ancestor with `container-type`), whatever the words name: the one named ("the card") is highlighted, else
 * that nearest container; the agent makes the one meant a container if it isn't (the prompt's note).
 */
function sizeReading(words: string, size: { query: string; screen: boolean }, element: Element, noun: string | null): Reading {
  if (size.screen) return { condition: { words, media: size.query } };
  const named = noun ? resolveNoun(noun, element, "ancestor") : null;
  let container: Element | null = named ? element.parentElement?.closest(named.selector) ?? null : element.parentElement;
  if (!named) {
    while (container && typeof getComputedStyle === "function" && !/size/.test(getComputedStyle(container).containerType ?? "")) container = container.parentElement;
  }
  return { condition: { words, container: size.query }, ...(container ? { target: container } : {}) };
}

/** The element named in plain words before the "what": "the card", "the parent card", "a list". */
function nounOf(before: string): string | null {
  const found: string[] = [];
  for (const m of before.matchAll(/\b(?:the|a|an|its|this)\s+([a-z][\w-]*)/g)) found.push(m[1] as string);
  for (const m of before.matchAll(/\b(?:parent|ancestor|container|wrapper|sibling)\s+([a-z][\w-]*)/g)) found.push(m[1] as string);
  // Verbs and their contractions ("the parent isn't…") aren't names either.
  const verb = /^(?:is|isn|are|aren|was|has|hasn|have|does|doesn|do|not|no|with|without|that|which|gets|got|when|if|being)$/;
  return found.filter((w) => !NOT_NOUNS.has(w) && !verb.test(w)).at(-1) ?? null;
}

/**
 * A noun as a selector, for this element: a tag (list, item, form…) or a class (`card`, or one it's part of:
 * `rounded-card`), on the element itself or around it (for "the parent", from its parent up). Null: none there.
 */
function resolveNoun(noun: string, element: Element, who: Who): { selector: string; self: boolean } | null {
  const singular = noun.replace(/s$/, "");
  const candidates = [...new Set([noun, singular])];
  const chain: Element[] = [];
  if (who === "self") chain.push(element);
  for (let e = element.parentElement; e && e !== document.documentElement; e = e.parentElement) chain.push(e);
  const exact = (e: Element, word: string) => (e.classList.contains(word) ? `.${word}` : null);
  const part = (e: Element, word: string) => [...e.classList].find((c) => c.split(/[-_:]/).includes(word));
  for (const word of candidates) {
    const tag = NOUN_TAGS[word];
    for (const e of chain) {
      if (tag && e.matches(tag)) return { selector: tag, self: e === element };
      const cls = exact(e, word);
      if (cls) return { selector: cls, self: e === element };
    }
  }
  for (const word of candidates) {
    for (const e of chain) {
      const cls = part(e, word);
      if (cls) return { selector: `.${CSS.escape(cls)}`, self: e === element };
    }
  }
  return null;
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
  // What it contains: "contains an image", "has a checked checkbox", "contains a .badge"; how many children.
  const contains =
    /\b(?:contains?|containing|includes?|has|with)\s+(?:an?\s+|any\s+|some\s+|one\s+or\s+more\s+)?(checked\s+)?(images?|pictures?|photos?|img|icons?|svg|links?|buttons?|inputs?|fields?|checkbox(?:es)?|videos?|list|table|headings?|titles?|labels?)\b/.exec(
      lower,
    );
  if (contains) {
    const word = contains[2] as string;
    const inside = CONTAINS[word] ?? CONTAINS[word.replace(/es$/, "")] ?? CONTAINS[word.replace(/s$/, "")];
    if (inside) consider(`:has(${inside}${contains[1] ? ":checked" : ""})`, contains.index);
  }
  const containsClass = /\b(?:contains?|containing|includes?)\s+(?:an?\s+)?([.#][\w-]+)/.exec(text);
  if (containsClass) consider(`:has(${containsClass[1]})`, containsClass.index);
  const count = /\b(?:has|contains|with)\s+(more\s+than|at\s+least|fewer\s+than|less\s+than)\s+(\d+)\s+(?:items|children|elements|rows|entries|cards|things|ones)\b/.exec(lower);
  if (count) {
    const n = Number(count[2]);
    const kind = count[1] as string;
    const css = /more/.test(kind) ? `:has(> :nth-child(${n + 1}))` : /least/.test(kind) ? `:has(> :nth-child(${n}))` : `:not(:has(> :nth-child(${n})))`;
    consider(css, count.index);
  }
  // Its place in a list: "the third item", "the 5th one".
  const ordinal = new RegExp(`\\b(?:the\\s+)?(${ORDINALS.join("|")}|(\\d+)(?:st|nd|rd|th))\\s+(?:child|item|one|row|element|entry|card)\\b`).exec(lower);
  if (ordinal) consider(`:nth-child(${ordinal[2] ?? ORDINALS.indexOf(ordinal[1] as string) + 2})`, ordinal.index);
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
    // A container's size: the page can't be asked whether it holds (it's only for the check after done: unchecked).
    if (condition.container) return false;
    return true;
  } catch {
    return false;
  }
}

/** The condition's identity: its CSS, not its words (two phrasings of one condition are one). */
export function conditionKey(condition: Condition | null | undefined): string {
  return condition ? `${condition.selector ?? ""}|${condition.media ?? ""}|${condition.container ?? ""}` : "";
}

/** The same condition (or both none). */
export function sameCondition(a: Condition | null | undefined, b: Condition | null | undefined): boolean {
  return conditionKey(a) === conditionKey(b);
}

/** The condition as CSS, for the agent: the selector, the `@media`, or both. */
export function conditionCss(condition: Condition): string {
  return [condition.media && `@media ${condition.media}`, condition.container && `@container ${condition.container}`, condition.selector]
    .filter(Boolean)
    .join(" ");
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

/** A state's selector → Tailwind's variant name, for the pieces Tailwind has one for. */
const PSEUDO_VARIANTS: Record<string, string> = {
  ":hover": "hover",
  ":focus": "focus",
  ":focus-within": "focus-within",
  ":focus-visible": "focus-visible",
  ":active": "active",
  ":checked": "checked",
  ":disabled": "disabled",
  ":empty": "empty",
  ":invalid": "invalid",
  ":required": "required",
  ":first-child": "first",
  ":last-child": "last",
  ":only-child": "only",
  ":nth-child(odd)": "odd",
  ":nth-child(even)": "even",
  ":placeholder-shown": "placeholder-shown",
  ":valid": "valid",
  ":read-only": "read-only",
  ":visited": "visited",
  ":target": "target",
};

/** Media conditions Tailwind has a variant for. */
const MEDIA_VARIANTS: Record<string, string> = {
  "(prefers-reduced-motion: reduce)": "motion-reduce",
  print: "print",
  "(orientation: portrait)": "portrait",
  "(orientation: landscape)": "landscape",
  "(prefers-contrast: more)": "contrast-more",
};

/** One compound's pieces (`.card`, `:hover`, `[data-open]`, `:not(…)`), as Tailwind variants; null when one has none. */
function piecesVariant(compound: string): { qualifier: string; variants: string[] } | null {
  const pieces = compound.match(/:(?:not|has)\((?:[^()]|\([^()]*\))*\)|\[[^\]]+\]|::?[\w-]+(?:\([^)]*\))?|[.#][\w-]+|\*/g) ?? [];
  let qualifier = "";
  const variants: string[] = [];
  for (const piece of pieces) {
    if (piece === "*") continue;
    if (piece.startsWith(".") || piece.startsWith("#")) {
      qualifier ||= piece.slice(1);
      continue;
    }
    // What it contains: Tailwind's `has-[…]`.
    const has = /^:has\((.*)\)$/.exec(piece);
    if (has) {
      variants.push(`has-[${(has[1] as string).replace(/\s+/g, "_")}]`);
      continue;
    }
    const not = /^:not\((.*)\)$/.exec(piece);
    if (not) {
      const inner = piecesVariant(not[1] as string);
      if (!inner || inner.variants.length !== 1) return null;
      variants.push(`not-${inner.variants[0]}`);
      continue;
    }
    const attribute = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(piece);
    if (attribute) {
      const [, name, value] = attribute as unknown as [string, string, string | undefined];
      if (name === "open" && value === undefined) variants.push("open");
      else if (name.startsWith("data-")) variants.push(value === undefined ? name : `data-[${name.slice(5)}=${value}]`);
      else if (name.startsWith("aria-")) variants.push(value === undefined || value === "true" ? name : `aria-[${name.slice(5)}=${value}]`);
      else return null;
      continue;
    }
    const pseudo = PSEUDO_VARIANTS[piece];
    if (!pseudo) return null;
    variants.push(pseudo);
  }
  return { qualifier, variants };
}

/**
 * The condition as Tailwind would write its variant, for the `/` menu's row (the owner's call, 2026-11-27: Tailwind
 * as the reference for the words): `data-selected`, `hover`, `group-hover/card` (an ancestor `.card`),
 * `peer-checked` (the previous sibling), `motion-reduce`; Tailwind's bracket syntax when it has none
 * (`[.card:hover_&]`). Without the trailing colon.
 */
export function conditionVariant(condition: Condition): string {
  const parts: string[] = [];
  if (condition.media) parts.push(MEDIA_VARIANTS[condition.media] ?? widthVariant(condition.media, "") ?? `[@media${condition.media.replace(/\s+/g, "")}]`);
  // A container's width: Tailwind's `@max-[400px]`, `@min-[600px]`.
  if (condition.container) parts.push(widthVariant(condition.container, "@") ?? `[@container${condition.container.replace(/\s+/g, "")}]`);
  if (condition.selector) parts.push(selectorVariant(condition.selector));
  return parts.join(":");
}

/** `(width < 400px)` → `max-[400px]` (with `@` for a container's), `(width >= 600px)` → `min-[600px]`; null for others. */
function widthVariant(query: string, prefix: string): string | null {
  const m = /^\(width\s*(<=?|>=?)\s*([\d.]+[a-z]+)\)$/.exec(query.trim());
  if (!m) return null;
  return `${prefix}${(m[1] as string).startsWith("<") ? "max" : "min"}-[${m[2]}]`;
}

function selectorVariant(selector: string): string {
  const bracket = `[${selector.replace(/\s+/g, "_")}]`;
  const s = selector.trim();
  // The element itself: `&[data-open]`, `&:hover`.
  const self = /^&([^\s>+~]*)$/.exec(s);
  if (self) {
    const own = piecesVariant(self[1] as string);
    return own && !own.qualifier && own.variants.length ? own.variants.join(":") : bracket;
  }
  // An ancestor or the parent (group-*), the previous sibling (peer-*): its compound before the combinator.
  const around = /^([^\s>+~]+)\s*([>+]?)\s*&$/.exec(s);
  if (around) {
    const other = piecesVariant(around[1] as string);
    if (!other || other.variants.length !== 1) return bracket;
    const kind = around[2] === "+" ? "peer" : "group";
    return `${kind}-${other.variants[0]}${other.qualifier ? `/${other.qualifier}` : ""}`;
  }
  return bracket;
}

/** The row's name, Tailwind's words for it: `data-selected` → "Data selected", `group-hover/card` → "Group hover card". */
export function conditionName(condition: Condition): string {
  const variant = conditionVariant(condition);
  if (variant.includes("[")) return condition.words;
  const name = variant.replace(/[-/:]/g, " ").replace(/\s+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}
