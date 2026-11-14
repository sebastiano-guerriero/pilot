import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { normalizeRatio, parseValue } from "../../css/values.ts";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * The ratios the select offers, as CSS writes them: auto, then the common
 * landscape ratios (square first), then their portrait versions.
 */
export const RATIOS = ["auto", "1 / 1", "4 / 3", "3 / 2", "16 / 9", "21 / 9", "3 / 4", "2 / 3", "9 / 16"] as const;
const CUSTOM = "custom";
const OPTIONS = [...RATIOS, CUSTOM];

/** What the select shows for a value: "" (none), a listed ratio, or custom. */
export function ratioOption(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (v === "auto") return "auto";
  const ratio = normalizeRatio(v);
  return ratio && (RATIOS as readonly string[]).includes(ratio) ? ratio : CUSTOM;
}

/**
 * aspect-ratio: a select with the common ratios, and `custom`, which adds a
 * field next to it for any other ratio (placeholder `x/y`; `4/5`, `4 / 5`
 * and `4:5` all write `4 / 5`, see the ratio kind in css/values.ts). With
 * the field, the two share the value area (60px each), like grid-columns.
 * - A ratio set some other way that's in the list (`16/9`) shows as that
 *   option; anything else shows as custom, with its value in the field.
 * - Picking custom writes nothing until a ratio is typed: the row remembers
 *   it until then (or until the value changes, e.g. undo).
 * - "Select" (no value) clears it, like an emptied field.
 * Tab goes select → field → next editor.
 */
function AspectRatioEditor(props: PropertyEditorProps) {
  const { onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  const value = declaredOf(props, "aspect-ratio");
  const selectRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // Custom, picked before a ratio is typed. Any change of value clears it.
  const [pickedCustom, setPickedCustom] = useState(false);
  useEffect(() => setPickedCustom(false), [value]);
  const option = pickedCustom ? CUSTOM : ratioOption(value);
  const custom = option === CUSTOM;

  const focusSelect = () => selectRef.current?.focus();
  const focusField = () => {
    fieldRef.current?.focus();
    fieldRef.current?.select();
  };
  useLayoutEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.edge === "last" && custom) focusField();
    else focusSelect();
  }, [focusRequest]);

  // Past the row: on to the next editor (or back to the search).
  const tabOut = (direction: 1 | -1) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.());

  return (
    <PropertyRow label="aspect-ratio">
      <PropertySelect
        value={option}
        options={OPTIONS}
        label="aspect-ratio"
        triggerRef={selectRef}
        onChange={(next) => {
          if (next === CUSTOM) {
            setPickedCustom(true);
            // Straight into the field, to type the ratio.
            requestAnimationFrame(focusField);
            return;
          }
          setPickedCustom(false);
          if (next !== value) onChange("aspect-ratio", next);
        }}
        onTab={(direction) => (direction > 0 && custom ? focusField() : tabOut(direction))}
      />
      {custom && (
        <PropertyInputText
          value={ratioOption(value) === CUSTOM ? value : ""}
          placeholder="x/y"
          label="custom aspect ratio"
          inputRef={fieldRef}
          onCommit={(text) => {
            if (!text.trim()) return onChange("aspect-ratio", "");
            const next = parseValue("aspect-ratio", text);
            if (next && next !== value) onChange("aspect-ratio", next);
          }}
          onSubmit={onReturnToSearch}
          onTab={(direction) => (direction < 0 ? focusSelect() : tabOut(1))}
        />
      )}
    </PropertyRow>
  );
}

export const aspectRatioEditor: PropertyEditor = {
  id: "aspect-ratio",
  label: "Aspect ratio",
  properties: ["aspect-ratio"],
  // Tailwind's aspect-* utilities.
  aliases: ["aspect-auto", "aspect-square", "aspect-video"],
  component: AspectRatioEditor,
};
