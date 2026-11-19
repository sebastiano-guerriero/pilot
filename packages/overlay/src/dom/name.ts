import { componentName } from "./component.ts";

/**
 * What the selection label calls an element, so the designer can tell what
 * they're about to select. The most telling name it has, in this order:
 *
 * 1. the component it's the top-level element of, by name, where Pilot reads
 *    the page's components (React, Vue: dom/component.ts): `ProductCard`;
 *    elements inside it keep their own names;
 * 2. its id: `section#pricing`;
 * 3. a naming data attribute: the project's own first (`nameAttributes`, e.g.
 *    `data-block`), then the common ones (NAME_ATTRIBUTES): `div[data-testid=hero]`;
 * 4. a form field's `name`: `input[name=email]`;
 * 5. its tag: `div`.
 *
 * Classes are never used: there's no reliable way to tell a meaningful class
 * (`card`) from a utility (`flex`, `p-4`). Nor are data attributes outside the
 * list: libraries add many that describe state (`data-state="open"`), not
 * identity. Nor `aria-label` or the element's text (`a "Get started"`):
 * they're for readers, not what an element is targeted by for styling.
 */

/** Data attributes that name an element, most telling first. */
export const NAME_ATTRIBUTES = [
  // Testing ids, very common.
  "data-testid",
  "data-test",
  "data-cy",
  "data-qa",
  // shadcn/ui names its parts with data-slot (`card-header`).
  "data-slot",
  "data-component",
  "data-name",
  "data-section",
];

const FORM_FIELDS = new Set(["input", "select", "textarea"]);
/** Longest attribute value shown, in characters, before an ellipsis. */
const MAX_TEXT = 24;

export function elementName(el: Element, nameAttributes: readonly string[] = []): string {
  const component = componentName(el);
  if (component) return component;
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${el.id}`;
  for (const attribute of [...nameAttributes, ...NAME_ATTRIBUTES]) {
    const value = el.getAttribute(attribute)?.trim();
    if (value) return `${tag}[${attribute}=${attributeValue(value)}]`;
  }
  const field = FORM_FIELDS.has(tag) ? el.getAttribute("name")?.trim() : undefined;
  if (field) return `${tag}[name=${attributeValue(field)}]`;
  return tag;
}

/** As in a CSS attribute selector: bare when it's a plain word, quoted otherwise. */
function attributeValue(value: string): string {
  return /^[\w-]+$/.test(value) ? value : `"${truncate(value)}"`;
}

function truncate(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text;
}
