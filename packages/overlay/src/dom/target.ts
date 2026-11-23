import type { ElementTarget } from "@pilot/protocol";
import { componentSource } from "./component.ts";
import { pageTextContent } from "./text.ts";

/** An element Pilot can edit: anything with an inline `style`. */
export type EditableElement = HTMLElement | SVGElement;

export function isEditable(node: unknown): node is EditableElement {
  return node instanceof HTMLElement || node instanceof SVGElement;
}

const MAX_CLASSES = 2;
const MAX_PATH_SEGMENTS = 5;
const MAX_TEXT = 60;

/** Describe an element so the agent can find it again in the source. */
export function describeElement(el: Element): ElementTarget {
  const target: ElementTarget = {
    selector: uniqueSelector(el),
    at: structuralSelector(el),
    path: domPath(el),
    tag: el.tagName.toLowerCase(),
    classes: [...el.classList],
  };
  if (el.id) target.id = el.id;
  const text = textSnippet(el);
  if (text) target.text = text;
  const source = componentSource(el);
  if (source) target.source = source;
  const context = elementContext(el);
  if (context) target.context = context;
  return target;
}

/** Texts, attribute values and parents at most (see ElementContext): enough to tell, small to send. */
const CONTEXT_TEXTS = 8;
const CONTEXT_ATTRS = 8;
const CONTEXT_PARENTS = 3;
/** Attributes that say what an element is (never `class`, `id`: sent apart; `style` is the page's own, never Pilot's: it doesn't touch it). */
const NAMING_ATTRS = ["href", "src", "alt", "aria-label", "title", "name", "placeholder", "for", "style"];

/**
 * What Pilot's code search finds the element by, besides its own tag,
 * classes, id and text (ElementTarget.context): the texts inside it, each on
 * its own (a nav's text is its links' labels, never one string in the code),
 * attribute values that say what it is (an `href`, an `alt`), its own and its
 * descendants', and its parents' tags and classes. No one detail is enough
 * (classes repeat across a project, text comes from data); several together are.
 */
export function elementContext(el: Element): ElementTarget["context"] | undefined {
  const texts: string[] = [];
  const attrs: string[] = [];
  const addText = (t: string) => {
    const text = t.replace(/\s+/g, " ").trim();
    if (text.length >= 2 && text.length <= 80 && !texts.includes(text) && texts.length < CONTEXT_TEXTS) texts.push(text);
  };
  const addAttrs = (node: Element) => {
    for (const a of [...node.attributes]) {
      if (attrs.length >= CONTEXT_ATTRS) return;
      const named = NAMING_ATTRS.includes(a.name) || (a.name.startsWith("data-") && !a.name.startsWith("data-pilot"));
      const value = a.value.trim();
      if (named && value.length >= 2 && value.length <= 80 && !/^(#|\/|true|false|null|undefined|\d+)$/.test(value) && !attrs.includes(value)) attrs.push(value);
    }
  };
  // In page order: the element, then its descendants (its own text nodes, each element's direct text).
  const walk = (node: Element, depth: number) => {
    addAttrs(node);
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) addText(child.textContent ?? "");
      else if (child instanceof Element && depth < 4 && texts.length < CONTEXT_TEXTS) walk(child, depth + 1);
    }
  };
  walk(el, 0);
  const parents: Array<{ tag: string; id?: string; classes: string[] }> = [];
  for (let p = el.parentElement; p && parents.length < CONTEXT_PARENTS && p !== el.ownerDocument.body; p = p.parentElement) {
    parents.push({ tag: p.tagName.toLowerCase(), ...(p.id ? { id: p.id } : {}), classes: [...p.classList].slice(0, 12) });
  }
  const before = textBeside(el, false);
  const after = textBeside(el, true);
  const heading = headingAbove(el);
  if (!texts.length && !attrs.length && !parents.length && !before && !after && !heading) return undefined;
  return {
    ...(texts.length ? { texts } : {}),
    ...(attrs.length ? { attrs } : {}),
    ...(parents.length ? { parents } : {}),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(heading ? { heading } : {}),
  };
}

/** The text of the nearest heading before `el` on the page, outside it (2 to 80 characters). */
function headingAbove(el: Element): string | undefined {
  const headings = el.ownerDocument.querySelectorAll("h1, h2, h3, h4, h5, h6");
  for (let i = headings.length - 1; i >= 0; i--) {
    const h = headings[i] as Element;
    if (h.contains(el) || !(h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    const text = (h.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.length >= 2 && text.length <= 80 ? text : undefined;
  }
  return undefined;
}

/** How many text nodes Pilot looks through for the texts beside an element. */
const BESIDE_STEPS = 50;

/** The page's nearest text before `el` (or after it, `forward`), outside it: 2 to 80 characters, not a script's or a style's. */
function textBeside(el: Element, forward: boolean): string | undefined {
  const doc = el.ownerDocument;
  if (!doc.body?.contains(el)) return undefined;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  if (forward) {
    // The first node after `el` and all it holds.
    let node: Node | null = el;
    while (node && node !== doc.body && !node.nextSibling) node = node.parentNode;
    if (!node || node === doc.body || !node.nextSibling) return undefined;
    walker.currentNode = node.nextSibling;
    if (node.nextSibling.nodeType !== Node.TEXT_NODE && !walker.nextNode()) return undefined;
  } else {
    walker.currentNode = el;
    if (!walker.previousNode()) return undefined;
  }
  for (let i = 0; i < BESIDE_STEPS; i++) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (parent && !parent.closest("script, style, noscript, template") && text.length >= 2 && text.length <= 80) return text;
    if (!(forward ? walker.nextNode() : walker.previousNode())) return undefined;
  }
  return undefined;
}

/** Short label for the selection overlay, e.g. `button.button--primary`. */
export function shortName(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  const cls = el.classList[0];
  return cls ? `${tag}.${cls}` : tag;
}

/**
 * A selector that matches only `el` in its document: `#id` when unique,
 * otherwise tag + a couple of classes per level, with `:nth-of-type()` where
 * siblings would be ambiguous, climbing until the selector is unique.
 */
export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  const root = el.getRootNode();
  const scope: ParentNode = root instanceof ShadowRoot ? root : doc;
  const isUnique = (selector: string) => {
    try {
      return scope.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  };

  if (el.id && isUnique(`#${CSS.escape(el.id)}`)) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== doc.documentElement) {
    const parent: Element | null = current.parentElement;
    if (current !== el && current.id && isUnique(`#${CSS.escape(current.id)}`)) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    parts.unshift(segment(current, parent));
    const selector = parts.join(" > ");
    if (isUnique(selector)) return selector;
    current = parent;
  }
  return parts.join(" > ");
}

function segment(el: Element, parent: Element | null): string {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].slice(0, MAX_CLASSES).map((c) => `.${CSS.escape(c)}`).join("");
  let seg = tag + classes;
  if (parent) {
    const matching = [...parent.children].filter((c) => c.matches(seg));
    if (matching.length > 1) {
      const sameTag = [...parent.children].filter((c) => c.tagName === el.tagName);
      seg += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
    }
  }
  return seg;
}

/**
 * Where `el` is by tags and positions only, from the nearest ancestor with
 * a unique id (else the body): `#react > main > div > article:nth-of-type(1)`
 * (a position where siblings share the tag). Classes left out: they change
 * with a variant, a prop, a state class, and the element is still the one.
 */
export function structuralSelector(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== doc.body && current !== doc.documentElement) {
    if (current.id && doc.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      return parts.join(" > ");
    }
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    const sameTag = parent ? [...parent.children].filter((c) => c.tagName === current?.tagName) : [];
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag);
    current = parent;
  }
  return ["body", ...parts].join(" > ");
}

/**
 * The element a saved target names, on the page now (after a reload, or a
 * hot reload): by its selector; else, when its classes changed since (a
 * variant picked, a prop set, a class the agent edited), by where it is
 * (`at`); else, for targets saved before `at`, by its path without classes,
 * then its text and its component, when exactly one element is it. Null
 * when none clearly is: a wrong element would be worse than none.
 */
export function findTarget(target: ElementTarget, doc: Document = document): Element | null {
  const query = (selector: string | undefined, all = false): Element[] => {
    if (!selector) return [];
    try {
      return all ? [...doc.querySelectorAll(selector)] : [doc.querySelector(selector)].filter((e): e is Element => !!e);
    } catch {
      return []; // a selector this document can't parse
    }
  };
  const tagged = (e: Element) => e.tagName.toLowerCase() === target.tag;
  const component = target.source?.component;
  const sameText = (e: Element) => !target.text || textSnippet(e) === target.text;
  const sameComponent = (e: Element) => !!component && componentSource(e)?.component === component;
  // Its selector, with its text: it. (Without the text, the selector may now
  // match another element: classes swapped between two cards.)
  const bySelector = query(target.selector).filter(tagged)[0];
  if (bySelector && sameText(bySelector)) return bySelector;
  // At its place, with its text or its component (a prop may have changed the text too).
  const byPlace = query(target.at).filter(tagged)[0];
  if (byPlace && (sameText(byPlace) || sameComponent(byPlace))) return byPlace;
  // The path's segments without their classes (`div.row` → `div`), ids kept: the one with its text and component.
  const loose = target.path
    .split(" > ")
    .map((s) => s.replace(/\..*$/, ""))
    .join(" > ");
  const candidates = query(loose, true)
    .filter(tagged)
    .filter((e) => sameText(e) && (!component || componentSource(e)?.component === component));
  if (candidates.length === 1) return candidates[0] as Element;
  // Only its selector still matches (its text changed: an edit, the agent's): it, as before.
  return bySelector ?? null;
}

/** Human-readable path such as `main > section.hero > h1`, last few levels only. */
export function domPath(el: Element): string {
  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current.tagName !== "HTML" && current.tagName !== "BODY") {
    segments.unshift(shortName(current));
    current = current.parentElement;
  }
  if (segments.length === 0) return el.tagName.toLowerCase();
  return segments.slice(-MAX_PATH_SEGMENTS).join(" > ");
}

/** The element's text as the page has it (Pilot's text changes left out: the agent greps the source for it). */
function textSnippet(el: Element): string | undefined {
  const text = pageTextContent(el).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}
