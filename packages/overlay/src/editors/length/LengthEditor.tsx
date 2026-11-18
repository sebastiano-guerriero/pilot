import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cssProperty } from "../../css/properties.ts";
import { displayValue, parseValue, stepValue } from "../../css/values.ts";
import type { BoxArea } from "../../dom/boxModel.ts";
import { type InputDraft, PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { declaredOf, isMixed, MIXED } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import { useScrub } from "./useScrub.ts";

/** How a length editor behaves, beyond its property. */
interface LengthOptions {
  /** The box-model area to show on the page while the row is hovered or focused. */
  inspect?: BoxArea;
  /** Add a drag handle to the field (ScrubHandle): drag up or down to change the value. Off by default. */
  scrub?: boolean;
  /** The row's label, when it isn't the property's name (grid-column-start → col-start). */
  name?: string;
}

/**
 * Linking with another length editor's field (size: width and height), set by
 * the editor that shows both. The leading field writes a typed value to
 * `also` too (one undo step) and reports what's being typed (`onDraft`); the
 * other field shows it (`mirror`): selected while it's selected, then the text.
 */
export interface LengthLink {
  also?: string[];
  onDraft?(draft: InputDraft | null): void;
  mirror?: InputDraft;
}

/**
 * A one-value editor for a length property (width, padding-top…), or any
 * one-value property css/values.ts knows the kind of (order, grid lines…): a
 * label and a PropertyInputText, in a PropertyRow. Shows the value set on the element,
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
  mixed,
  onChange,
  onRevert,
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onInspect,
  link,
}: PropertyEditorProps & { property: string; options?: LengthOptions; link?: LengthLink }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const computed = values[property];
  // The declared value (from any source), without its outer calc(); ""
  // leaves the field empty.
  const current = declaredOf({ element, declared }, property);
  const shown = current ? displayValue(current, property) : "";
  const name = options.name ?? property;

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
  // computed value; when that isn't a length, the element's computed width or
  // height for those families (max-width: none), or 0 (gap: normal).
  const stepBase = () => {
    if (computed && Number.isFinite(Number.parseFloat(computed))) return computed;
    // line-height: normal steps from 1.2, unitless (css/values.ts), not 0px.
    if (cssProperty(property).kind === "line-height") return computed ?? "normal";
    const size = /^(?:min-|max-)?(width|height)$/.exec(property)?.[1];
    return size ? getComputedStyle(element).getPropertyValue(size) : "0px";
  };

  const scrub = useScrub({ onChange, onRevert });

  return (
    <PropertyRow
      class="length-editor"
      label={name}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusIn={() => setFocused(true)}
      onFocusOut={() => setFocused(false)}
    >
      <PropertyInputText
        value={shown}
        label={name}
        placeholder={isMixed({ mixed }, property) ? MIXED : undefined}
        inputRef={inputRef}
        onCommit={(text) => {
          // Cleared: remove the value (back to the page's CSS, or the default).
          const next = text.trim() ? parseValue(property, text) : "";
          if (next === null) return;
          // Linked (size): the other properties too, as one undo step.
          if (link?.also?.length) {
            const gesture = {};
            for (const p of [property, ...link.also]) onChange(p, next, { gesture });
          } else if (next !== current) onChange(property, next);
        }}
        onDraft={link?.onDraft}
        mirror={link?.mirror}
        onStep={(delta, text) => {
          const next = stepValue(property, text, delta, stepBase());
          if (next && next !== current) onChange(property, next);
        }}
        // Drag the handle: steps from the value the drag started at, in the
        // same unit, as one undo step. Back at the start, the exact earlier
        // value is restored (no fake edit).
        onScrub={options.scrub ? (steps, text, gesture) => scrub({ property, base: stepBase }, steps, text, gesture) : undefined}
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
    family?: string;
  } & LengthOptions,
): PropertyEditor {
  const { property, inspect, scrub, name, ...rest } = definition;
  const options: LengthOptions = { inspect, scrub, name };
  return {
    id: property,
    properties: [property],
    component: (props: PropertyEditorProps) => <LengthEditor {...props} property={property} options={options} />,
    ...rest,
  };
}
