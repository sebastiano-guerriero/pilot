import type { ElementState, StyleSource, WidthRange } from "@pilot/protocol";
import { type Declared, baseValue, conditionValue, declaredWithout, isFromReset, mediaOf, rangeValue } from "../dom/declared.ts";
import type { Condition } from "./condition.ts";
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
 *   A rule after it in the cascade declaring the very same value is the same
 *   declaration repeated (a utility framework composing it from several
 *   classes: Tailwind's `shadow-card` and `ring-1` both declare
 *   `box-shadow: var(--tw-inset-shadow), …`), so it goes too: the preview
 *   shows the next different value, and the removal names those rules as well
 *   (`also`), for the agent to stop them all.
 *   The field shows nothing either way.
 *
 * - When only a reset declares it (a rule for every element, `*`: Tailwind's
 *   preflight `border: 0 solid`, `margin: 0`), the element doesn't set it
 *   either: Pilot's value is just dropped, no removal. Removing it would ask
 *   the agent to change the reset, for every element, to clear one field.
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
  /** A condition it's for (edits/condition.ts): the project's own rule for it is what's removed, when it has one. */
  condition?: Condition | null,
): void {
  // Under a condition: its rule skips the element in the preview (dom/excluded.ts), the agent removes the declaration.
  if (condition) {
    const own = conditionValue(element, property, condition, states ?? [], widths);
    if (!own) return history.apply(element, property, "", gesture, { widths, states, condition });
    return history.apply(element, property, "revert-layer", gesture, { removal: { from: own.value, source: sourceOf(element, own) }, widths, states, condition });
  }
  // No width chip and no state: the base value is what's removed (the project's breakpoint and state rules stay).
  // What the field shows, read like CSS: with widths, the project's rule for exactly that breakpoint;
  // without, its rule outside any media query (the base, or those states'). None: nothing of the page's to remove.
  const base = !widths;
  const page = widths ? rangeValue(element, property, widths, states) : baseValue(element, property, states);
  if (!page || isFromReset(page, property)) return history.apply(element, property, "", gesture, { widths, states });

  // Without the removed declaration: for the app's style attribute, the
  // stylesheets' value; for a rule, everything else (the style attribute
  // too, which an !important rule was beating). `revert` rather than `unset`
  // when nothing's left: the page's stylesheets can't see the browser's own
  // styles (declared.ts), and revert falls back to them.
  const rule = page.source !== "inline" ? page.rule : undefined;
  const skip = rule ? [rule] : [];
  const also: string[] = [];
  let next = rule
    ? declaredWithout(element, property, { inline: false, skip, base }, states)
    : declaredWithout(element, property, { inline: true, base }, states);
  // The same value declared again by another rule: the same declaration, gone with it.
  while (rule && next?.rule && next.source !== "inline" && next.value.trim() === page.value.trim() && !skip.includes(next.rule)) {
    skip.push(next.rule);
    also.push(next.source.selector);
    next = declaredWithout(element, property, { inline: false, skip, base }, states);
  }
  const source = sourceOf(element, page);
  // For a state, nothing left for it means the element's own value: `revert-layer`
  // lets the element's rules (and Pilot's for it) show through.
  const fallback = states?.length ? "revert-layer" : "revert";
  history.apply(element, property, next?.value ?? fallback, gesture, {
    removal: { from: page.value, source: source.kind === "rule" && also.length ? { ...source, also } : source },
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
