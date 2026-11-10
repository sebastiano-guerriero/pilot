import type { ElementTarget } from "@pilot/protocol";

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
    path: domPath(el),
    tag: el.tagName.toLowerCase(),
    classes: [...el.classList],
  };
  if (el.id) target.id = el.id;
  const text = textSnippet(el);
  if (text) target.text = text;
  return target;
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

function textSnippet(el: Element): string | undefined {
  const text = el.textContent?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}
