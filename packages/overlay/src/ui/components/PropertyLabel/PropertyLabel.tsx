import type { ComponentChildren } from "preact";

interface PropertyLabelProps {
  children: ComponentChildren;
}

/** The property name in an editor row. Shared by the property editors. */
export function PropertyLabel({ children }: PropertyLabelProps) {
  return <p class="property-label">{children}</p>;
}
