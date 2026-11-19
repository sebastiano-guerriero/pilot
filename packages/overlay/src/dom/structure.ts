import { DOM_INSERT, DOM_REMOVE } from "@pilot/protocol";
import type { EditableElement } from "./target.ts";

/**
 * Changes to the DOM itself, made in the DOM tree: an element deleted, or
 * added after or inside one (Duplicate, Add sibling, Add child). Recorded in
 * the history like CSS changes, under reserved properties (DOM_REMOVE on the
 * deleted element; `dom:insert:<id>` on the element a new one is added
 * after or inside, its InsertSpec as the value), and shown on the page here.
 *
 * The page's own nodes are never removed or moved: a framework (React,
 * Vue…) keeps hold of the nodes it rendered, and the next re-render would
 * fail on one that isn't where it left it. So a deleted element is only
 * hidden, by the preview stylesheet (`display: none`), and a new element is
 * one of Pilot's own, put next to the page's nodes: a copy made from the
 * element (its markup when it was duplicated) or a new empty one. Pilot's
 * nodes carry NEW_ATTRIBUTE; a re-render that takes one out (its parent
 * replaced) gets it put back, by a MutationObserver.
 *
 * Pilot's nodes shift the page's own: a list's third item is no longer its
 * third child. So the selectors the history finds elements by are taken and
 * looked up with Pilot's nodes out of the page (`withoutInserted`), and an
 * element inside a new one is found from that one (`[data-pilot-new="…"] >
 * p:nth-child(2)`, newSelector).
 */

/** Marks a new element, Pilot's own node: its id, which the history's insert property names. */
export const NEW_ATTRIBUTE = "data-pilot-new";

/** What an insert change records (its value, as JSON). */
export interface InsertSpec {
  /** Right after the element the change is on, or inside it as its last child. */
  place: "after" | "inside";
  /** A copy of that element, or a new empty element. */
  kind: "copy" | "new";
  /** The new element's markup: a copy's as the page showed it (Pilot's marks and ids left out), or `<div></div>`. */
  html: string;
  /**
   * How many of the page's own elements the parent it goes in had, when it
   * was added: once the code has it, the parent has one more (edits/verify.ts).
   */
  count: number;
}

/** The history property of the new element `id`. */
export function insertProperty(id: string): string {
  return `${DOM_INSERT}${id}`;
}

/** The new element a history property adds, or null when it isn't an insert. */
export function insertIdOf(property: string): string | null {
  return property.startsWith(DOM_INSERT) ? property.slice(DOM_INSERT.length) : null;
}

/** Whether a history property is a change to the DOM (a delete or an insert), not CSS or text. */
export function isStructural(property: string): boolean {
  return property === DOM_REMOVE || property.startsWith(DOM_INSERT);
}

/** An insert change's spec, from its value; null for "" (taken back) or anything unreadable. */
export function parseSpec(value: string): InsertSpec | null {
  if (!value) return null;
  try {
    const spec = JSON.parse(value) as InsertSpec;
    if ((spec.place !== "after" && spec.place !== "inside") || typeof spec.html !== "string") return null;
    return spec;
  } catch {
    return null;
  }
}

let counter = 0;
/** A new element's id, unique in the tab (reloads included). */
export function newElementId(): string {
  return `${Date.now().toString(36)}${(counter++).toString(36)}`;
}

/** The new element `element` is, or is inside (the nearest), or null for the page's own. */
export function newRootOf(element: Element): EditableElement | null {
  return element.closest<EditableElement>(`[${NEW_ATTRIBUTE}]`);
}

/** The id of a new element (its NEW_ATTRIBUTE). */
export function newIdOf(element: Element): string | null {
  return element.getAttribute(NEW_ATTRIBUTE);
}

/** One new element to show: `id`, placed by `anchor` as `spec` says. */
export interface InsertRule {
  anchor: Element;
  id: string;
  spec: InsertSpec;
}

/** Where EditHistory shows the new elements. Given every insert in effect, in the order made, each time. */
export interface StructurePreview {
  render(inserts: InsertRule[]): void;
  /**
   * The new element `id`: the one made before, or made now from `spec`'s
   * markup (null without one). The same node every time, so the history's
   * changes on it (and inside it) keep finding it.
   */
  node(id: string, spec?: InsertSpec | null): EditableElement | null;
}

/** Every new element made in this page load, by id. */
const nodes = new Map<string, EditableElement>();
/** The ones on the page now. */
let placed: EditableElement[] = [];
/** What the latest render asked for, to put nodes back after a re-render took them out. */
let current: InsertRule[] = [];

let observer: MutationObserver | null = null;

/** Runs Pilot's own moves: the mutations they cause aren't the page's. */
function quiet(move: () => void): void {
  move();
  observer?.takeRecords();
}

/** Puts every new element in its place (by its anchor, in order), and takes out the ones no longer asked for. */
function place(): void {
  quiet(() => {
    const keep: EditableElement[] = [];
    // The last new element put after each anchor: the next one goes after it, so they keep their order.
    const lastAfter = new Map<Element, Element>();
    for (const { anchor, id, spec } of current) {
      const node = domStructurePreview.node(id, spec);
      if (!node || !anchor.isConnected || node.contains(anchor)) continue;
      if (spec.place === "inside") {
        if (node.parentNode !== anchor) anchor.append(node);
      } else {
        const prev = lastAfter.get(anchor) ?? anchor;
        if (prev.nextSibling !== node) prev.after(node);
        lastAfter.set(anchor, node);
      }
      keep.push(node);
    }
    for (const node of placed) if (!keep.includes(node)) node.remove();
    placed = keep;
  });
  observe();
}

function observe(): void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
  if (!placed.length) {
    observer?.disconnect();
    return;
  }
  if (!observer) {
    observer = new MutationObserver(() => {
      // The page took one out (a re-render replaced its parent), or brought back an anchor: put them back.
      const missing = current.some(({ anchor, id }) => anchor.isConnected && !nodes.get(id)?.isConnected);
      if (missing || placed.some((n) => !n.isConnected)) place();
    });
  }
  observer.disconnect();
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/** The DOM structure preview. One per page, like the stylesheet preview. */
export const domStructurePreview: StructurePreview = {
  render(inserts) {
    current = inserts;
    place();
  },
  node(id, spec) {
    const made = nodes.get(id);
    if (made || !spec) return made ?? null;
    const template = document.createElement("template");
    template.innerHTML = spec.html;
    const first = template.content.firstElementChild;
    const node = first instanceof HTMLElement || first instanceof SVGElement ? first : document.createElement("div");
    document.adoptNode(node);
    node.setAttribute(NEW_ATTRIBUTE, id);
    nodes.set(id, node);
    return node;
  },
};

/**
 * Register `node` as the new element `id`: a copy made with copyOf, so the
 * node shown is the one the copied changes were mapped onto.
 */
export function registerNew(id: string, node: EditableElement): void {
  node.setAttribute(NEW_ATTRIBUTE, id);
  nodes.set(id, node);
}

/**
 * Runs `read` with Pilot's new elements out of the page, then puts them
 * back where they were: selectors are taken and looked up as the page's own
 * DOM has them (an `:nth-of-type()` that counted a copy would point at the
 * wrong element once the copy goes).
 */
export function withoutInserted<T>(read: () => T): T {
  const out = placed.filter((n) => n.isConnected && !placed.some((p) => p !== n && p.contains(n)));
  if (!out.length) return read();
  const spots = out.map((node) => ({ node, parent: node.parentNode as Node, next: node.nextSibling }));
  quiet(() => {
    for (const { node } of spots) node.remove();
  });
  try {
    return read();
  } finally {
    // Back in reverse order: a node's next sibling may be one of them, put back first.
    quiet(() => {
      for (const { node, parent, next } of spots.reverse()) parent.insertBefore(node, next && next.parentNode === parent ? next : null);
    });
  }
}

/**
 * A selector for an element inside a new one (or the new one itself),
 * from that new element: `[data-pilot-new="lx3k0"] > ul:nth-child(2) > li:nth-child(1)`.
 */
export function newSelector(element: Element): string | null {
  const root = newRootOf(element);
  if (!root) return null;
  const parts: string[] = [];
  for (let el: Element = element; el !== root; el = el.parentElement as Element) {
    const parent = el.parentElement as Element;
    parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${Array.prototype.indexOf.call(parent.children, el) + 1})`);
  }
  return [`[${NEW_ATTRIBUTE}="${newIdOf(root)}"]`, ...parts].join(" > ");
}

/** The element a newSelector names (null when it isn't one, or the new element isn't known). */
export function resolveNew(selector: string): EditableElement | null {
  const match = new RegExp(`^\\[${NEW_ATTRIBUTE}="([^"]+)"\\](.*)$`).exec(selector);
  if (!match) return null;
  const root = nodes.get(match[1] as string);
  const rest = (match[2] as string).trim();
  if (!root || !rest) return root ?? null;
  try {
    return root.querySelector<EditableElement>(`:scope ${rest}`);
  } catch {
    return null;
  }
}

/**
 * A copy of `source` and its children as the page shows them (Pilot's text
 * changes included), for Duplicate: without Pilot's marks (`data-pilot-*`)
 * or ids (two elements with one id would break the page's selectors), and
 * without the children `leaveOut` says were deleted. `counterpart` maps each
 * element of `source` that's in the copy to its copy, to carry Pilot's
 * changes over.
 */
export function copyOf(
  source: EditableElement,
  leaveOut: (element: Element) => boolean,
): { copy: EditableElement; counterpart: Map<Element, Element> } {
  const copy = source.cloneNode(true) as EditableElement;
  const counterpart = new Map<Element, Element>();
  const walk = (a: Element, b: Element) => {
    counterpart.set(a, b);
    for (let i = 0; i < a.children.length; i++) walk(a.children[i] as Element, b.children[i] as Element);
  };
  walk(source, copy);
  for (const [original, copied] of counterpart) {
    if (original !== source && leaveOut(original)) copied.remove();
  }
  for (const [original, copied] of [...counterpart]) {
    if (!copy.contains(copied)) {
      counterpart.delete(original);
      continue;
    }
    copied.removeAttribute("id");
    for (const name of copied.getAttributeNames()) if (name.startsWith("data-pilot")) copied.removeAttribute(name);
  }
  return { copy, counterpart };
}

/** How many of the page's own elements `parent` has: Pilot's new elements and Pilot itself left out. */
export function pageChildCount(parent: Element | null): number {
  if (!parent) return 0;
  return Array.from(parent.children).filter((c) => !c.hasAttribute(NEW_ATTRIBUTE) && c.tagName !== "PILOT-ROOT").length;
}
