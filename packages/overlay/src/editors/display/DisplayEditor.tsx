import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { DISPLAY_VALUES } from "../../css/properties.ts";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import { LengthEditor } from "../length/LengthEditor.tsx";
import { ColumnsRow } from "./ColumnsRow.tsx";
import { declaredOf } from "../declared.ts";
import { normalizeQuery } from "../query.ts";
import type { FocusRequest, PropertyEditor, PropertyEditorProps } from "../types.ts";

/** The gap row: a length row that stripes the grid's gaps while in use, with a drag handle. */
const GAP_OPTIONS = { inspect: { box: "gap" } as const, scrub: true };

/** Display values that show the grid rows below the select. */
const GRID = ["grid", "inline-grid"];

/** Queries that land on the columns row (when it's shown). */
const COLUMNS_QUERIES = ["cols", "gridcols", "columns", "gridtemplatecolumns"].map(normalizeQuery);

/** One focus request per row: rows focus themselves when theirs changes. */
interface RowFocus {
  row: number;
  request: FocusRequest;
}

/**
 * Display, as a select. Picking `grid` (or `inline-grid`) shows the grid rows
 * below it: columns (a mode select plus a field, see ColumnsRow) and gap. Each row writes its own property, so each change
 * is its own undo step, and undoing back past `grid` hides the rows again.
 * Tab moves through the rows, then on to the next editor.
 */
export function DisplayEditor(props: PropertyEditorProps) {
  const { element, onChange, focusRequest, onReturnToSearch, onTabOut } = props;
  const display = declaredOf(props, "display");
  const grid = GRID.includes(display);
  const rows = grid ? 3 : 1;

  // From the search, land on the row the query names (`gap`, `cols`), if it's
  // shown; from the previous/next editor, on the first/last row.
  const [focus, setFocus] = useState<RowFocus | null>(null);
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const q = normalizeQuery(focusRequest.query);
    let row = 0;
    if (focusRequest.edge === "last") row = rows - 1;
    else if (grid && COLUMNS_QUERIES.includes(q)) row = 1;
    else if (grid && q === "gap") row = 2;
    setFocus({ row, request: { ...focusRequest } });
  }, [focusRequest]);

  const tab = (row: number, direction: 1 | -1) => {
    const next = row + direction;
    if (next >= 0 && next < rows) setFocus({ row: next, request: { query: "", edge: direction > 0 ? "first" : "last" } });
    else if (onTabOut) onTabOut(direction);
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
      {grid && (
        <>
          <ColumnsRow
            value={declaredOf(props, "grid-template-columns")}
            focusRequest={requestFor(1)}
            onChange={(value) => onChange("grid-template-columns", value)}
            onSubmit={onReturnToSearch}
            onTab={(direction) => tab(1, direction)}
          />
          <LengthEditor
            {...props}
            property="gap"
            // Hovering or focusing the gap stripes the grid's gaps on the page.
            options={GAP_OPTIONS}
            focusRequest={requestFor(2)}
            onTabOut={(direction) => tab(2, direction)}
          />
        </>
      )}
    </div>
  );
}

interface RowProps {
  value: string;
  focusRequest?: FocusRequest;
  onChange(value: string): void;
  onSubmit?(): void;
  onTab(direction: 1 | -1): void;
}

/**
 * The display select. Picking keeps focus here (Enter picks in the menu), so
 * Tab goes on to the grid rows that just appeared.
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
  properties: ["display", "grid-template-columns", "gap"],
  // Tailwind's display utilities, plus its grid ones: they all land here.
  aliases: ["grid", "inline-grid", "flex", "inline-flex", "block", "inline-block", "inline", "hidden", "contents", "grid-cols", "cols", "gap"],
  keywords: ["layout", "columns", "grid-template-columns"],
  component: DisplayEditor,
};
