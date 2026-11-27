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

/**
 * A value only a reset gives (`* { padding: 0 }`, Tailwind's preflight): what
 * the field shows dimmed, as its placeholder, the field itself empty, since
 * the element doesn't set it (the owner's call: a cleared field read as
 * still set). "" otherwise.
 */
export function resetValueOf(props: Pick<PropertyEditorProps, "element" | "declared" | "reset">, property: string): string {
  return isFromReset(props, property) ? declaredOf(props, property) : "";
}

/** What an empty field reads when the selected elements differ on its property. */
export const MIXED = "Mixed";

/** What the page's own CSS declares for `property`, without Pilot's changes (see `page` in PropertyEditorProps). */
export function pageOf(props: Pick<PropertyEditorProps, "page" | "declared" | "element">, property: string): string {
  return props.page?.[property] ?? declaredOf(props, property);
}

/** Whether Pilot sets `property` itself (see `own` in PropertyEditorProps). */
export function isOwn(props: Pick<PropertyEditorProps, "own">, property: string): boolean {
  return !!props.own?.has(property);
}
