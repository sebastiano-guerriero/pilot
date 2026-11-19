import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { declaredOf, isMixed, MIXED } from "../declared.ts";
import { rowsOf } from "../listOrder.ts";
import type { FocusRequest, PropertyEditor, PropertyEditorProps } from "../types.ts";

/** A keyword property that shows other editors as rows below its select (display, position). */
export interface RevealConfig {
  /** Editor id and the property its select writes: `display`, `position`. */
  property: string;
  /** Search label: "Display". */
  label: string;
  /**
   * The select's values, in menu order; or, for the value set now, the
   * values to offer (display offers -webkit-box only while it's set).
   */
  options: readonly string[] | ((value: string) => readonly string[]);
  /**
   * The editors it can show as rows, by id. Which ones, and in what order,
   * for each value is set in LIST_ORDER (editors/listOrder.ts, `rowsOf`).
   */
  rows: PropertyEditor[];
  /** Tailwind's class names for the property's values. */
  aliases?: string[];
}

/** The rows `config` shows for a value of its property, in LIST_ORDER. */
export function revealedRows(config: Pick<RevealConfig, "property" | "rows">, value: string): PropertyEditor[] {
  const byId = new Map(config.rows.map((e) => [e.id, e]));
  return rowsOf(config.property, value)
    .map((id) => byId.get(id))
    .filter((e): e is PropertyEditor => !!e);
}

/** One focus request per row: rows focus themselves when theirs changes. */
interface RowFocus {
  row: number;
  request: FocusRequest;
}

/**
 * A select, plus the editors its value reveals as rows below it (display:
 * grid → grid-columns, gap…; position → inset). The property is what
 * reveals them: the rows don't reveal it or each other, and searching for a
 * row (`gap`, `inset`) shows just that row's editor. Each row writes its own
 * property, so each change is its own undo step, and undoing back past the
 * value hides its rows again. Tab moves through the rows, then on to the
 * next editor.
 */
export function RevealEditor({ config, ...props }: PropertyEditorProps & { config: RevealConfig }) {
  const { onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  const value = declaredOf(props, config.property);
  const rows = revealedRows(config, value);

  // From the search, land on the select; from the previous/next editor, on
  // the first/last row.
  const [focus, setFocus] = useState<RowFocus | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest) return;
    setFocus({ row: focusRequest.edge === "last" ? rows.length : 0, request: { ...focusRequest } });
  }, [focusRequest]);

  // Row 0 is the select, then the revealed rows.
  const tab = (row: number, direction: 1 | -1) => {
    const next = row + direction;
    if (next >= 0 && next <= rows.length) {
      setFocus({ row: next, request: { query: "", edge: direction > 0 ? "first" : "last" } });
    } else if (onTabOut) onTabOut(direction);
    else onReturnToSearch?.();
  };
  const requestFor = (row: number) => (focus?.row === row ? focus.request : undefined);

  return (
    <div class="reveal-editor">
      <SelectRow
        property={config.property}
        options={typeof config.options === "function" ? config.options(value) : config.options}
        value={value}
        mixed={isMixed(props, config.property)}
        focusRequest={requestFor(0)}
        onChange={(next) => onChange(config.property, next)}
        onTab={(direction) => tab(0, direction)}
      />
      {rows.map((editor, i) => (
        <editor.component
          key={editor.id}
          {...props}
          focusRequest={requestFor(i + 1)}
          onTabOut={(direction) => tab(i + 1, direction)}
        />
      ))}
    </div>
  );
}

interface SelectRowProps {
  property: string;
  options: readonly string[];
  value: string;
  /** The selected elements differ on it: the select reads "Mixed". */
  mixed?: boolean;
  focusRequest?: FocusRequest;
  onChange(value: string): void;
  onTab(direction: 1 | -1): void;
}

/**
 * The select. Picking keeps focus here (Enter picks in the menu), so Tab
 * goes on to the rows that just appeared.
 */
function SelectRow({ property, options, value, mixed, focusRequest, onChange, onTab }: SelectRowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusRequest) ref.current?.focus();
  }, [focusRequest]);
  return (
    <PropertyRow label={property}>
      <PropertySelect
        value={value}
        options={options}
        label={property}
        placeholder={mixed ? MIXED : undefined}
        triggerRef={ref}
        onChange={(next) => next !== value && onChange(next)}
        onTab={onTab}
      />
    </PropertyRow>
  );
}

/** Define a revealing editor (see RevealEditor). */
export function revealEditor(config: RevealConfig): PropertyEditor {
  return {
    id: config.property,
    label: config.label,
    properties: [config.property],
    // Shown as rows; searching for them finds their own editors.
    embeds: config.rows,
    aliases: config.aliases,
    component: (props: PropertyEditorProps) => <RevealEditor {...props} config={config} />,
  };
}
