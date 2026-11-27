import type { ElementState } from "@pilot/protocol";
import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { takeStates } from "../../../edits/states.ts";
import { type Condition, conditionCss, conditionKey, readCondition } from "../../../edits/condition.ts";
import type { EditHistory } from "../../../edits/history.ts";
import { pageBreakpoints } from "../../../dom/breakpoints.ts";
import { ALL_WIDTHS, type PartialWidth, type WidthChip, chipRange, inWidths, isBaseChip, takeWidths, widthSuggestion, widthToFinish } from "../../../edits/widths.ts";
import { MODIFIERS, type Modifier, isModifierQuery, matchModifiers } from "../../../search/modifiers.ts";
import { scrollWithin } from "../../../dom/reveal.ts";
import { Icon } from "../Icon/Icon.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";

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
  /** The `default` pill is on instead of the states' (the element as it is). */
  defaultState?: boolean;
  /** `default` or the states' pill was clicked. */
  onDefaultStateChange?(on: boolean): void;
  /**
   * The modifiers used on the element (search/used.ts), listed first in the
   * `/` menu, marked; a state used alone takes its general row's place.
   */
  used?: Modifier[];
  /** Take focus when it appears (default). False when the selection came from somewhere that keeps focus (the DOM tree). */
  autoFocus?: boolean;
  /** The element edited: what a condition's words are read for (edits/condition.ts). */
  element?: Element;
  /** A condition described in words, in the modifiers' pill (null: none). */
  condition?: Condition | null;
  /** The condition was set (Create modifier) or removed. Without it, no Create modifier. */
  onConditionChange?(condition: Condition | null): void;
  /** Where a condition is forced on (the preview only): EditHistory.force. */
  history?: EditHistory;
  /** Show this element on the page (the ancestor a condition names), or none. */
  onPeek?(element: Element | null): void;
  /** A condition's words are being described (the dialog hides its properties meanwhile), or not anymore. */
  onDescribingChange?(on: boolean): void;
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
  defaultState = false,
  onDefaultStateChange,
  used = NO_MODIFIERS,
  autoFocus = true,
  element,
  condition = null,
  onConditionChange,
  history,
  onPeek,
  onDescribingChange,
}: PropertySearchProps) {
  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Modifiers typed at the start become pills: `from-1200 ` / `to-767 ` the
  // width chip, `hover:` / `active:`… a state; the rest is the search. They
  // can come in any order (`hover:from-768 `).
  // Create modifier picked with words Pilot can't read: the field takes the condition's words (not a property, nor modifiers), read as they're
  // typed (the line under it says how), Enter sets it, Esc goes back to the `/` menu.
  const [describing, setDescribing] = useState<{ words: string; cameFrom: string } | null>(null);
  const reading = describing && element ? readCondition(describing.words, element) : null;
  const target = reading && "condition" in reading ? (reading.target ?? null) : null;
  useEffect(() => {
    onPeek?.(target);
  }, [target]);
  useEffect(() => () => onPeek?.(null), []);
  useEffect(() => onDescribingChange?.(!!describing), [!!describing]);
  const stopDescribing = (back: string) => {
    setDescribing(null);
    onPeek?.(null);
    onChange(back);
  };

  const onInput = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    // Everything deleted: back to the search as it was at first (no line asking for words).
    if (describing) return input.value ? setDescribing({ ...describing, words: input.value }) : stopDescribing("");
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
    // Spaces before the search mean nothing, and one left alone hid the placeholder (it was carried to the
    // next element's dialog, which looked empty but wasn't): they go.
    const trimmed = rest.trimStart();
    if (taken || trimmed !== rest) {
      if (range !== widths) onWidthsChange?.(range);
      if (nextStates !== states) onStatesChange?.(nextStates);
      rest = trimmed;
      input.value = rest;
    }
    onChange(rest);
  };

  // The `/` menu: typing `/` at the start lists the modifiers (see
  // search/modifiers.ts), filtered by what follows. ↑/↓ move, Enter or Tab
  // picks (its syntax goes in the search, to finish typing), Esc closes it by
  // clearing the `/…` text (it's not a property search).
  // `from-` (or `to-`) lists the widths to finish it with, the same way: the
  // window's first, then the page's breakpoints (widthOptions).
  const typedWidth = onWidthsChange ? widthToFinish(value) : null;
  const widthList = !!typedWidth;
  const menuOpen = !!onWidthsChange && !describing && (isModifierQuery(value) || widthList);
  const matched = !menuOpen
    ? []
    : widthList && typedWidth
      ? widthOptions(typedWidth, viewportWidth, used)
      : matchModifiers(value, menuList(used));
  // Typed after `/` and matching nothing: Create modifier, the words as a condition, rather than "no match" (the
  // owner's call, 2026-11-27: the only way in, an Only when… row was dropped).
  const typedWords = menuOpen && !widthList ? value.replace(/^\//, "").trim() : "";
  const options =
    !matched.length && typedWords && onConditionChange && element ? [createRow(typedWords)] : matched;
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [value]);
  // The menu scrolls past its max height (PropertySearch.css): the highlighted row kept in view, and a fade
  // on each edge with more to scroll to.
  const menuRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  const readMore = () => {
    const list = menuRef.current;
    const next = list
      ? { above: list.scrollTop > 0, below: list.scrollTop + list.clientHeight < list.scrollHeight - 1 }
      : { above: false, below: false };
    setMore((current) => (current.above === next.above && current.below === next.below ? current : next));
  };
  useLayoutEffect(readMore);
  useLayoutEffect(() => {
    const list = menuRef.current;
    if (!list) return;
    // The first and last rows: to the very edge, past the padding, so no fade lies over them.
    if (active === 0) list.scrollTop = 0;
    else if (active === options.length - 1) list.scrollTop = list.scrollHeight;
    else scrollWithin(list, list.querySelector(".modifier[data-active]"));
  }, [active, value]);
  // The `/` menu's text when From width or To width was picked from it: Esc in the widths goes back there.
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!typedWidth) setCameFrom(null);
  }, [!!typedWidth]);
  // `from-` (or `to-`) suggests the rest of the width Enter or Tab would take, dimmed after the text: the
  // highlighted row's (the window's at first, a breakpoint's once moved to).
  const suggested = widthList ? options[active]?.width?.value : viewportWidth;
  const suggestion = onWidthsChange && suggested !== undefined ? widthSuggestion(value, suggested) : null;
  const pick = (index: number) => {
    const modifier = options[index];
    if (!modifier) return;
    // A state, Base and All widths are complete as picked: their pill right away. A width needs its number typed.
    // One used on the element sets exactly its pills (its states, its widths or none).
    if (modifier.width) {
      onWidthsChange?.(takeWidths(`${modifier.width.end}-${modifier.width.value} `, widths).range);
      onChange("");
    } else if (modifier.used) {
      onStatesChange?.(modifier.used.states);
      onWidthsChange?.(modifier.used.widths ?? null);
      // Exactly its pills: its condition, or none.
      if (condition && conditionKey(condition) !== conditionKey(modifier.used.condition)) history?.force(condition, false);
      onConditionChange?.(modifier.used.condition ?? null);
      onChange("");
    } else if (modifier.state) {
      onStatesChange?.(takeStates(modifier.insert, states).states ?? states);
      onChange("");
    } else if (modifier.chip) {
      onWidthsChange?.(modifier.chip === "base" ? {} : modifier.chip);
      onChange("");
    } else if (modifier.words !== undefined && element) {
      // Create modifier: set at once when read; else the words go on being described, the line saying how to put them.
      const read = readCondition(modifier.words, element);
      if ("condition" in read) {
        if (condition) history?.force(condition, false);
        onConditionChange?.(read.condition);
        onChange("");
      } else {
        setDescribing({ words: modifier.words, cameFrom: value });
        onChange("");
      }
    } else {
      setCameFrom(value);
      onChange(modifier.insert);
    }
    inputRef.current?.focus();
  };

  // Backspace at the very start of the field removes the chip. Tab takes the
  // suggested width: the chip, as if `from-1108 ` had been typed.
  const onSearchKeyDown = (e: KeyboardEvent) => {
    const input = e.currentTarget as HTMLInputElement;
    if (describing) {
      if (e.key === "Enter") {
        e.preventDefault();
        // Set only when read: otherwise the line under the field says how to put it.
        if (reading && "condition" in reading) {
          if (condition) history?.force(condition, false);
          onConditionChange?.(reading.condition);
          stopDescribing("");
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // a step back to the `/` menu, not a step of the dialog
        stopDescribing(describing.cameFrom);
        return;
      }
      if (e.key === "Tab") e.preventDefault();
      return;
    }
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
        // From the widths, a step back: the `/` menu they were picked from, as it was. Else it closes.
        onChange(widthList && cameFrom !== null ? cameFrom : "");
        setCameFrom(null);
        return;
      }
    }
    if (e.key === "Tab" && !e.shiftKey && suggestion) {
      e.preventDefault();
      onWidthsChange?.(takeWidths(`${value}${suggestion} `, widths).range);
      onChange("");
      return;
    }
    // Backspace at the very start removes the last pill: the condition, a state, then the width chip.
    if (e.key === "Backspace" && (condition || states.length || widths) && input.selectionStart === 0 && input.selectionEnd === 0) {
      e.preventDefault();
      if (condition) {
        history?.force(condition, false);
        onConditionChange?.(null);
      } else if (states.length) onStatesChange?.(states.slice(0, -1));
      else onWidthsChange?.(null);
      return;
    }
    onKeyDown?.(e);
  };

  const outside = !!widths && viewportWidth !== undefined && !inWidths(widths, viewportWidth);

  return (
    <div class="property-search" data-pills={widths || states.length || condition ? "" : undefined}>
      {/* Pills: the search's modifiers (today the width chip), in a row of their
          own above the field, so more can sit side by side. */}
      {(widths || states.length > 0 || !!condition) && (
        // The modifiers as a pair: `default`, the element with none (its fields following the rule that
        // applies at the window's width), and the modifiers together as one pill, written as they're typed
        // (`from-988:hover:focus`), one of the two on, a click switching. To compare a property with and
        // without them, or see what each sets, without retyping them (the owner's design, 2026-11-26).
        <div class="pills">
          <button
            type="button"
            class="pill pill-toggle"
            data-pill="default"
            data-off={!defaultState || undefined}
            aria-pressed={defaultState}
            title="Changes are for the element with no modifier, where the rule applies at the window's width. Click the modifiers to switch back."
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onDefaultStateChange?.(true)}
          >
            default
          </button>
          <span class="pill" data-pill="modifiers" data-off={defaultState || undefined} data-outside={(outside && !defaultState) || undefined}>
            <button
              type="button"
              class="pill-label pill-switch"
              aria-pressed={!defaultState}
              title={
                outside
                  ? `The window (${viewportWidth}px) is outside these widths: what you see isn't what these changes are for`
                  : widths === "all"
                    ? "Changes are for every width: the base value, with the property's breakpoint rules removed. Backspace at the start of the field removes the last modifier."
                    : "Changes are for these modifiers, together. Click default to switch. Backspace at the start of the field removes the last one."
              }
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onDefaultStateChange?.(false)}
            >
              {modifiersLabel(widths, states, condition)}
            </button>
            <button
              type="button"
              class="pill-remove"
              aria-label={`No ${modifiersLabel(widths, states, condition)}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onWidthsChange?.(null);
                onStatesChange?.([]);
                if (condition) history?.force(condition, false);
                onConditionChange?.(null);
                inputRef.current?.focus();
              }}
            >
              <Icon name="close-small" />
            </button>
          </span>
          {/* Where it lives is the owner's to decide: here for now, after the pill. */}
          {condition && history && <ForceState condition={condition} history={history} />}
        </div>
      )}
      <div class="field">
        <input
          ref={inputRef}
          class="input"
          type="search"
          aria-label={describing ? "Describe when" : "Add a property"}
          placeholder={describing ? "Describe when: the parent .card has focus inside" : "Add a property, or / for modifiers"}
          role="combobox"
          list={undefined}
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? "pilot-modifiers" : undefined}
          aria-activedescendant={menuOpen && options[active] ? `pilot-modifier-${options[active].id}` : undefined}
          value={describing ? describing.words : value}
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
      {describing && (
        // How the words read, as they're typed: Pilot's CSS for them and what they name (highlighted on the page),
        // or how to put them. In the `/` menu's row look, pending the owner's design.
        <div class="condition-reading" role="status" data-error={(reading && "error" in reading) || undefined}>
          {reading && "condition" in reading ? (
            <>
              <span class="modifier-syntax">{conditionCss(reading.condition)}</span>
              <span class="modifier-description">Enter sets it</span>
            </>
          ) : reading && "error" in reading ? (
            // Short: what's wrong in red, how to put it after, dimmed (the owner's design, 2026-11-27).
            <span class="modifier-description">
              <span class="condition-error">{reading.error}</span>
              {reading.hint && ` ${reading.hint}`}
            </span>
          ) : null}
        </div>
      )}
      {menuOpen && (
        <div class="modifiers-frame">
        <div
          ref={menuRef}
          class="modifiers"
          id="pilot-modifiers"
          role="listbox"
          aria-label={widthList ? "Widths" : "Modifiers"}
          data-list={widthList ? "widths" : undefined}
          onScroll={readMore}
        >
          {options.length ? (
            options.map((m, i) => (
              <div
                key={m.id}
                id={`pilot-modifier-${m.id}`}
                class="modifier"
                data-used={!!m.used || undefined}
                data-window={m.width?.window || undefined}
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
            <div class="modifier-none">{widthList ? "Any width: type it, then a space" : "No modifier matches"}</div>
          )}
        </div>
          <div class="fade" data-edge="top" data-shown={more.above || undefined} aria-hidden="true" />
          <div class="fade" data-edge="bottom" data-shown={more.below || undefined} aria-hidden="true" />
          <ScrollThumb target={menuRef} />
        </div>
      )}
    </div>
  );
}

const NO_MODIFIERS: Modifier[] = [];

/** The `/` menu's row for words that match no modifier: a condition made of them (the owner's wording). */
function createRow(words: string): Modifier {
  return { id: "create", name: "Create modifier", syntax: "", description: "Use natural language to describe when", insert: "", words };
}

/**
 * The `/` menu's list: the ones used on the element first, then the general
 * ones, less a state used alone (its used row stands for it).
 */
function menuList(used: readonly Modifier[]): Modifier[] {
  const alone = new Set(used.filter((u) => u.used && !u.used.widths && !u.used.condition && u.used.states.length === 1).map((u) => u.used?.states[0]));
  return [...used, ...MODIFIERS.filter((m) => !m.state || !alone.has(m.state))];
}

/**
 * A condition's "force state" checkbox (the owner's call, 2026-11-27, as the browser's developer tools force a
 * state): checked, its changes show as if it held, whatever the page does; unchecked, Pilot doesn't interfere.
 * EditHistory.force: the preview only, the page isn't touched. A reading of whether it held right now (true now,
 * false now) and forcing it false were tried first: too many states for one control.
 */
function ForceState({ condition, history }: { condition: Condition; history: EditHistory }) {
  const [on, setOn] = useState(() => history.forced(condition));
  useEffect(() => setOn(history.forced(condition)), [condition]);
  const set = (next: boolean) => {
    history.force(condition, next);
    setOn(next);
  };
  return (
    // The label's text toggles it too, by hand (the owner found a click on it did nothing, 2026-11-27): the click is
    // handled here and the browser's own label activation held back, so it toggles once.
    <label
      class="pill-force"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        if ((e.target as Element).tagName === "INPUT") return;
        e.preventDefault();
        set(!on);
      }}
    >
      <input type="checkbox" checked={on} onChange={(e) => set((e.currentTarget as HTMLInputElement).checked)} />
      <span>force state</span>
    </label>
  );
}

/** The modifiers as typed, together: `from-988:hover:focus`, `base:hover`, `all-widths`; a condition after them, in its words. */
function modifiersLabel(widths: WidthChip | null, states: readonly ElementState[], condition?: Condition | null): string {
  const range = chipRange(widths);
  const width =
    widths === ALL_WIDTHS
      ? ["all-widths"]
      : isBaseChip(widths)
        ? ["base"]
        : range
          ? [range.min !== undefined ? `from-${range.min}` : "", range.max !== undefined ? `to-${range.max}` : ""].filter(Boolean)
          : [];
  const typed = [...width, ...states].join(":");
  // The condition's words as typed, without a "when" before them (the owner's call, 2026-11-27).
  return condition ? [typed, condition.words].filter(Boolean).join(" · ") : typed;
}

/**
 * The widths to finish `from-` or `to-` with, under the search: the window's
 * width first (what's suggested after the text, and what Tab takes), then the
 * page's breakpoints, with No breakpoint where it falls on the number line
 * (from 0px first, to ∞ last; until digits are typed), the ones the ruler shows (pageBreakpoints). A
 * breakpoint `to` ends a pixel before it (`to-767` for 768). Filtered by the
 * digits typed (`from-7` → 768). Those the element uses are marked, with what
 * they set there (search/used.ts).
 */
function widthOptions(typed: PartialWidth, viewportWidth: number | undefined, used: readonly Modifier[]): Modifier[] {
  const { end } = typed;
  const digits = typed.digits ?? "";
  const rows: Modifier[] = [];
  if (viewportWidth !== undefined) {
    rows.push({
      id: "width-window",
      name: "Window width",
      description: "The width you're looking at now",
      syntax: `${end}-${viewportWidth}`,
      insert: "",
      width: { end, value: viewportWidth, window: true },
    });
  }
  // No breakpoint, on the number line: from 0px (first), up to ∞ (last). It holds at every width, as the
  // value without a media query does; it sets that, `base`, not a media query (the owner's call, 2026-11-26).
  const base = MODIFIERS.find((m) => m.chip === "base");
  const noBreakpoint = !digits && base ? { ...base, id: "width-base", name: end === "from" ? "0px" : "∞", description: "No breakpoint" } : null;
  if (noBreakpoint && end === "from") rows.push(noBreakpoint);
  for (const b of pageBreakpoints()) {
    const value = end === "from" ? b : b - 1;
    const here = used.filter((u) => (end === "from" ? u.used?.widths?.min === value : u.used?.widths?.max === value));
    rows.push({
      id: `width-${value}`,
      // Named by the breakpoint, as the ruler shows it: `to-767` is "Below 768px".
      name: end === "from" ? `${b}px` : `Below ${b}px`,
      description: here.length ? here.map((u) => (u.used?.states.length ? `${u.used.states.join(":")}: ${u.description}` : u.description)).join(" · ") : "A breakpoint of the page",
      syntax: `${end}-${value}`,
      insert: "",
      width: { end, value },
      ...(here.length && { used: { states: [] } }),
    });
  }
  if (noBreakpoint && end === "to") rows.push(noBreakpoint);
  return rows.filter((r) => !r.width || String(r.width.value).startsWith(digits));
}
