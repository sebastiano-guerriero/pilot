import { useLayoutEffect, useRef } from "preact/hooks";
import { Icon, type IconName } from "../../ui/components/Icon/Icon.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

interface KeywordOptions {
  /** The values to offer, in menu order. */
  options: readonly string[];
  /**
   * The icon variant: an icon per value, and for "" (nothing set). A value
   * without one (set some other way) shows no icon.
   */
  icons?: Record<string, IconName>;
}

/**
 * A one-value editor for a keyword property (justify-content, align-items…):
 * a label and a PropertySelect, in its icon variant when `icons` is given.
 * Shows the declared value; a value set some other way that isn't offered is
 * still listed. Tab moves on to the next editor.
 */
export function KeywordEditor({
  property,
  config,
  ...props
}: PropertyEditorProps & { property: string; config: KeywordOptions }) {
  const { onChange, focusRequest, onTabOut, onReturnToSearch } = props;
  const value = declaredOf(props, property);
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusRequest) ref.current?.focus();
  }, [focusRequest]);
  const { icons } = config;
  return (
    <PropertyRow label={property}>
      <PropertySelect
        value={value}
        options={config.options}
        label={property}
        triggerRef={ref}
        iconFor={
          icons
            ? (v) => {
                const name = icons[v];
                return name ? <Icon name={name} /> : null;
              }
            : undefined
        }
        onChange={(next) => next !== value && onChange(property, next)}
        onTab={(direction) => (onTabOut ? onTabOut(direction) : onReturnToSearch?.())}
      />
    </PropertyRow>
  );
}

/** Define a keyword editor for `property`. */
export function keywordEditor(
  definition: {
    property: string;
    label: string;
    aliases?: string[];
    family?: string;
  } & KeywordOptions,
): PropertyEditor {
  const { property, options, icons, ...rest } = definition;
  const config: KeywordOptions = { options, icons };
  return {
    id: property,
    properties: [property],
    component: (props: PropertyEditorProps) => <KeywordEditor {...props} property={property} config={config} />,
    ...rest,
  };
}
