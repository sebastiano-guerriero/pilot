import { useState } from "preact/hooks";
import { LayerList } from "../../ui/components/LayerList/LayerList.tsx";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { closeParens } from "../../css/values.ts";
import { declaredOf, isMixed } from "../declared.ts";
import { useHeldDrag } from "../heldDrag.ts";
import { BLUR, OFFSET, ShadowRows } from "../shadow/ShadowRows.tsx";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";
import {
  CUSTOM_HINT,
  type Filter,
  type FilterFunction,
  FILTERS,
  filterRange,
  type FilterType,
  formatFilter,
  formatShadow,
  NEW_FILTER,
  noneHint,
  OTHER_TAKES,
  parseFilter,
  parseFilterValue,
  parseShadow,
  type Shadow,
  stepFilterValue,
  supportedFilter,
} from "./filter.ts";

/** What a filter editor edits: filter, backdrop-filter. */
interface FilterConfig {
  /** The property it writes, also the row's label. */
  property: string;
  /** Search label: "Backdrop filter". */
  label: string;
  /** The panel's title: "Backdrop Filter". */
  title: string;
  /** What one is called, for screen readers: "backdrop filter". */
  noun: string;
  /** The functions its select offers, in menu order (then none). */
  functions: readonly FilterFunction[];
  /** Tailwind's class names. */
  aliases: string[];
  /** A line before each function's own help in the footer: what the property applies to. */
  note?: string;
}

const typeOf = (filter: Filter | "none"): FilterType => (filter === "none" ? "none" : filter.fn);

/** A filter of another type, from the function's start value. (Custom isn't offered: only read from the page.) */
function asType(type: Exclude<FilterType, "custom">): Filter | "none" {
  return type === "none" ? "none" : { fn: type, value: FILTERS[type].start };
}

/** What a filter's value means: the panel's footer. */
function hintOf(config: FilterConfig, type: FilterType): string {
  if (type === "none") return noneHint(config.property);
  const own = type === "custom" ? CUSTOM_HINT : FILTERS[type].hint;
  return config.note ? `${config.note} ${own}` : own;
}

/** A chip: the function's name, its value dimmed after it. */
function chipOf(filter: Filter | "none") {
  if (filter === "none") return { name: "none" };
  if (filter.fn === "custom") return { name: "custom", hint: filter.text };
  return { name: filter.fn, hint: filter.value || FILTERS[filter.fn].start };
}

/**
 * filter (and backdrop-filter, `config`), mask-image's way (LayerList): the row lists the element's filters
 * as chips (the function, its value dimmed, × to take it off) and a + that
 * adds one; several are applied in order. A filter is edited in a panel
 * beside the dialog: its function, then its value, with what the value takes
 * said three ways (the select's dimmed unit, the field's placeholder, the
 * panel's footer). A drop-shadow's value is split into rows: x, y, blur, color. × on the last chip clears the property (the element declares no
 * filter); `none` declares filter: none and is the whole value.
 */
function FilterEditor({ config, ...props }: PropertyEditorProps & { config: FilterConfig }) {
  const PROPERTY = config.property;
  const value = declaredOf(props, PROPERTY);
  const mixed = isMixed(props, PROPERTY);
  const filters = mixed ? null : parseFilter(value);
  const list: Array<Filter | "none"> = filters === "none" ? ["none"] : (filters ?? []);
  const [open, setOpen] = useState<number | null>(null);

  // Every write is the whole value.
  const write = (next: Array<Filter | "none">, gesture: object = {}) => {
    props.onChange(PROPERTY, next.includes("none") ? "none" : formatFilter(next as Filter[]), { gesture });
  };
  const add = () => {
    const next = [...list.filter((f) => f !== "none"), NEW_FILTER];
    write(next);
    setOpen(next.length - 1);
  };
  const remove = (index: number) => {
    const next = list.filter((_, i) => i !== index);
    if (next.length) write(next);
    else props.onChange(PROPERTY, "", { gesture: {} });
    setOpen(null);
  };
  const update = (index: number, filter: Filter | "none", gesture?: object) => {
    // `none` is the whole value: the other filters go.
    if (filter === "none") return write(["none"], gesture);
    write(list.map((f, i) => (i === index ? filter : f)).filter((f) => f !== "none"), gesture);
  };

  const current = open !== null ? list[open] : undefined;
  return (
    <LayerList
      label={PROPERTY}
      class="filter-editor"
      items={list.map(chipOf)}
      mixed={mixed}
      open={open}
      onOpen={setOpen}
      onAdd={add}
      // `none` is the whole value: nothing can be added to it (× takes it off).
      noAdd={filters === "none"}
      onRemove={remove}
      noun={config.noun}
      panelTitle={config.title}
      focusRequest={props.focusRequest}
      footer={current && hintOf(config, typeOf(current))}
    >
      {open !== null && current && (
        <FilterRows {...props} config={config} filter={current} onUpdate={(filter, gesture) => update(open, filter, gesture)} />
      )}
    </LayerList>
  );
}

/** A drop-shadow's length rows. */
const DROP_SHADOW_LENGTHS = [
  { part: "x", kind: OFFSET },
  { part: "y", kind: OFFSET },
  { part: "blur", kind: BLUR },
] as const;

/** The panel's rows for one filter: its function, its value (a drop-shadow's parts, each a row), and what the value means. */
function FilterRows(
  props: PropertyEditorProps & {
    config: FilterConfig;
    filter: Filter | "none";
    onUpdate(filter: Filter | "none", gesture?: object): void;
  },
) {
  const { config, filter, onUpdate, onRevert } = props;
  const PROPERTY = config.property;
  const type = typeOf(filter);
  const held = useHeldDrag();
  const shadow = filter !== "none" && filter.fn === "drop-shadow" ? parseShadow(filter.value || FILTERS["drop-shadow"].start) : null;
  const setPart = (part: keyof Shadow, next: string, gesture?: object) => {
    if (shadow && filter !== "none" && filter.fn === "drop-shadow") onUpdate({ ...filter, value: formatShadow({ ...shadow, [part]: next }) }, gesture);
  };

  /** A filter's CSS as text: a custom one, or a drop-shadow that doesn't split into parts. */
  const textRow = (text: string, check: (t: string) => string | null, write: (t: string) => void) => (
    <PropertyRow label="value">
      <PropertyInputText
        value={text}
        label="filter value"
        placeholder={type === "custom" ? "url(#noise)" : FILTERS["drop-shadow"].start}
        onCommit={(typed) => {
          const t = closeParens(typed.trim().replace(/\s+/g, " "));
          const next = t ? check(t) : "";
          if (next !== null && next !== text) write(next);
        }}
      />
    </PropertyRow>
  );

  return (
    <>
      <PropertyRow label="function">
        <PropertySelect
          value={type}
          options={[...config.functions, "none"]}
          label="filter function"
          clearable={false}
          hintFor={(t) => (t === "custom" || t === "none" ? OTHER_TAKES[t] : FILTERS[t as FilterFunction]?.takes)}
          onChange={(t) => t !== type && t !== "custom" && onUpdate(asType(t as Exclude<FilterType, "custom">))}
        />
      </PropertyRow>
      {filter !== "none" && filter.fn !== "custom" && filter.fn !== "drop-shadow" && (
        <PropertyRow label="value">
          <PropertyInputText
            value={filter.value}
            label="filter value"
            placeholder={FILTERS[filter.fn].start}
            onCommit={(text) => {
              const next = text.trim() ? parseFilterValue(filter.fn, text) : "";
              if (next !== null && next !== filter.value) onUpdate({ ...filter, value: next });
            }}
            onStep={(delta, text, gesture) => {
              const next = stepFilterValue(filter.fn, text, delta);
              if (next) onUpdate({ ...filter, value: next }, gesture);
            }}
            onScrub={(steps, startText, gesture) => {
              // Held in the function's range (grayscale's 0–100%): past it, the handle stretches.
              const { min, max } = filterRange(filter.fn);
              const start = Number.parseFloat(stepFilterValue(filter.fn, startText, 0) ?? "");
              const { offset, overflow } = held(gesture, steps, start, 1, min, max);
              // Back where the drag started: the earlier value, not a fake edit.
              if (offset === 0) onRevert?.(PROPERTY, gesture);
              else {
                const next = stepFilterValue(filter.fn, startText, offset);
                if (next) onUpdate({ ...filter, value: next }, gesture);
              }
              return overflow;
            }}
          />
        </PropertyRow>
      )}
      {shadow && (
        <ShadowRows
          element={props.element}
          lengths={DROP_SHADOW_LENGTHS}
          values={{ ...shadow }}
          onChange={(part, next, gesture) => setPart(part as keyof Shadow, next, gesture)}
          onRevert={(gesture) => onRevert?.(PROPERTY, gesture)}
        />
      )}
      {filter !== "none" && filter.fn === "drop-shadow" && !shadow &&
        textRow(filter.value, (t) => (supportedFilter(`drop-shadow(${t})`) ? t : null), (t) => onUpdate({ ...filter, value: t }))}
      {filter !== "none" && filter.fn === "custom" &&
        textRow(filter.text, (t) => (supportedFilter(t) ? t : null), (t) => onUpdate({ fn: "custom", text: t }))}
    </>
  );
}

/** Define a filter editor (see FilterEditor). */
function filterEditorFor(config: FilterConfig): PropertyEditor {
  return {
    id: config.property,
    label: config.label,
    properties: [config.property],
    aliases: config.aliases,
    component: (props: PropertyEditorProps) => <FilterEditor {...props} config={config} />,
  };
}

const FUNCTIONS = Object.keys(FILTERS) as FilterFunction[];

export const filterEditor = filterEditorFor({
  property: "filter",
  label: "Filter",
  title: "Filter",
  noun: "filter",
  functions: FUNCTIONS,
  // Tailwind's filter utilities: the classes that exist on their own, and one of each scale.
  aliases: [
    "blur",
    "brightness-150",
    "contrast-150",
    "drop-shadow",
    "grayscale",
    "hue-rotate-90",
    "invert",
    "saturate-150",
    "sepia",
    "filter-none",
  ],
});

/**
 * backdrop-filter: the same editor, on what's behind the element (seen
 * through its background, so the background needs to be see-through). The
 * same functions but drop-shadow, which Tailwind has no backdrop version of
 * (a shadow of what's behind means little).
 */
export const backdropFilterEditor = filterEditorFor({
  property: "backdrop-filter",
  label: "Backdrop filter",
  title: "Backdrop Filter",
  noun: "backdrop filter",
  functions: FUNCTIONS.filter((f) => f !== "drop-shadow"),
  note: "On what's behind, seen through a see-through background.",
  // Tailwind's backdrop-* utilities: the classes that exist on their own, and one of each scale.
  aliases: [
    "backdrop-blur",
    "backdrop-brightness-150",
    "backdrop-contrast-150",
    "backdrop-grayscale",
    "backdrop-hue-rotate-90",
    "backdrop-invert",
    "backdrop-opacity-50",
    "backdrop-saturate-150",
    "backdrop-sepia",
    "backdrop-filter-none",
  ],
});
