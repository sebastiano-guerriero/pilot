import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { DISPLAY_VALUES } from "../../css/properties.ts";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { alignItemsEditor } from "../align/AlignItemsEditor.tsx";
import { declaredOf } from "../declared.ts";
import { flexDirectionEditor, flexWrapEditor } from "../flex/FlexEditors.tsx";
import { gapEditor } from "../gap/GapEditor.tsx";
import { gridColumnsEditor } from "../grid-columns/GridColumnsEditor.tsx";
import { justifyContentEditor } from "../justify/JustifyContentEditor.tsx";
import type { FocusRequest, PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * The rows each display value shows below the select. Each row is an editor
 * of its own: searching for it (`gap`, `cols`, `flex-col`, `items`…) shows
 * just that editor, without display.
 */
const GRID_ROWS = [gridColumnsEditor, gapEditor, justifyContentEditor, alignItemsEditor];
const FLEX_ROWS = [flexDirectionEditor, flexWrapEditor, gapEditor, justifyContentEditor, alignItemsEditor];
const ROWS: Record<string, PropertyEditor[]> = {
  grid: GRID_ROWS,
  "inline-grid": GRID_ROWS,
  flex: FLEX_ROWS,
  "inline-flex": FLEX_ROWS,
};
/** Every editor display can show as a row (its `embeds`). */
const ALL_ROWS = [...new Set([...GRID_ROWS, ...FLEX_ROWS])];

/** One focus request per row: rows focus themselves when theirs changes. */
interface RowFocus {
  row: number;
  request: FocusRequest;
}

/**
 * Display, as a select. Picking `grid` (or `inline-grid`) shows the grid rows
 * below it (GRID_ROWS), `flex` (or `inline-flex`) the flex rows (FLEX_ROWS:
 * flex-direction, flex-wrap, gap, justify-content, align-items). Display is
 * what reveals them: the rows don't reveal
 * display or each other. Each row writes its own property, so each change is
 * its own undo step, and undoing back past `grid` hides the rows again.
 * Tab moves through the rows, then on to the next editor.
 */
export function DisplayEditor(props: PropertyEditorProps) {
  const { onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  const display = declaredOf(props, "display");
  const rows = ROWS[display] ?? [];

  // From the search, land on the select; from the previous/next editor, on
  // the first/last row.
  const [focus, setFocus] = useState<RowFocus | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest) return;
    setFocus({ row: focusRequest.edge === "last" ? rows.length : 0, request: { ...focusRequest } });
  }, [focusRequest]);

  // Row 0 is the select, then the grid or flex rows.
  const tab = (row: number, direction: 1 | -1) => {
    const next = row + direction;
    if (next >= 0 && next <= rows.length) {
      setFocus({ row: next, request: { query: "", edge: direction > 0 ? "first" : "last" } });
    } else if (onTabOut) onTabOut(direction);
    else onReturnToSearch?.();
  };
  const requestFor = (row: number) => (focus?.row === row ? focus.request : undefined);

  return (
    <div class="display-editor">
      <DisplayRow
        value={display}
        focusRequest={requestFor(0)}
        onChange={(value) => onChange("display", value)}
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

interface RowProps {
  value: string;
  focusRequest?: FocusRequest;
  onChange(value: string): void;
  onTab(direction: 1 | -1): void;
}

/**
 * The display select. Picking keeps focus here (Enter picks in the menu), so
 * Tab goes on to the rows that just appeared.
 */
function DisplayRow({ value, focusRequest, onChange, onTab }: RowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusRequest) ref.current?.focus();
  }, [focusRequest]);
  return (
    <PropertyRow label="display">
      <PropertySelect
        value={value}
        options={DISPLAY_VALUES}
        label="display"
        triggerRef={ref}
        onChange={(next) => next !== value && onChange(next)}
        onTab={onTab}
      />
    </PropertyRow>
  );
}

export const displayEditor: PropertyEditor = {
  id: "display",
  label: "Display",
  properties: ["display"],
  // Shown as grid or flex rows; searching for them finds their own editors.
  embeds: ALL_ROWS,
  // Tailwind's display utilities: they all land here.
  aliases: ["grid", "inline-grid", "flex", "inline-flex", "block", "inline-block", "inline", "hidden", "contents"],
  component: DisplayEditor,
};
