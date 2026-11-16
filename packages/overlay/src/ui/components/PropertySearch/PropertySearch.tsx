import { describeWidths, type WidthRange } from "@pilot/protocol";
import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";
import { inWidths, takeWidths, widthSuggestion } from "../../../edits/widths.ts";
import { isModifierQuery, matchModifiers } from "../../../search/modifiers.ts";
import { Icon } from "../Icon/Icon.tsx";

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

  // The `/` menu: typing `/` at the start lists the modifiers (see
  // search/modifiers.ts), filtered by what follows. ↑/↓ move, Enter or Tab
  // picks (its syntax goes in the search, to finish typing), Esc closes it by
  // clearing the `/…` text (it's not a property search).
  const menuOpen = !!onWidthsChange && isModifierQuery(value);
  const options = menuOpen ? matchModifiers(value) : [];
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [value]);
  const pick = (index: number) => {
    const modifier = options[index];
    if (!modifier) return;
    onChange(modifier.insert);
    inputRef.current?.focus();
  };

  // Backspace at the very start of the field removes the chip. Tab takes the
  // suggested width: the chip, as if `from-1108 ` had been typed.
  const onSearchKeyDown = (e: KeyboardEvent) => {
    const input = e.currentTarget as HTMLInputElement;
    if (menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (options.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
        return;
      }
      if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && options.length) {
        e.preventDefault();
        pick(active);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // only the menu closes, not a step of the dialog
        onChange("");
        return;
      }
    }
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
    <div class="property-search" data-pills={widths ? "" : undefined}>
      {/* Pills: the search's modifiers (today the width chip), in a row of their
          own above the field, so more can sit side by side. */}
      {widths && (
        <div class="pills">
          <span
            class="pill"
            data-pill="widths"
            data-outside={outside || undefined}
            title={
              outside
                ? `The window (${viewportWidth}px) is outside this range: what you see isn't what these changes are for`
                : "Changes are for these viewport widths. Backspace at the start of the field removes it."
            }
          >
            <span class="pill-label">{describeWidths(widths)}</span>
            <button
              type="button"
              class="pill-remove"
              aria-label="Changes for every width"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onWidthsChange?.(null);
                inputRef.current?.focus();
              }}
            >
              <Icon name="close-small" />
            </button>
          </span>
        </div>
      )}
      <div class="field">
        <input
          ref={inputRef}
          class="input"
          type="search"
          aria-label="Add a property"
          placeholder="Add a property, or / for modifiers"
          role="combobox"
          list={undefined}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? "pilot-modifiers" : undefined}
          aria-activedescendant={menuOpen && options[active] ? `pilot-modifier-${options[active].id}` : undefined}
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
      {menuOpen && (
        <div class="modifiers" id="pilot-modifiers" role="listbox" aria-label="Modifiers">
          {options.length ? (
            options.map((m, i) => (
              <div
                key={m.id}
                id={`pilot-modifier-${m.id}`}
                class="modifier"
                role="option"
                aria-selected={i === active}
                data-active={i === active || undefined}
                onPointerEnter={() => setActive(i)}
                // Keep focus in the field.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                <span class="modifier-name">{m.name}</span>
                <span class="modifier-syntax">{m.syntax}</span>
                <span class="modifier-description">{m.description}</span>
              </div>
            ))
          ) : (
            <div class="modifier-none">No modifier matches</div>
          )}
        </div>
      )}
    </div>
  );
}
