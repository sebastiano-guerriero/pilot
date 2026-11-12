import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import type { FocusRequest } from "../types.ts";

/** How the columns are defined, picked in the row's select. */
export const COLUMNS_MODES = ["repeat", "custom", "subgrid", "none"] as const;
export type ColumnsMode = (typeof COLUMNS_MODES)[number];

/** Modes that take a value, typed in a field next to the select. */
const WITH_FIELD: readonly ColumnsMode[] = ["repeat", "custom"];

interface ColumnsRowProps {
  /** The inline `grid-template-columns`, or "". */
  value: string;
  focusRequest?: FocusRequest;
  onChange(value: string): void;
  /** Enter in a field: done (back to the search). */
  onSubmit?(): void;
  /** Tab past the row's last field (1) or Shift+Tab before its first (-1). */
  onTab(direction: 1 | -1): void;
}

/**
 * `grid-template-columns`: a mode select, plus a field for the modes that
 * take a value. With a field, the two share the value area (60px each);
 * without one, the select fills it.
 * - repeat (the default): a column count. `3` writes
 *   `repeat(3, minmax(0, 1fr))`, three equal columns that can shrink below
 *   their content. Whole numbers from 1 only; ↑/↓ add or remove a column.
 *   With nothing set, the row shows repeat and 1, CSS grid's own default (one
 *   column), without writing anything; clearing the count goes back to it.
 * - custom: any CSS for grid-template-columns (`1fr 2fr`, `200px auto`…),
 *   checked by the browser.
 * - subgrid, none: written as soon as they're picked.
 * There's no "Select": repeat 1 is the default. Picking repeat from another
 * mode writes `repeat(1, …)`. Picking custom writes nothing until a value is
 * typed: the row remembers the mode until then (or until the value changes,
 * e.g. undo).
 * Tab goes select → field → next row.
 */
export function ColumnsRow({ value, focusRequest, onChange, onSubmit, onTab }: ColumnsRowProps) {
  const selectRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // A picked mode that the value doesn't say yet (custom, before anything is
  // typed). Any change of value (typed, undone) clears it.
  const [picked, setPicked] = useState<ColumnsMode | null>(null);
  useEffect(() => setPicked(null), [value]);
  // Nothing set reads as repeat 1: CSS grid's default is one column.
  const mode: ColumnsMode = picked ?? (columnsMode(value) || "repeat");
  const hasField = WITH_FIELD.includes(mode);

  const focusSelect = () => selectRef.current?.focus();
  const focusField = () => {
    fieldRef.current?.focus();
    fieldRef.current?.select();
  };
  useLayoutEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.edge === "last" && hasField) focusField();
    else focusSelect();
  }, [focusRequest]);

  const setCount = (count: number) => {
    if (!value && count === 1) return; // already the default
    const next = columnsValue(count);
    if (next !== value) onChange(next);
  };

  return (
    <PropertyRow label="grid-columns">
      <PropertySelect
        value={mode}
        options={COLUMNS_MODES}
        label="grid-columns"
        triggerRef={selectRef}
        clearable={false}
        onChange={(next) => {
          const nextMode = next as ColumnsMode;
          if (nextMode === "custom") return setPicked("custom");
          setPicked(null);
          if (nextMode === "repeat") {
            // From a written mode: one column, explicitly (it may override a
            // stylesheet). From the unwritten default: nothing to write.
            if (value && columnsMode(value) !== "repeat") onChange(columnsValue(1));
          } else if (nextMode !== value) onChange(nextMode); // subgrid, none
        }}
        onTab={(direction) => (direction > 0 && hasField ? focusField() : onTab(direction))}
      />
      {mode === "repeat" && (
        <PropertyInputText
          value={columnsCount(value) ?? (value ? "" : "1")}
          label="column count"
          inputRef={fieldRef}
          onCommit={(text) => {
            if (!text.trim()) return onChange("");
            const count = parseCount(text);
            if (count !== null) setCount(count);
          }}
          onStep={(delta, text) => setCount(Math.max(1, (parseCount(text) ?? 0) + Math.sign(delta)))}
          onSubmit={onSubmit}
          onTab={(direction) => (direction < 0 ? focusSelect() : onTab(1))}
        />
      )}
      {mode === "custom" && (
        <PropertyInputText
          value={columnsMode(value) === "custom" || columnsMode(value) === "repeat" ? value : ""}
          label="custom columns"
          inputRef={fieldRef}
          onCommit={(text) => {
            const next = parseCustomColumns(text);
            if (next !== null && next !== value) onChange(next);
          }}
          onSubmit={onSubmit}
          onTab={(direction) => (direction < 0 ? focusSelect() : onTab(1))}
        />
      )}
    </PropertyRow>
  );
}

/** The mode a value is in: "" when there's none. */
export function columnsMode(value: string): ColumnsMode | "" {
  const v = value.trim();
  if (!v) return "";
  if (columnsCount(v) !== null) return "repeat";
  if (v === "subgrid" || v === "none") return v;
  return "custom";
}

/** `3` → `repeat(3, minmax(0, 1fr))`. */
export function columnsValue(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

/**
 * The count back from a value Pilot wrote (`repeat(3, minmax(0, 1fr))` → "3";
 * browsers may read it back as `minmax(0px, 1fr)`). Null for anything else.
 */
export function columnsCount(value: string): string | null {
  const match = value.match(/^repeat\(\s*(\d+)\s*,\s*minmax\(\s*0(?:px)?\s*,\s*1fr\s*\)\s*\)$/);
  return match ? (match[1] as string) : null;
}

/** A typed column count: a whole number from 1, else null. */
function parseCount(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

/**
 * Custom CSS for grid-template-columns: "" (cleared) removes the value; text
 * the browser rejects is ignored (null). Whitespace is tidied.
 */
export function parseCustomColumns(text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("grid-template-columns", t)) {
    return null;
  }
  return t;
}
