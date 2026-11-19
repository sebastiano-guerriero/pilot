import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyRow } from "../../ui/components/PropertyRow/PropertyRow.tsx";
import { PropertySelect } from "../../ui/components/PropertySelect/PropertySelect.tsx";
import type { FocusRequest } from "../types.ts";

/** How the tracks (columns or rows) are defined, picked in the row's select. */
export const TRACK_MODES = ["repeat", "custom", "subgrid", "none"] as const;
export type TrackMode = (typeof TRACK_MODES)[number];

/** Modes that take a value, typed in a field next to the select. */
const WITH_FIELD: readonly TrackMode[] = ["repeat", "custom"];

/**
 * The two axes. Columns and rows work the same, but for what nothing set
 * means: one column (CSS grid's default), but as many rows as the items need.
 */
export const AXES = {
  columns: { property: "grid-template-columns", label: "grid-columns", count: "column count", custom: "custom columns", empty: "1" },
  rows: { property: "grid-template-rows", label: "grid-rows", count: "row count", custom: "custom rows", empty: "" },
} as const;
export type Axis = keyof typeof AXES;

interface TracksRowProps {
  axis: Axis;
  /** The declared `grid-template-columns` / `grid-template-rows`, or "". */
  value: string;
  focusRequest?: FocusRequest;
  onChange(value: string): void;
  /** Enter in a field: done (back to the search). */
  onSubmit?(): void;
  /** Tab past the row's last field (1) or Shift+Tab before its first (-1). */
  onTab(direction: 1 | -1): void;
}

/**
 * `grid-template-columns` or `grid-template-rows` (`axis`): a mode select,
 * plus a field for the modes that take a value. With a field, the two share
 * the value area (60px each); without one, the select fills it.
 * - repeat (the default): a track count. `3` writes
 *   `repeat(3, minmax(0, 1fr))`, three equal tracks that can shrink below
 *   their content (Tailwind's grid-cols-3, grid-rows-3). Whole numbers from 1
 *   only; ↑/↓ add or remove a track.
 *   With nothing set, the row shows repeat and CSS grid's own default,
 *   without writing anything: 1 for columns (one column); an empty count,
 *   `auto`, for rows (as many as the items need, sized by their content).
 *   Clearing the count goes back to it.
 * - custom: any CSS for the property (`1fr 2fr`, `200px auto`…), checked by
 *   the browser.
 * - subgrid, none: written as soon as they're picked.
 * There's no "Select": repeat is the default. Picking repeat from another
 * mode writes `repeat(1, …)`. Picking custom writes nothing until a value is
 * typed: the row remembers the mode until then (or until the value changes,
 * e.g. undo).
 * Tab goes select → field → next row.
 */
export function TracksRow({ axis, value, focusRequest, onChange, onSubmit, onTab }: TracksRowProps) {
  const { property, label, empty } = AXES[axis];
  const selectRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // A picked mode that the value doesn't say yet (custom, before anything is
  // typed). Any change of value (typed, undone) clears it.
  const [picked, setPicked] = useState<TrackMode | null>(null);
  useEffect(() => setPicked(null), [value]);
  // Nothing set reads as repeat, with CSS grid's default count.
  const mode: TrackMode = picked ?? (tracksMode(value) || "repeat");
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
    if (!value && String(count) === empty) return; // already the default
    const next = tracksValue(count);
    if (next !== value) onChange(next);
  };

  return (
    <PropertyRow label={label}>
      <PropertySelect
        value={mode}
        options={TRACK_MODES}
        label={label}
        triggerRef={selectRef}
        clearable={false}
        onChange={(next) => {
          const nextMode = next as TrackMode;
          if (nextMode === "custom") return setPicked("custom");
          setPicked(null);
          if (nextMode === "repeat") {
            // From a written mode: one column, explicitly (it may override a
            // stylesheet). From the unwritten default: nothing to write.
            if (value && tracksMode(value) !== "repeat") onChange(tracksValue(1));
          } else if (nextMode !== value) onChange(nextMode); // subgrid, none
        }}
        onTab={(direction) => (direction > 0 && hasField ? focusField() : onTab(direction))}
      />
      {mode === "repeat" && (
        <PropertyInputText
          value={tracksCount(value) ?? (value ? "" : empty)}
          placeholder={empty ? undefined : "auto"}
          label={AXES[axis].count}
          inputRef={fieldRef}
          onCommit={(text) => {
            if (!text.trim()) return onChange("");
            const count = parseCount(text);
            if (count !== null) setCount(count);
          }}
          onStep={(delta, text) => {
            const count = parseCount(text);
            // From an empty count (rows' default), ↑ is one row and ↓ stays.
            if (count === null && delta < 0 && !empty) return;
            setCount(Math.max(1, (count ?? 0) + Math.sign(delta)));
          }}
          onSubmit={onSubmit}
          onTab={(direction) => (direction < 0 ? focusSelect() : onTab(1))}
        />
      )}
      {mode === "custom" && (
        <PropertyInputText
          value={tracksMode(value) === "custom" || tracksMode(value) === "repeat" ? value : ""}
          label={AXES[axis].custom}
          inputRef={fieldRef}
          onCommit={(text) => {
            const next = parseCustomTracks(property, text);
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
export function tracksMode(value: string): TrackMode | "" {
  const v = value.trim();
  if (!v) return "";
  if (tracksCount(v) !== null) return "repeat";
  if (v === "subgrid" || v === "none") return v;
  return "custom";
}

/** `3` → `repeat(3, minmax(0, 1fr))`. */
export function tracksValue(count: number): string {
  return `repeat(${count}, minmax(0, 1fr))`;
}

/**
 * The count back from a value Pilot wrote (`repeat(3, minmax(0, 1fr))` → "3";
 * browsers may read it back as `minmax(0px, 1fr)`). Null for anything else.
 */
export function tracksCount(value: string): string | null {
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
 * Custom CSS for `property` (grid-template-columns or -rows): "" (cleared)
 * removes the value; text the browser rejects is ignored (null). Whitespace
 * is tidied.
 */
export function parseCustomTracks(property: string, text: string): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports(property, t)) {
    return null;
  }
  return t;
}
