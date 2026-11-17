import type { ElementState, StyleSource, WidthRange } from "@pilot/protocol";
import { type Declared, declaredValue, declaredWithout, mediaOf } from "../dom/declared.ts";
import type { EditableElement } from "../dom/target.ts";
import type { EditHistory } from "./history.ts";

/**
 * The designer cleared a field: "this element doesn't set `property`".
 *
 * - When the page's own CSS doesn't declare it (only Pilot did, or nothing),
 *   Pilot's value is just dropped.
 * - When it does (a stylesheet rule, a Tailwind class, the app's own style
 *   attribute), it's a **removal**: the change set tells the agent to stop
 *   declaring it for this element (not to set it to 0). The page previews
 *   what applies without that declaration: the next one in the cascade, or
 *   `revert` when nothing else declares it (the browser's own style, like a
 *   list's padding, else the inherited value or the default). That's only
 *   for the preview: the agent is told "don't declare it here", not a value.
 *   The field shows nothing either way.
 *
 * Declared values are the page's own (Pilot's preview sheet is left out), and
 * Pilot never writes the element's `style`, so the page's value is simply the
 * declared one.
 */
export function clearProperty(
  history: EditHistory,
  element: EditableElement,
  property: string,
  gesture?: object,
  /** The viewport widths it's for (the search's width chip). None: every width. */
  widths?: WidthRange,
  /** The element states it's for (the search's state pills). None: the element as it is. */
  states?: readonly ElementState[],
): void {
  const page = declaredValue(element, property, states);
  if (!page) return history.apply(element, property, "", gesture, { widths, states });

  // Without the removed declaration: for the app's style attribute, the
  // stylesheets' value; for a rule, everything else (the style attribute
  // too, which an !important rule was beating). `revert` rather than `unset`
  // when nothing's left: the page's stylesheets can't see the browser's own
  // styles (declared.ts), and revert falls back to them.
  const rule = page.source !== "inline" ? page.rule : undefined;
  const next = rule
    ? declaredWithout(element, property, { inline: false, skip: [rule] }, states)
    : declaredWithout(element, property, { inline: true }, states);
  // For a state, nothing left for it means the element's own value: `revert-layer`
  // lets the element's rules (and Pilot's for it) show through.
  const fallback = states?.length ? "revert-layer" : "revert";
  history.apply(element, property, next?.value ?? fallback, gesture, {
    removal: { from: page.value, source: sourceOf(element, page) },
    widths,
    states,
  });
}

/** Where the page declares a value, for the change set. */
export function sourceOf(element: Element, declared: Declared): StyleSource {
  if (declared.source === "inline") return { kind: "inline" };
  const { selector } = declared.source;
  let elements: number | undefined;
  try {
    const root = element.getRootNode() as Document | ShadowRoot;
    elements = root.querySelectorAll(selector).length;
  } catch {
    // A selector querySelectorAll doesn't take (e.g. a pseudo-element): unknown.
  }
  const media = declared.rule ? mediaOf(declared.rule) : undefined;
  return { kind: "rule", selector, elements, ...(media && { media }) };
}
