import type { PropertyEditorProps } from "./types.ts";

/**
 * The CSS that applies to the element for `property` (see `declared` in
 * PropertyEditorProps), or "" when nothing declares it. Falls back to the
 * inline value when the host didn't pass `declared` (e.g. in isolated tests).
 */
export function declaredOf(props: Pick<PropertyEditorProps, "element" | "declared">, property: string): string {
  return props.declared?.[property] ?? props.element.style.getPropertyValue(property);
}
