import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { displayValue, parseValue, scrubIncrement, stepValue } from "../../css/values.ts";
import type { BoxArea } from "../../dom/boxModel.ts";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { declaredOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/** How a length editor behaves, beyond its property. */
interface LengthOptions {
  /** The box-model area to show on the page while the row is hovered or focused. */
  inspect?: BoxArea;
  /** Add a drag handle to the field (ScrubHandle): drag up or down to change the value. Off by default. */
  scrub?: boolean;
}

/**
 * A one-value editor for a length property (width, padding-top…): a label and
 * a PropertyInputText, in a PropertyRow. Shows the value set on the element,
 * or an empty field when there's none (computed values are never shown).
 * Accepts what every Pilot field does (css/values.ts): `120` as px, any
 * supported unit, the property's keywords, and math without calc()
 * (`100% - 20px`). Clearing the field removes the value. ↑/↓ step the number
 * and keep its unit.
 */
export function LengthEditor({
  property,
  options = {},
  element,
  values,
  declared,
  onChange,
  onRevert,
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onInspect,
}: PropertyEditorProps & { property: string; options?: LengthOptions }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const computed = values[property];
  // The declared value (from any source), without its outer calc(); ""
  // leaves the field empty.
  const current = declaredOf({ element, declared }, property);
  const shown = current ? displayValue(current) : "";

  // Jumped in from the search (or tabbed in from another editor): focus it, selected.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  // While the row is hovered or focused, show its area on the page (e.g. the
  // padding it sets), in place of the selection highlight.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const inspecting = !!options.inspect && (hovered || focused);
  useLayoutEffect(() => {
    if (options.inspect) onInspect?.(inspecting ? [options.inspect] : null);
  }, [inspecting]);
  useEffect(() => () => void (options.inspect && onInspect?.(null)), []);

  // ↑/↓ on an empty field or a keyword start from a px value: the property's
  // computed value; when that isn't a length, the element's computed width for
  // the width family (max-width: none), or 0 (gap: normal).
  const stepBase = () => {
    if (computed && Number.isFinite(Number.parseFloat(computed))) return computed;
    return property.endsWith("width") ? getComputedStyle(element).width : "0px";
  };

  return (
    <PropertyRow
      class="length-editor"
      label={property}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusIn={() => setFocused(true)}
      onFocusOut={() => setFocused(false)}
    >
      <PropertyInputText
        value={shown}
        label={property}
        inputRef={inputRef}
        onCommit={(text) => {
          // Cleared: remove the value (back to the page's CSS, or the default).
          if (!text.trim()) return onChange(property, "");
          const next = parseValue(property, text);
          if (next && next !== current) onChange(property, next);
        }}
        onStep={(delta, text) => {
          const next = stepValue(property, text, delta, stepBase());
          if (next && next !== current) onChange(property, next);
        }}
        // Drag the handle: steps from the value the drag started at, in the
        // same unit, as one undo step. Back at the start, the exact earlier
        // value is restored (no fake edit).
        onScrub={
          options.scrub
            ? (steps, startText, gesture) => {
                if (steps === 0) return onRevert?.(property, gesture);
                const next = stepValue(property, startText, steps * scrubIncrement(startText), stepBase());
                if (next) onChange(property, next, { gesture });
              }
            : undefined
        }
        onSubmit={onReturnToSearch}
        // One field: Tab moves on to the next editor in the dialog (or back to
        // the search when there's none).
        onTab={(direction) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.())}
      />
    </PropertyRow>
  );
}

/** Define a length editor for `property`. */
export function lengthEditor(
  definition: {
    property: string;
    label: string;
    aliases?: string[];
    keywords?: string[];
    family?: string;
  } & LengthOptions,
): PropertyEditor {
  const { property, inspect, scrub, ...rest } = definition;
  const options: LengthOptions = { inspect, scrub };
  return {
    id: property,
    properties: [property],
    component: (props: PropertyEditorProps) => <LengthEditor {...props} property={property} options={options} />,
    ...rest,
  };
}
