import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { parseValue } from "../../css/values.ts";
import { Icon, type IconName } from "../../ui/components/Icon/Icon.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { tokensFor } from "../../ui/components/TokenMenu/tokens.ts";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf, isMixed, MIXED, resetValueOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/** A property picked from a few values, or typed (aspect-ratio, flex-grow). */
export interface PresetConfig {
  /** Editor id and the property it writes: `aspect-ratio`. */
  property: string;
  /** Search label: "Aspect ratio". */
  label: string;
  /** The values the select offers, as CSS writes them (parseValue's output), in menu order. */
  presets: readonly string[];
  /** The custom field's placeholder: `x/y`. */
  placeholder?: string;
  /** The custom field's accessible name: `custom aspect ratio`. */
  customLabel: string;
  /** Tailwind's class names for the presets. */
  aliases?: string[];
  /**
   * The select's icon variant: an icon per preset, for `custom`, and for ""
   * (nothing set), as in keywordEditor.
   */
  icons?: Record<string, IconName>;
  /** A word after each preset, dimmed (font-weight's 700 → bold). */
  hints?: Record<string, string>;
  /** The row's label, when the property's name doesn't fit (perspective-origin → persp-origin). */
  name?: string;
}

export const CUSTOM = "custom";

/**
 * What the select shows for a value: "" (none), a preset, or custom. A value
 * written another way that means a preset (`16/9`, `1.0`) shows as it.
 */
export function presetOption(config: Pick<PresetConfig, "property" | "presets">, value: string): string {
  const v = value.trim();
  if (!v) return "";
  const parsed = parseValue(config.property, v) ?? v;
  return config.presets.includes(parsed) ? parsed : CUSTOM;
}

/**
 * A select with the presets and `custom`, which adds a field next to it for
 * any other value (what every Pilot field accepts for the property, see
 * css/values.ts). With the field, the two share the value area (61px each),
 * like grid-columns.
 * - A value set some other way that means a preset shows as that option;
 *   anything else shows as custom, with its value in the field.
 * - Picking custom writes nothing until a value is typed: the row remembers
 *   it until then (or until the value changes, e.g. undo).
 * - "Select" (no value) clears it, like an emptied field.
 * Tab goes select → field → next editor.
 */
export function PresetEditor({ config, ...props }: PropertyEditorProps & { config: PresetConfig }) {
  const { onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  const { property } = config;
  // A value only a reset gives shows dimmed, as the placeholder.
  const fromReset = resetValueOf(props, property);
  const value = fromReset ? "" : declaredOf(props, property);
  const selectRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // Custom, picked before a value is typed. Any change of value clears it.
  const [pickedCustom, setPickedCustom] = useState(false);
  useEffect(() => setPickedCustom(false), [value]);
  const option = pickedCustom ? CUSTOM : presetOption(config, value);
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
    <PropertyRow label={config.name ?? property}>
      <PropertySelect
        value={option}
        // none last, after custom too (the rule for every select).
        options={[...config.presets.filter((p) => p !== "none"), CUSTOM, ...(config.presets.includes("none") ? ["none"] : [])]}
        label={config.name ?? property}
        placeholder={isMixed(props, property) ? MIXED : fromReset || undefined}
        triggerRef={selectRef}
        iconFor={
          config.icons
            ? (v) => {
                const name = config.icons?.[v];
                return name ? <Icon name={name} /> : null;
              }
            : undefined
        }
        hintFor={config.hints ? (v) => config.hints?.[v] : undefined}
        onChange={(next) => {
          if (next === CUSTOM) {
            setPickedCustom(true);
            // Straight into the field, to type the value.
            requestAnimationFrame(focusField);
            return;
          }
          setPickedCustom(false);
          if (next !== value) onChange(property, next);
        }}
        onTab={(direction) => (direction > 0 && custom ? focusField() : tabOut(direction))}
      />
      {custom && (
        <PropertyInputText
          value={presetOption(config, value) === CUSTOM ? value : ""}
          placeholder={isMixed(props, property) ? MIXED : config.placeholder}
          label={config.customLabel}
          inputRef={fieldRef}
          tokens={tokensFor(property)}
          computed={props.values?.[property]}
          onCommit={(text) => {
            if (!text.trim()) return onChange(property, "");
            const next = parseValue(property, text);
            if (next && next !== value) onChange(property, next);
          }}
          onSubmit={onReturnToSearch}
          onTab={(direction) => (direction < 0 ? focusSelect() : tabOut(1))}
        />
      )}
    </PropertyRow>
  );
}

/** Define a preset editor (see PresetEditor). */
export function presetEditor(config: PresetConfig): PropertyEditor {
  return {
    id: config.property,
    label: config.label,
    properties: [config.property],
    aliases: config.aliases,
    component: (props: PropertyEditorProps) => <PresetEditor {...props} config={config} />,
  };
}
