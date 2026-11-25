import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { mathResult } from "../../../css/values.ts";
import { allTokens, type Token, type TokenKind } from "../../../dom/tokens.ts";
import { Icon } from "../Icon/Icon.tsx";
import { degreesOf, ScrubHandle } from "../ScrubHandle/ScrubHandle.tsx";
import { TokenMenu } from "../TokenMenu/TokenMenu.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";
import { currentToken, insertToken, matchTokens, tokenAt } from "../TokenMenu/tokens.ts";

/**
 * What's in a field being edited, for linked fields to mirror (padding's
 * px/py/p): its text, whether all of it is selected, and whether it was typed
 * (vs. just focused, or stepped with the arrows, which applies right away).
 */
export interface InputDraft {
  text: string;
  selected: boolean;
  typed: boolean;
}

interface PropertyInputTextProps {
  /**
   * The value set on the element (e.g. "100%"), or "" when none is: the field
   * is then empty (Pilot doesn't show computed values).
   */
  value: string;
  /** Accessible name, e.g. "Width". */
  label: string;
  /** The input itself, so the editor can focus it (e.g. from the search). */
  inputRef?: RefObject<HTMLInputElement | null>;
  /**
   * The designer typed something different from `value` and confirmed it
   * (Enter, Tab, blur). An empty `text` means they cleared the field: reset
   * the property to its default (remove the value).
   */
  onCommit(text: string): void;
  /**
   * ↑/↓, or the wheel while the field is being edited: step by ±1, or ±10
   * with Shift. `text` is what's in the field right now. A burst of wheel
   * steps passes one `gesture` (one undo step); a key press passes none.
   */
  onStep?(delta: number, text: string, gesture?: object): void;
  /** Enter, after committing: the value is done (e.g. back to the search). */
  onSubmit?(): void;
  /** Tab / Shift+Tab, after committing. Without it, Tab behaves natively. */
  onTab?(direction: 1 | -1): void;
  /** The field got focus. */
  onFocus?(): void;
  /**
   * Adds a drag handle (ScrubHandle) at the field's right edge: dragging it
   * up or down changes the value. Called on every change of the drag with
   * the total `steps` from the start (Shift: ×10), the field's text when the
   * drag started, and one `gesture` object for the whole drag (one undo step).
   * Returns how many steps the drag is past a limit the value stops at (see
   * ScrubHandle's onScrub), so the handle stretches.
   */
  onScrub?(steps: number, startText: string, gesture: object): number | void;
  /**
   * The drag handle is always the dial (an angle field: rotate), turned to
   * the angle the value ends with (`x 30deg` → 30), at 0 when there's none.
   * Without it, the dial shows only for a value that's an angle alone.
   */
  dial?: boolean;
  /**
   * Dimmed text shown while the field is empty, for a field that stands for
   * several values that differ ("Mixed"). Boxed fields have none otherwise:
   * an empty box means nothing is set.
   */
  placeholder?: string;
  /** The icon variant: an icon (12px) at the field's left, 6px before the text. */
  icon?: ComponentChildren;
  /**
   * A linked field is being edited: show its text once something has been
   * typed there, and its selection highlight while all of it is selected (a
   * page holds only one real selection, so it's drawn).
   */
  mirror?: InputDraft;
  /** Report this field's draft while it's being edited (null when editing ends). */
  onDraft?(draft: InputDraft | null): void;
  /**
   * The kinds of the page's tokens this field takes (see tokenKindsFor):
   * `--` typed in it lists them at the caret, and a variable button on its
   * right edge opens the same list. Picked, `var(--name)` goes where the
   * caret is (in a calc(), beside other values), or in place of the
   * selection: the whole value, from the button with the field not focused.
   */
  tokens?: { kinds: readonly TokenKind[]; property: string };
  /**
   * The value the element ends up with (computed): while the field holds
   * math (`100% - 20px`), hovering it shows what that comes to (`= 180px`),
   * except while it's being edited.
   */
  computed?: string;
  /** Shown, dimmed, but not editable: what it holds doesn't apply (a transparent color's opacity). A scrub handle stays, inactive. */
  disabled?: boolean;
}

/** The wheel's scroll per step (px), and the pause that ends a burst of steps (ms). */
const WHEEL_STEP = 24;
const WHEEL_PAUSE = 400;

/**
 * The value control in an editor row: a text input, shared by the property
 * editors. It sizes itself to its content, selects everything on the first
 * click (so typing replaces the value), commits on Enter/Tab/blur and
 * discards on Esc (which then bubbles to the dialog: back to the search).
 * ↑/↓ and the wheel step it (onStep). Parentheses close themselves, for calc()-style math and var().
 */
export function PropertyInputText({
  value,
  label,
  inputRef,
  onCommit,
  onStep,
  onSubmit,
  onTab,
  onFocus,
  mirror,
  onDraft,
  onScrub,
  dial: alwaysDial = false,
  icon,
  placeholder,
  tokens,
  computed,
  disabled = false,
}: PropertyInputTextProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  // What's being typed; null when the field isn't being edited.
  const [draft, setDraft] = useState<string | null>(null);
  // Enter commits right away; the blur that follows must not commit again.
  const skipBlurCommit = useRef(false);
  // With a scrub handle: the field's text when a drag starts (what it steps from).
  const scrubStart = useRef("");

  // Being edited, and typed into since it got focus (see InputDraft).
  const editing = useRef(false);
  const typed = useRef(false);

  const shown = mirror?.typed ? mirror.text : (draft ?? value);

  const report = () => {
    const el = ref.current;
    if (!el || !editing.current || !onDraft) return;
    const selected =
      el.value.length > 0
        ? el.selectionStart === 0 && el.selectionEnd === el.value.length
        : !typed.current;
    onDraft({ text: el.value, selected, typed: typed.current });
  };
  // Selection changes (select-all, caret moves) update the mirrored highlight.
  useEffect(() => {
    const el = ref.current;
    if (!el || !onDraft) return;
    el.addEventListener("select", report);
    el.addEventListener("selectionchange", report);
    document.addEventListener("selectionchange", report);
    return () => {
      el.removeEventListener("select", report);
      el.removeEventListener("selectionchange", report);
      document.removeEventListener("selectionchange", report);
    };
  });

  // Hovered while not being edited, a tooltip says what the field can't:
  // the whole value when it's cut (an ellipsis), and what math comes to.
  // Whether it's cut is measured when the pointer comes (the variable button
  // then takes room) and after every render (a new value, maybe longer).
  // Always in the tooltip, empty when there's nothing to say: the input
  // mustn't be made anew, and lose its focus, when there comes to be.
  const [cut, setCut] = useState(false);
  const measure = () => {
    const el = ref.current;
    setCut(!!el && el.scrollWidth > el.clientWidth + 1);
  };
  useLayoutEffect(measure);
  const result = draft === null ? mathResult(value, computed) : null;
  const tip = draft !== null ? "" : cut && value ? (result ? `${value} = ${result}` : value) : result ? `= ${result}` : "";

  // Also before a step or a drag: what the field shows (a variable just
  // picked, a value typed) is applied first, so the step goes from it, the
  // page's value of it included (a drag turns a variable into its number),
  // never from what was applied before.
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
  };

  // The value changed from outside while editing (undo/redo, arrow steps):
  // show it, selected, so typing replaces it. Written to the input directly
  // so the selection survives the re-render (which then finds the same value).
  useLayoutEffect(() => {
    const el = ref.current;
    if (draft === null || !el) return;
    el.value = value;
    setDraft(value);
    el.select();
    typed.current = false; // applied already (step, undo): nothing pending to mirror
    report();
  }, [value]);

  const onPointerDown = (e: PointerEvent) => {
    // First click: focus with everything selected. Once editing, clicks place
    // the caret natively.
    if (e.button !== 0 || draft !== null) return;
    e.preventDefault();
    ref.current?.focus();
    ref.current?.select();
  };

  // Smart parentheses. `beforeinput` rather than keydown: it fires for every
  // way text gets in (keyboards that don't report "(" as a key, input methods,
  // automation), and can be cancelled.
  const onBeforeInput = (e: InputEvent) => {
    const el = ref.current;
    if (!el || e.isComposing) return;
    const key =
      e.inputType === "insertText" && (e.data === "(" || e.data === ")")
        ? e.data
        : e.inputType === "deleteContentBackward"
          ? "Backspace"
          : null;
    if (!key) return;
    const edit = autoCloseParens(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0, key);
    if (!edit) return;
    e.preventDefault();
    el.value = edit.value;
    el.setSelectionRange(edit.caret, edit.caret);
    setDraft(edit.value); // programmatic changes don't fire `input`
    typed.current = true;
    report();
  };

  // The field's variables (TokenMenu): open for a `--name` typed at the caret
  // (`at` follows it as you type), or from the button (`at`: the selection
  // then, or the variable the field holds: `current`). The page's tokens are
  // read when it opens. The highlighted row (`active`) is -1 for none: the
  // list opens on the field's variable, as a select on its value, and on
  // nothing for any other value (a number isn't one of them); typing a name
  // highlights its first match.
  const [menu, setMenu] = useState<{ start: number; end: number; query: string; typed: boolean; current?: string } | null>(null);
  const [active, setActive] = useState(-1);
  const pool = useRef<Token[] | null>(null);
  if (!menu) pool.current = null;
  else pool.current ??= allTokens();
  const offered = menu && tokens ? matchTokens(pool.current ?? [], tokens.kinds, menu.query, tokens.property) : [];
  const anyFit = !!menu && !!tokens && (pool.current ?? []).some((t) => tokens.kinds.includes(t.kind));
  const followCaret = () => {
    const el = ref.current;
    if (!el || !tokens?.kinds.length) return;
    const at = tokenAt(el.value, el.selectionStart ?? el.value.length);
    if (at) {
      // A new `--`, or the name typed changed: its first match, or none for a bare `--`.
      if (!(menu?.typed && menu.start === at.start && menu.query === at.query)) setActive(at.query ? 0 : -1);
      setMenu({ ...at, typed: true });
    } else if (menu?.typed) setMenu(null);
  };
  const openFromButton = () => {
    const el = ref.current;
    if (!el) return;
    if (!editing.current) el.focus(); // focusing selects it all: the token takes the whole value
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? el.value.length;
    const current = tokens ? currentToken(el.value, start, end) : null;
    pool.current = allTokens();
    const list = tokens ? matchTokens(pool.current, tokens.kinds, "", tokens.property) : [];
    setActive(current ? list.findIndex((t) => t.name === current.name) : -1);
    setMenu(current ? { start: current.start, end: current.end, query: "", typed: false, current: current.name } : { start, end, query: "", typed: false });
  };
  const pickToken = (token: Token) => {
    const el = ref.current;
    if (!el || !menu) return;
    // The one it holds: kept as it is.
    if (token.name === menu.current) return setMenu(null);
    const next = insertToken(el.value, menu, token.name);
    el.value = next.text;
    el.setSelectionRange(next.caret, next.caret);
    setDraft(next.text); // programmatic changes don't fire `input`
    typed.current = true;
    setMenu(null);
    report();
    // Applied at once when the pick makes the value (picked from the
    // variables button, or a variable alone), so the page shows it now; while
    // typing math (`calc(--`), the value goes on, applied on Enter or leaving.
    if (!menu.typed || /^var\(\s*--[\w-]+\s*\)$/.test(next.text.trim())) onCommit(next.text);
  };

  // The wheel steps like ↑/↓, only while the field is being edited (elsewhere
  // it scrolls the dialog or the page): up is ↑. One step per notch of a
  // mouse wheel, and per WHEEL_STEP px of a trackpad's scroll, the first at
  // once; steps less than WHEEL_PAUSE apart are one gesture (one undo step).
  // A listener of its own: it must be able to cancel the scroll (not passive).
  // Bound again on every render: the input can be a new one (with or without its wrapper).
  const wheel = useRef<{ at: number; distance: number; gesture: object } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Shift turns the wheel sideways on macOS: deltaX then.
      const delta = e.deltaY || e.deltaX;
      if (!onStep || !editing.current || menu || !delta) return;
      e.preventDefault();
      const px = e.deltaMode === 1 ? delta * 16 : e.deltaMode === 2 ? delta * 400 : delta;
      const fresh = !wheel.current || e.timeStamp - wheel.current.at > WHEEL_PAUSE;
      if (!wheel.current || fresh) wheel.current = { at: e.timeStamp, distance: 0, gesture: {} };
      const burst = wheel.current;
      if (Math.sign(px) !== Math.sign(burst.distance)) burst.distance = 0; // turned around: count afresh
      burst.at = e.timeStamp;
      burst.distance += px;
      if (!fresh && Math.abs(burst.distance) < WHEEL_STEP) return;
      burst.distance = 0;
      commit();
      onStep((e.shiftKey ? 10 : 1) * (px < 0 ? 1 : -1), el.value, burst.gesture);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    // The variables list open: ↑/↓ move, Enter or Tab picks, Esc closes it (only it).
    if (menu) {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && offered.length) {
        e.preventDefault();
        const down = e.key === "ArrowDown";
        // From none: ↓ starts at the top, ↑ at the bottom.
        setActive((i) => (i < 0 ? (down ? 0 : offered.length - 1) : (i + (down ? 1 : -1) + offered.length) % offered.length));
        return;
      }
      if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && offered[active]) {
        e.preventDefault();
        pickToken(offered[active] as Token);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenu(null);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      skipBlurCommit.current = true;
      onSubmit?.();
      ref.current?.blur(); // no-op if focus already moved
    } else if (e.key === "Tab" && onTab) {
      e.preventDefault();
      onTab(e.shiftKey ? -1 : 1); // focus moves; the value commits on blur
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && onStep) {
      e.preventDefault();
      commit();
      onStep((e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1), shown);
    } else if (e.key === "Escape") {
      setDraft(value); // discard; the dialog then returns to the search
      typed.current = false;
      onDraft?.({ text: value, selected: false, typed: false });
    }
  };

  const input = (
    <input
      ref={ref}
      class="property-input-text field-box"
      type="text"
      spellcheck={false}
      autocomplete="off"
      aria-label={label}
      disabled={disabled}
      data-scrub={onScrub ? "" : undefined}
      data-icon={icon ? "" : undefined}
      // Linked to the field being edited: it shows focused too (base.css).
      data-mirror-focus={mirror ? "" : undefined}
      value={shown}
      placeholder={placeholder}
      onPointerDown={onPointerDown}
      onFocus={() => {
        editing.current = true;
        typed.current = false;
        setDraft(value);
        ref.current?.select();
        onFocus?.();
        report();
      }}
      onBeforeInput={onBeforeInput}
      onInput={(e) => {
        setDraft(e.currentTarget.value);
        typed.current = true;
        report();
        followCaret();
      }}
      onKeyUp={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") followCaret();
      }}
      onBlur={() => {
        setMenu(null);
        editing.current = false;
        onDraft?.(null);
        if (skipBlurCommit.current) skipBlurCommit.current = false;
        else commit();
        setDraft(null);
      }}
      onKeyDown={onKeyDown}
    />);
  // Mirroring a linked field that's being edited: its selection, drawn over
  // this field's text (a page holds only one real selection). With no text
  // there's nothing to draw: the focused look (data-mirror-focus) shows it.
  const drawnSelection = !!mirror?.selected && !!shown;
  const withTokens = !!tokens?.kinds.length;
  const needsWrap = !!onScrub || !!icon || drawnSelection || withTokens;

  // An angle (`200deg`): the scrub handle is a dial, turned to it.
  // The angle the value ends with (`x 30deg` → 30), for an always-dial field.
  const endDegrees = alwaysDial ? (degreesOf(value.trim().split(/\s+/).at(-1) ?? "") ?? 0) : null;
  const dial = !!onScrub && (alwaysDial || degreesOf(value) !== null);
  // With an icon, a scrub handle, a drawn selection or variables: a wrapper
  // the input fills, with them on top.
  const wrapped = (
    <span
      class={onScrub ? "input-wrap scrub-field" : "input-wrap"}
      data-dial={dial ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      data-tokens={withTokens ? "" : undefined}
      data-tokens-open={menu ? "" : undefined}
    >
      {icon && <span class="input-icon">{icon}</span>}
      {input}
      {drawnSelection && (
        <span class="mirror-selection" data-icon={icon ? "" : undefined} aria-hidden="true">
          <span>{shown}</span>
        </span>
      )}
      {onScrub && (
        <ScrubHandle
          onStart={() => {
            commit();
            scrubStart.current = ref.current?.value ?? value;
            return true;
          }}
          onScrub={(steps, gesture) => onScrub(steps, scrubStart.current, gesture)}
          degrees={dial ? (degreesOf(value) ?? endDegrees) : null}
        />
      )}
      {withTokens && (
        <button
          type="button"
          class="token-button"
          tabIndex={-1}
          aria-label={`Variables for ${label}`}
          // Not taking focus: a field being edited keeps its caret, for the token to go there.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (menu ? setMenu(null) : openFromButton())}
        >
          <Icon name="variable" />
        </button>
      )}
      {menu && ref.current && (
        <TokenMenu
          tokens={offered}
          any={anyFit}
          active={active}
          current={menu.current}
          anchor={ref.current.getBoundingClientRect()}
          onActive={setActive}
          onPick={pickToken}
        />
      )}
    </span>
  );
  return (
    <Tooltip text={tip} block align="end" onEnter={measure}>
      {needsWrap ? wrapped : input}
    </Tooltip>
  );
}

/**
 * Smart parentheses, like a code editor (safe in CSS: every "(" needs its ")"):
 * - "(" inserts "()" with the caret inside, or wraps the selected text;
 * - ")" right before a ")" that closes an open "(" steps over it;
 * - Backspace inside an empty "()" deletes both.
 * Returns the new text and caret, or null to let the key behave normally.
 */
export function autoCloseParens(
  text: string,
  start: number,
  end: number,
  key: string,
): { value: string; caret: number } | null {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  if (key === "(") {
    return { value: `${before}(${selected})${after}`, caret: start + 1 + selected.length };
  }
  if (key === ")" && start === end && after.startsWith(")")) {
    const open = (before.match(/\(/g)?.length ?? 0) - (before.match(/\)/g)?.length ?? 0);
    if (open > 0) return { value: text, caret: start + 1 };
  }
  if (key === "Backspace" && start === end && before.endsWith("(") && after.startsWith(")")) {
    return { value: `${before.slice(0, -1)}${after.slice(1)}`, caret: start - 1 };
  }
  return null;
}
