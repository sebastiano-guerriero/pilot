import { elementName } from "./name.ts";
import { isEditable } from "./target.ts";

/**
 * The DOM tree panel's rows: the page's elements, as rows, for selecting any of
 * them, wherever they are (overlapped, zero-size, under an ::after). Built
 * from the live DOM each time, expanded where the designer opened it and
 * down to the selection.
 */

/** One row of the tree: an element, or a pseudo-element of one (shown, not selectable). */
export interface DomRow {
  /** The element, or the pseudo-element's owner. */
  element: Element;
  /** For a pseudo-element row: which one. */
  pseudo?: "::before" | "::after";
  /** As the hover label names it (dom/name.ts): `section#pricing`, `div`. */
  name: string;
  /** A short bit of the element's own text, to tell rows apart (`"Get started"`). */
  text?: string;
  /** Nesting level, 0 for the root's children. */
  depth: number;
  /** It has rows inside (children or pseudo-elements). */
  expandable: boolean;
  expanded: boolean;
}

/** Elements that never show: not part of what's drawn, or Pilot itself. */
const HIDDEN_TAGS = new Set(["script", "style", "link", "meta", "template", "noscript", "head", "title", "base", "pilot-root"]);
const MAX_TEXT = 32;

/** The children shown for an element: its elements (no scripts, styles, Pilot), in order. */
export function domChildren(element: Element): Element[] {
  return Array.from(element.children).filter((c) => !HIDDEN_TAGS.has(c.tagName.toLowerCase()));
}

/** The element's ::before / ::after, when they're drawn (`content` set). */
export function pseudoElements(element: Element): Array<"::before" | "::after"> {
  if (typeof getComputedStyle !== "function") return [];
  return (["::before", "::after"] as const).filter((p) => {
    const content = getComputedStyle(element, p).getPropertyValue("content");
    return !!content && content !== "none" && content !== "normal";
  });
}

/** The rows to show under `root`: each expanded element's children and pseudo-elements, depth first. */
export function domRows(root: Element, expanded: ReadonlySet<Element>, nameAttributes: readonly string[] = []): DomRow[] {
  const rows: DomRow[] = [];
  const walk = (parent: Element, depth: number) => {
    const pseudos = pseudoElements(parent);
    if (pseudos.includes("::before")) rows.push(pseudoRow(parent, "::before", depth));
    for (const element of domChildren(parent)) {
      const expandable = domChildren(element).length > 0 || pseudoElements(element).length > 0;
      const open = expandable && expanded.has(element);
      rows.push({ element, name: elementName(element, nameAttributes), text: ownText(element), depth, expandable, expanded: open });
      if (open) walk(element, depth + 1);
    }
    if (pseudos.includes("::after")) rows.push(pseudoRow(parent, "::after", depth));
  };
  walk(root, 0);
  return rows;
}

function pseudoRow(owner: Element, pseudo: "::before" | "::after", depth: number): DomRow {
  return { element: owner, pseudo, name: pseudo, depth, expandable: false, expanded: false };
}

/** The ancestors of `element` below `root`, outermost first: what to expand to show it. */
export function ancestorsWithin(element: Element, root: Element): Element[] {
  const out: Element[] = [];
  for (let el = element.parentElement; el && el !== root; el = el.parentElement) out.unshift(el);
  return out;
}

/** The text directly inside the element (not its children's), trimmed and shortened. */
function ownText(element: Element): string | undefined {
  let text = "";
  for (const node of Array.from(element.childNodes)) if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text;
}

/** A row Pilot can select: an element (not a pseudo-element row) it can edit. */
export function isSelectableRow(row: DomRow): boolean {
  return !row.pseudo && isEditable(row.element);
}
