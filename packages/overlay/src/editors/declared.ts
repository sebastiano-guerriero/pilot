import type { PropertyEditorProps } from "./types.ts";

/**
 * The CSS that applies to the element for `property` (see `declared` in
 * PropertyEditorProps), or "" when nothing declares it. Falls back to the
 * inline value when the host didn't pass `declared` (e.g. in isolated tests).
 */
export function declaredOf(props: Pick<PropertyEditorProps, "element" | "declared">, property: string): string {
  return props.declared?.[property] ?? props.element.style.getPropertyValue(property);
}

/** The selected elements differ on `property`: its field shows "Mixed" (empty, the placeholder). */
export function isMixed(props: Pick<PropertyEditorProps, "mixed">, property: string): boolean {
  return !!props.mixed?.has(property);
}

/** Whether only a reset gives `property` its value (see `reset` in PropertyEditorProps). */
export function isFromReset(props: Pick<PropertyEditorProps, "reset">, property: string): boolean {
  return !!props.reset?.has(property);
}

/** What an empty field reads when the selected elements differ on its property. */
export const MIXED = "Mixed";
