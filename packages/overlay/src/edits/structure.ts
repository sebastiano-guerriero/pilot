import { DOM_REMOVE } from "@pilot/protocol";
import {
  type InsertSpec,
  copyOf,
  domStructurePreview,
  insertIdOf,
  insertProperty,
  isStructural,
  newElementId,
  newIdOf,
  newRootOf,
  pageChildCount,
  registerNew,
} from "../dom/structure.ts";
import type { EditableElement } from "../dom/target.ts";
import { textRunOf } from "../dom/text.ts";
import type { EditHistory } from "./history.ts";

/**
 * The DOM tree's actions on elements (its row menu): changes to the DOM
 * itself, recorded in the history (dom/structure.ts shows them). Each call
 * is one undo step, for every element given. The body and the document
 * itself can't be deleted, duplicated or given a sibling.
 */

/** Whether `element` can be deleted, duplicated or given a sibling: not the body or the document element. */
export function isMovable(element: Element): boolean {
  return element !== element.ownerDocument.body && element !== element.ownerDocument.documentElement;
}

/**
 * Delete: the page's own elements are hidden until the code removes them.
 * One Pilot added is taken back instead (its insert change dropped), since
 * it was never in the code.
 */
export function removeElements(history: EditHistory, elements: readonly EditableElement[]): void {
  const gesture = {};
  for (const element of elements) {
    if (!isMovable(element)) continue;
    const id = newRootOf(element) === element ? newIdOf(element) : null;
    const insert = id ? history.changes().find((c) => insertIdOf(c.property) === id) : undefined;
    if (insert) history.apply(insert.element, insert.property, "", gesture);
    else history.apply(element, DOM_REMOVE, "1", gesture);
  }
}

/**
 * Duplicate: a copy of each element, right after it, as the page shows it.
 * Pilot's changes to it and its children are carried over to the copy, in
 * the same undo step, so the copy looks like the original; from then on
 * they're apart. Returns the copies, in order.
 */
export function duplicateElements(history: EditHistory, elements: readonly EditableElement[]): EditableElement[] {
  const gesture = {};
  const removed = history.removed();
  const copies: EditableElement[] = [];
  for (const element of elements) {
    if (!isMovable(element)) continue;
    const { copy, counterpart } = copyOf(element, (e) => removed.has(e));
    const spec: InsertSpec = { place: "after", kind: "copy", html: copy.outerHTML, count: pageChildCount(element.parentElement) };
    const id = newElementId();
    registerNew(id, copy);
    // Pilot's changes in effect on the element and inside it, before the copy is added.
    const carried = history
      .changes()
      .filter((c) => (c.element === element || element.contains(c.element)) && !isStructural(c.property) && textRunOf(c.property) === null);
    history.apply(element, insertProperty(id), JSON.stringify(spec), gesture);
    for (const c of carried) {
      const target = counterpart.get(c.element);
      if (!target || !(target instanceof HTMLElement || target instanceof SVGElement)) continue;
      history.apply(target, c.property, c.value, gesture, { removal: c.removal, widths: c.widths, states: c.states });
    }
    copies.push(copy);
  }
  return copies;
}

/**
 * Add child (`inside`: the last child of each element) or Add sibling
 * (`after`: right after it): a new empty `div`. Returns the new elements.
 */
export function addElements(history: EditHistory, elements: readonly EditableElement[], place: "inside" | "after"): EditableElement[] {
  const gesture = {};
  const added: EditableElement[] = [];
  for (const element of elements) {
    if (place === "after" && !isMovable(element)) continue;
    const parent = place === "inside" ? element : element.parentElement;
    const spec: InsertSpec = { place, kind: "new", html: "<div></div>", count: pageChildCount(parent) };
    const id = newElementId();
    history.apply(element, insertProperty(id), JSON.stringify(spec), gesture);
    const node = domStructurePreview.node(id);
    if (node) added.push(node);
  }
  return added;
}
