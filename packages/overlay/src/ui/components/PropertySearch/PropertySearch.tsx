import { describeWidths, type WidthRange } from "@pilot/protocol";
import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";
import { inWidths, takeWidths, widthSuggestion } from "../../../edits/widths.ts";

interface PropertySearchProps {
  value: string;
  onChange(value: string): void;
  onKeyDown?(e: KeyboardEvent): void;
  /** The field itself, so the dialog can move focus back to it. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The width chip: the viewport widths changes are for. null: every width (no chip). */
  widths?: WidthRange | null;
  /** The chip changed: typed (`from-1200 `), or removed (null). Without it, no chip. */
  onWidthsChange?(widths: WidthRange | null): void;
  /** The window's width now, to show when it's outside the chip's range. */
  viewportWidth?: number;
}

/**
 * The property search field. Focused as soon as it appears, its text selected
 * (a query carried over from the previous selection): typing replaces it, and
 * Tab/Enter goes straight into its editor.
 */
export function PropertySearch({
  value,
  onChange,
  onKeyDown,
  inputRef,
  widths = null,
  onWidthsChange,
  viewportWidth,
}: PropertySearchProps) {
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // `from-1200 ` / `to-767 ` at the start becomes the chip; the rest is the search.
  const onInput = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const taken = onWidthsChange ? takeWidths(input.value, widths) : null;
    if (taken?.range) {
      onWidthsChange?.(taken.range);
      input.value = taken.rest;
      onChange(taken.rest);
    } else onChange(input.value);
  };

  // `from-` (or `to-`) suggests the window's width, dimmed after the text.
  const suggestion = onWidthsChange && viewportWidth !== undefined ? widthSuggestion(value, viewportWidth) : null;

  // Backspace at the very start of the field removes the chip. Tab takes the
  // suggested width: the chip, as if `from-1108 ` had been typed.
  const onSearchKeyDown = (e: KeyboardEvent) => {
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Tab" && !e.shiftKey && suggestion) {
      e.preventDefault();
      onWidthsChange?.(takeWidths(`${value}${suggestion} `, widths).range);
      onChange("");
      return;
    }
    if (e.key === "Backspace" && widths && input.selectionStart === 0 && input.selectionEnd === 0) {
      e.preventDefault();
      onWidthsChange?.(null);
      return;
    }
    onKeyDown?.(e);
  };

  const outside = !!widths && viewportWidth !== undefined && !inWidths(widths, viewportWidth);

  return (
    <div class="property-search">
      {widths && (
        <span
          class="widths"
          data-outside={outside || undefined}
          title={
            outside
              ? `The window (${viewportWidth}px) is outside this range: what you see isn't what these changes are for`
              : "Changes are for these viewport widths. Backspace at the start of the field removes it."
          }
        >
          {describeWidths(widths)}
          <button
            type="button"
            class="remove"
            aria-label="Changes for every width"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onWidthsChange?.(null);
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        </span>
      )}
      <div class="field">
        <input
          ref={inputRef}
          class="input"
          type="search"
          aria-label="Add a property"
          placeholder="Add a property…"
          value={value}
          onInput={onInput}
          onKeyDown={onSearchKeyDown}
        />
        {suggestion && (
          // The typed text, invisible, so the suggestion lands right after it.
          <span class="suggestion" aria-hidden="true">
            <span class="typed">{value}</span>
            {suggestion}
          </span>
        )}
      </div>
    </div>
  );
}
