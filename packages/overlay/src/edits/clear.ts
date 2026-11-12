import type { StyleSource } from "@pilot/protocol";
import { type Declared, declaredWithout } from "../dom/declared.ts";
import type { EditableElement } from "../dom/target.ts";
import type { EditHistory } from "./history.ts";

/**
 * The designer cleared a field: "this element doesn't set `property`".
 *
 * - When the page's own CSS doesn't declare it (only Pilot did, or nothing),
 *   Pilot's inline value is just dropped.
 * - When it does (a stylesheet rule, a Tailwind class, the app's own style
 *   attribute), it's a **removal**: the change set tells the agent to stop
 *   declaring it for this element (not to set it to 0). The page previews
 *   what applies without that declaration: the next rule in the cascade, or
 *   `revert` when no other rule declares it (the browser's own style, like a
 *   list's padding, else the inherited value or the default). That's only
 *   for the preview: the agent is told "don't declare it here", not a value.
 *   The field shows nothing either way.
 */
export function clearProperty(
  history: EditHistory,
  element: EditableElement,
  property: string,
  gesture?: object,
): void {
  // The page's own value: the app's style attribute (as it was before Pilot
  // touched it), or else the stylesheets'.
  const original = history.originalInline(element, property);
  const page: Declared | null = original
    ? { ...original, source: "inline" }
    : declaredWithout(element, property, { inline: true });
  if (!page) return history.apply(element, property, "", gesture);

  // The app's style attribute: removing it shows the stylesheets' value by
  // itself. A rule: it stays in the stylesheet, so the next declaration (or
  // revert) is set inline, with !important if the removed one had it.
  // `revert` rather than `unset`: the page's stylesheets can't see the
  // browser's own styles (declared.ts), and revert falls back to them.
  const rule = page.source !== "inline" ? page.rule : undefined;
  const preview = rule
    ? (declaredWithout(element, property, { inline: true, skip: [rule] })?.value ?? "revert")
    : "";
  history.apply(element, property, preview, gesture, {
    important: !!rule && page.important,
    removal: { from: page.value, source: sourceOf(element, page) },
  });
}

/** Where the page declares a value, for the change set. */
function sourceOf(element: Element, declared: Declared): StyleSource {
  if (declared.source === "inline") return { kind: "inline" };
  const { selector } = declared.source;
  let elements: number | undefined;
  try {
    const root = element.getRootNode() as Document | ShadowRoot;
    elements = root.querySelectorAll(selector).length;
  } catch {
    // A selector querySelectorAll doesn't take (e.g. a pseudo-element): unknown.
  }
  return { kind: "rule", selector, elements };
}
