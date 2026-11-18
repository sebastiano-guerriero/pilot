import { type ComponentInstance, instancesOf, ownersOf } from "./component.ts";
import { type EditableElement, isEditable } from "./target.ts";

/**
 * Select similar: the elements like `element` elsewhere on the page, the
 * same part of each copy of what repeats (the title of every card, not
 * every heading).
 *
 * **By component first**, where Pilot reads the page's components (React,
 * Vue: dom/component.ts): the nearest component rendering `element` that has
 * other instances on the page is the repeated unit, whatever their props
 * (`<Button variant="primary">` and `variant="ghost"` are both Buttons, the
 * same code). The same part of each instance is found by the path from its
 * top-level element down to `element`, by tag and position: variants may
 * differ in classes. One with only one instance (the page's Hero) passes
 * the question on to the component around it.
 *
 * **Else by the page's structure**, for plain HTML (and components whose
 * instances Pilot can't match):
 *
 * 1. **The repeated unit** is the nearest of `element` and its ancestors
 *    that has look-alikes: elements with the same tag and the same classes
 *    anywhere on the page (nearly the same, with the same child elements,
 *    for a copy the page's script marked `active`), or, for one with no
 *    classes, the same naming attribute (`data-slot`), or else siblings
 *    with the same tag and the same child elements (the `li`s of a list,
 *    the rows of a table). A classless element with no children (a plain
 *    `p` among others) is no unit: those are a text's paragraphs, not copies.
 * 2. **The same part** of each copy is found by walking down the path from
 *    the unit to `element`, step by step: at each, the child with the same
 *    tag and classes, at the same position among those. A copy without it
 *    (a card with no badge) is left out.
 *
 */

/** How far up the repeated unit is looked for. */
const MAX_LEVELS = 8;
/** At most this many similar elements. */
const MAX_SIMILAR = 200;
/** Naming attributes that make a classless element distinctive (as in dom/name.ts). */
const NAMING = ["data-slot", "data-component"];

/** What Select similar finds: the elements, and the component they're instances of when found by component. */
export interface Similar {
  elements: EditableElement[];
  component?: string;
}

/** The elements like `element` (not itself), in document order; empty when nothing repeats. */
export function findSimilar(element: EditableElement): EditableElement[] {
  return similarOf(element).elements;
}

/** The elements like `element`, and the component they're instances of (see the top of this file). */
export function similarOf(element: EditableElement): Similar {
  let byComponent: Similar | null = null;
  try {
    byComponent = componentSimilar(element);
  } catch {
    // A framework's internals Pilot didn't expect: the page's structure instead.
  }
  return byComponent ?? { elements: structural(element) };
}

function componentSimilar(element: EditableElement): Similar | null {
  for (const owner of ownersOf(element).slice(0, MAX_LEVELS)) {
    const at = instancePath(owner, element);
    if (!at) continue;
    const copies = instancesOf(element, owner).filter((i) => !overlaps(i, owner));
    const found = copies.map((copy) => followInstance(copy, at)).filter((e): e is EditableElement => !!e && e !== element && isEditable(e));
    if (found.length)
      return { elements: inPageOrder([...new Set(found)]).slice(0, MAX_SIMILAR), ...(owner.name ? { component: owner.name } : {}) };
  }
  return null;
}

/** The same instance, or one inside the other (a tree of nested instances). */
function overlaps(a: ComponentInstance, b: ComponentInstance): boolean {
  return a.roots.some((r) => b.roots.some((o) => r === o || r.contains(o) || o.contains(r)));
}

/** Where `element` is in an instance: which of its top-level elements, then each step's tag and position among same-tag siblings. */
function instancePath(
  instance: ComponentInstance,
  element: Element,
): { root: number; tag: string; steps: Array<{ tag: string; index: number }> } | null {
  const root = instance.roots.findIndex((r) => r.contains(element));
  if (root < 0) return null;
  const top = instance.roots[root] as Element;
  const steps: Array<{ tag: string; index: number }> = [];
  for (let e: Element = element; e !== top; e = e.parentElement as Element) {
    const alike = [...(e.parentElement as Element).children].filter((c) => c.tagName === e.tagName);
    steps.unshift({ tag: e.tagName, index: alike.indexOf(e) });
  }
  return { root, tag: top.tagName, steps };
}

function followInstance(copy: ComponentInstance, at: NonNullable<ReturnType<typeof instancePath>>): Element | null {
  let e: Element | null = copy.roots[at.root] ?? null;
  if (!e || e.tagName !== at.tag) return null;
  for (const step of at.steps) {
    const alike: Element[] = [...e.children].filter((c) => c.tagName === step.tag);
    e = alike[step.index] ?? null;
    if (!e) return null;
  }
  return e;
}

function inPageOrder(elements: EditableElement[]): EditableElement[] {
  return elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

/** By the page's structure (see the top of this file). */
function structural(element: EditableElement): EditableElement[] {
  let unit: Element | null = element;
  for (let level = 0; unit && unit !== document.body && level < MAX_LEVELS; level++, unit = unit.parentElement) {
    const copies = copiesOf(unit);
    if (!copies.length) continue;
    const path = pathTo(unit, element);
    const found = copies.map((copy) => follow(copy, path)).filter((e): e is EditableElement => !!e && e !== element && isEditable(e));
    if (found.length) return [...new Set(found)].slice(0, MAX_SIMILAR);
  }
  return [];
}

/** Other elements that look like `unit` (see findSimilar), none inside or around it. */
function copiesOf(unit: Element): Element[] {
  const classes = classList(unit);
  const naming = NAMING.find((a) => unit.hasAttribute(a));
  let candidates: Element[];
  if (classes.length) {
    // The same classes; nearly the same (a copy the page marked `active`) with the same child elements too.
    const shape = shapeOf(unit);
    candidates = [...document.getElementsByTagName(unit.tagName)].filter((e) => {
      const other = classList(e);
      return sameClasses(classes, other) || (closeClasses(classes, other) && shapeOf(e) === shape);
    });
  } else if (naming) {
    const value = unit.getAttribute(naming);
    candidates = [...document.getElementsByTagName(unit.tagName)].filter((e) => e.getAttribute(naming) === value && !classList(e).length);
  } else {
    const shape = shapeOf(unit);
    if (!shape) return [];
    candidates = [...(unit.parentElement?.children ?? [])].filter(
      (e) => e.tagName === unit.tagName && !classList(e).length && shapeOf(e) === shape,
    );
  }
  return candidates.filter((e) => e !== unit && !e.contains(unit) && !unit.contains(e));
}

/** The steps from `unit` down to `element`: each child's tag, classes, and position among its look-alikes. */
function pathTo(unit: Element, element: Element): Array<{ tag: string; classes: string[]; index: number }> {
  const steps = [];
  for (let e: Element | null = element; e && e !== unit; e = e.parentElement) {
    const parent = e.parentElement as Element;
    const classes = classList(e);
    const alike = [...parent.children].filter((c) => sameStep(c, e.tagName, classes));
    steps.unshift({ tag: e.tagName, classes, index: alike.indexOf(e) });
  }
  return steps;
}

/** The element at `path` in `copy`, or null when the copy doesn't have it. */
function follow(copy: Element, path: ReturnType<typeof pathTo>): Element | null {
  let at: Element | null = copy;
  for (const step of path) {
    if (!at) return null;
    const alike: Element[] = [...at.children].filter((c) => sameStep(c, step.tag, step.classes));
    at = alike[step.index] ?? null;
  }
  return at;
}

function sameStep(e: Element, tag: string, classes: string[]): boolean {
  return e.tagName === tag && (classes.length ? closeClasses(classes, classList(e)) : !classList(e).length);
}

/**
 * Nearly the same classes: they share one, and differ by at most one (or a
 * fifth of them, for long utility lists), so a copy marked `active` or
 * `is-open` by the page's script still counts.
 */
function closeClasses(a: readonly string[], b: readonly string[]): boolean {
  const setB = new Set(b);
  const shared = a.filter((c) => setB.has(c)).length;
  if (!shared) return false;
  const union = a.length + b.length - shared;
  return union - shared <= Math.max(1, Math.floor(union / 5));
}

function sameClasses(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c));
}

function classList(e: Element): string[] {
  return [...e.classList];
}

/** The tags of an element's children, in order: "" for none (then it's no unit by itself). */
function shapeOf(e: Element): string {
  return [...e.children].map((c) => c.tagName).join(",");
}
