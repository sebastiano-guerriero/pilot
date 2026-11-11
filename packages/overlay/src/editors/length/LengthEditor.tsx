import { useLayoutEffect, useRef } from "preact/hooks";
import { cssProperty } from "../../css/properties.ts";
import { displayValue, parseValue, stepValue } from "../../css/values.ts";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyLabel } from "../../ui/components/PropertyLabel/PropertyLabel.tsx";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * A one-value editor for a length property (width, min-width, max-width…):
 * a label and a PropertyInputText. Shows the value set on the element, or the
 * property's default dimmed (from the CSS property db) when there's none.
 * Accepts what every Pilot field does (css/values.ts): `120` as px, any
 * supported unit, the property's keywords, and math without calc()
 * (`100% - 20px`). Clearing the field removes the value. ↑/↓ step the number
 * and keep its unit.
 */
export function LengthEditor({
  property,
  element,
  values,
  onChange,
  focusRequest,
  onReturnToSearch,
  onTabOut,
}: PropertyEditorProps & { property: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Only a value set on the element counts; otherwise the field is empty and
  // the placeholder shows the default. calc() is never shown.
  const current = element.style.getPropertyValue(property);
  const shown = displayValue(current);

  // Jumped in from the search (or tabbed in from another editor): focus it, selected.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  // ↑/↓ on an empty field or a keyword start from a px value: the property's
  // computed value, or the element's computed width when that isn't a length
  // (e.g. max-width: none).
  const stepBase = () => {
    const computed = values[property];
    if (computed && Number.isFinite(Number.parseFloat(computed))) return computed;
    return getComputedStyle(element).width;
  };

  return (
    <div class="length-editor">
      <PropertyLabel>{property}</PropertyLabel>
      <PropertyInputText
        value={shown}
        placeholder={cssProperty(property).initial}
        label={property}
        inputRef={inputRef}
        onCommit={(text) => {
          // Cleared: remove the value, back to the default.
          if (!text.trim()) return onChange(property, "");
          const next = parseValue(property, text);
          if (next && next !== current) onChange(property, next);
        }}
        onStep={(delta, text) => {
          const next = stepValue(property, text, delta, stepBase());
          if (next && next !== current) onChange(property, next);
        }}
        onSubmit={onReturnToSearch}
        // One field: Tab moves on to the next editor in the dialog (or back to
        // the search when there's none).
        onTab={(direction) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.())}
      />
    </div>
  );
}

/** Define a length editor for `property`. */
export function lengthEditor(options: {
  property: string;
  label: string;
  aliases?: string[];
  keywords?: string[];
  family?: string;
}): PropertyEditor {
  const { property, ...rest } = options;
  return {
    id: property,
    properties: [property],
    component: (props: PropertyEditorProps) => <LengthEditor {...props} property={property} />,
    ...rest,
  };
}
