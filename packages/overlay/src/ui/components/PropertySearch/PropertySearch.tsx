import type { ElementState } from "@pilot/protocol";
import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";
import { takeStates } from "../../../edits/states.ts";
import { type WidthChip, chipLabel, inWidths, takeWidths, widthSuggestion } from "../../../edits/widths.ts";
import { isModifierQuery, matchModifiers } from "../../../search/modifiers.ts";
import { Icon } from "../Icon/Icon.tsx";

interface PropertySearchProps {
  value: string;
  onChange(value: string): void;
  onKeyDown?(e: KeyboardEvent): void;
  /** The field itself, so the dialog can move focus back to it. */
  inputRef: RefObject<HTMLInputElement | null>;
  /** The width chip: the viewport widths changes are for. null: no chip (the rule that applies at the window's width). */
  widths?: WidthChip | null;
  /** The chip changed: typed (`from-1200 `, `base `), picked in the `/` menu, or removed (null). Without it, no chip. */
  onWidthsChange?(widths: WidthChip | null): void;
  /** The window's width now, to show when it's outside the chip's range. */
  viewportWidth?: number;
  /** The state pills: the element states changes are for, together. [] for none. */
  states?: ElementState[];
  /** The state pills changed: typed (`hover:`), picked in the `/` menu, or removed. */
  onStatesChange?(states: ElementState[]): void;
  /** Take focus when it appears (default). False when the selection came from somewhere that keeps focus (the DOM tree). */
  autoFocus?: boolean;
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
  states = [],
  onStatesChange,
  autoFocus = true,
}: PropertySearchProps) {
  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Modifiers typed at the start become pills: `from-1200 ` / `to-767 ` the
  // width chip, `hover:` / `active:`… a state; the rest is the search. They
  // can come in any order (`hover:from-768 `).
  const onInput = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    let rest = input.value;
    let range = widths;
    let nextStates = states;
    let taken = false;
    for (;;) {
      const w = onWidthsChange ? takeWidths(rest, range) : null;
      if (w?.range) {
        range = w.range;
        rest = w.rest;
        taken = true;
        continue;
      }
      const s = onStatesChange ? takeStates(rest, nextStates) : null;
      if (s?.states) {
        nextStates = s.states;
        rest = s.rest;
        taken = true;
        continue;
      }
      break;
    }
    if (taken) {
      if (range !== widths) onWidthsChange?.(range);
      if (nextStates !== states) onStatesChange?.(nextStates);
      input.value = rest;
    }
    onChange(rest);
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
    // A state, Base and All widths are complete as picked: their pill right away. A width needs its number typed.
    if (modifier.state) {
      onStatesChange?.(takeStates(modifier.insert, states).states ?? states);
      onChange("");
    } else if (modifier.chip) {
      onWidthsChange?.(modifier.chip === "base" ? {} : modifier.chip);
      onChange("");
    } else onChange(modifier.insert);
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
    // Backspace at the very start removes the last pill: a state, then the width chip.
    if (e.key === "Backspace" && (states.length || widths) && input.selectionStart === 0 && input.selectionEnd === 0) {
      e.preventDefault();
      if (states.length) onStatesChange?.(states.slice(0, -1));
      else onWidthsChange?.(null);
      return;
    }
    onKeyDown?.(e);
  };

  const outside = !!widths && viewportWidth !== undefined && !inWidths(widths, viewportWidth);

  return (
    <div class="property-search" data-pills={widths || states.length ? "" : undefined}>
      {/* Pills: the search's modifiers (today the width chip), in a row of their
          own above the field, so more can sit side by side. */}
      {(widths || states.length > 0) && (
        <div class="pills">
          {widths && (
            <span
              class="pill"
              data-pill="widths"
              data-outside={outside || undefined}
              title={
                outside
                  ? `The window (${viewportWidth}px) is outside this range: what you see isn't what these changes are for`
                  : widths === "all"
                    ? "Changes are for every width: the base value, with the property's breakpoint rules removed. Backspace at the start of the field removes it."
                    : "Changes are for these viewport widths. Backspace at the start of the field removes it."
              }
            >
              <span class="pill-label">{chipLabel(widths)}</span>
              <button
                type="button"
                class="pill-remove"
                aria-label="Changes where the rule applies at this width"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onWidthsChange?.(null);
                  inputRef.current?.focus();
                }}
              >
                <Icon name="close-small" />
              </button>
            </span>
          )}
          {states.map((state) => (
            <span
              key={state}
              class="pill"
              data-pill="state"
              title="Changes are for this element state (all the state pills together). Backspace at the start of the field removes the last pill."
            >
              <span class="pill-label">{state}</span>
              <button
                type="button"
                class="pill-remove"
                aria-label={`Not only ${state}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onStatesChange?.(states.filter((s) => s !== state));
                  inputRef.current?.focus();
                }}
              >
                <Icon name="close-small" />
              </button>
            </span>
          ))}
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
