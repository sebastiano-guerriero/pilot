import type { ComponentChildren, HTMLAttributes } from "preact";
import { PropertyLabel } from "../PropertyLabel/PropertyLabel.tsx";

type PropertyRowProps = Omit<HTMLAttributes<HTMLDivElement>, "label"> & {
  /** The property name, on the left. */
  label: ComponentChildren;
  /**
   * The value fields, on the right, in a 128px area. One field fills it; two
   * share it with an 8px gap (60px each).
   */
  children: ComponentChildren;
};

/**
 * An editor row: property name on the left, its value fields on the right.
 * Shared by the one-row editors (width, padding-top…). Other attributes (e.g.
 * pointer and focus handlers) go on the row itself.
 */
export function PropertyRow({ label, children, class: className, ...rest }: PropertyRowProps) {
  return (
    <div {...rest} class={className ? `property-row ${className}` : "property-row"}>
      <PropertyLabel>{label}</PropertyLabel>
      <div class="values">{children}</div>
    </div>
  );
}
