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
  /** The tag (`section`), or the pseudo-element (`::after`). */
  tag: string;
  /** What identifies it, always shown: `#pricing[data-name=frame]` (its id and data-* attributes; no classes). */
  identifiers?: string;
  /** What it points at or is: `href="#home"`, `src="/images/hero.jpg"`, `type="email" name="email"` (see describe). */
  details?: string;
  /** A short bit of the element's own text, to tell rows apart (`Get started`). */
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

/**
 * The children shown for an element: its elements (no scripts, styles,
 * Pilot), in order, without the ones in `hidden` (deleted in the tree:
 * still on the page, hidden by the preview).
 */
export function domChildren(element: Element, hidden?: ReadonlySet<Element>): Element[] {
  return Array.from(element.children).filter((c) => !HIDDEN_TAGS.has(c.tagName.toLowerCase()) && !hidden?.has(c));
}

/** The element's ::before / ::after, when they're drawn (`content` set). */
export function pseudoElements(element: Element): Array<"::before" | "::after"> {
  if (typeof getComputedStyle !== "function") return [];
  return (["::before", "::after"] as const).filter((p) => {
    const content = getComputedStyle(element, p).getPropertyValue("content");
    return !!content && content !== "none" && content !== "normal";
  });
}

/**
 * The rows to show under `root`: each expanded element's children and
 * pseudo-elements, depth first, leaving out the elements in `hidden`. The
 * tree's root is the document element, so its one row is the body (the head
 * is hidden): the wrapper of everything, the only row on an empty page.
 */
export function domRows(root: Element, expanded: ReadonlySet<Element>, hidden?: ReadonlySet<Element>): DomRow[] {
  const rows: DomRow[] = [];
  const walk = (parent: Element, depth: number) => {
    const pseudos = pseudoElements(parent);
    if (pseudos.includes("::before")) rows.push(pseudoRow(parent, "::before", depth));
    for (const element of domChildren(parent, hidden)) {
      const expandable = domChildren(element, hidden).length > 0 || pseudoElements(element).length > 0;
      const open = expandable && expanded.has(element);
      rows.push({ element, ...describe(element), depth, expandable, expanded: open });
      if (open) walk(element, depth + 1);
    }
    if (pseudos.includes("::after")) rows.push(pseudoRow(parent, "::after", depth));
  };
  walk(root, 0);
  return rows;
}

function pseudoRow(owner: Element, pseudo: "::before" | "::after", depth: number): DomRow {
  return { element: owner, pseudo, tag: pseudo, depth, expandable: false, expanded: false };
}

/** Longest value shown for an attribute, in characters, before an ellipsis. */
const MAX_VALUE = 40;

/**
 * A row's description, the way the element would be told apart in its code:
 * - the tag;
 * - its identifiers, always: `#id`, then every `data-*` attribute
 *   (`[data-slot=card-header]`; Pilot's own left out). Never classes;
 * - what it points at or is, by kind: a link's `href`, a media element's
 *   `src` (an image's first `srcset` candidate without one), a field's
 *   `type` and `name`, a label's `for`, a form's `action`, a `role`; for an
 *   element with no text of its own (an icon button), its `aria-label`;
 * - its own text.
 */
export function describe(element: Element): Pick<DomRow, "tag" | "identifiers" | "details" | "text"> {
  const tag = element.tagName.toLowerCase();
  let identifiers = element.id ? `#${element.id}` : "";
  for (const { name, value } of Array.from(element.attributes)) {
    if (!name.startsWith("data-") || name.startsWith("data-pilot")) continue;
    identifiers += value ? `[${name}=${quoteIfNeeded(shorten(value))}]` : `[${name}]`;
  }
  const attr = (name: string) => element.getAttribute(name)?.trim() || undefined;
  const details: string[] = [];
  const add = (name: string, value: string | undefined) => {
    if (value) details.push(`${name}="${shorten(value)}"`);
  };
  switch (tag) {
    case "a":
    case "area":
      add("href", url(attr("href")));
      break;
    case "img":
      add("src", url(attr("src") ?? attr("srcset")?.split(/\s+/)[0]));
      break;
    case "video":
    case "audio":
    case "source":
    case "track":
    case "iframe":
    case "embed":
      add("src", url(attr("src") ?? (tag === "source" ? attr("srcset")?.split(/\s+/)[0] : undefined)));
      break;
    case "object":
      add("data", url(attr("data")));
      break;
    case "input":
      add("type", attr("type") ?? "text");
      add("name", attr("name"));
      break;
    case "select":
    case "textarea":
      add("name", attr("name"));
      break;
    case "button":
      add("type", attr("type"));
      break;
    case "label":
      add("for", attr("for"));
      break;
    case "form":
      add("action", url(attr("action")));
      break;
  }
  add("role", attr("role"));
  const text = ownText(element);
  if (!text) add("aria-label", attr("aria-label"));
  return {
    tag,
    ...(identifiers && { identifiers }),
    ...(details.length && { details: details.join(" ") }),
    ...(text && { text }),
  };
}

/** A URL as short as it can be told: the page's own without the site (`/images/hero.jpg`), a data: URL as its type. */
function url(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("data:")) return `${value.slice(0, value.indexOf(",") > 0 ? value.indexOf(",") : 20)},…`;
  try {
    const u = new URL(value, location.href);
    if (u.origin === location.origin) return `${u.pathname}${u.search}${u.hash}` || "/";
  } catch {
    // Not a URL: as written.
  }
  return value;
}

/** Long values keep their end (a file name, the last path segment): `…/images/hero.jpg`. */
function shorten(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length > MAX_VALUE ? `…${v.slice(-(MAX_VALUE - 1))}` : v;
}

/** As in a CSS attribute selector: bare when it's a plain word, quoted otherwise. */
function quoteIfNeeded(value: string): string {
  return /^[\w-]+$/.test(value) ? value : `"${value}"`;
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
