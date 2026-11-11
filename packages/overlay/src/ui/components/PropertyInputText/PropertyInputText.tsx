import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

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
   * is then empty and shows `placeholder`.
   */
  value: string;
  /** The property's default, shown (dimmed) while no value is set, e.g. "auto". */
  placeholder?: string;
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
  /** ↑/↓: step by ±1, or ±10 with Shift. `text` is what's in the field right now. */
  onStep?(delta: number, text: string): void;
  /** Enter, after committing: the value is done (e.g. back to the search). */
  onSubmit?(): void;
  /** Tab / Shift+Tab, after committing. Without it, Tab behaves natively. */
  onTab?(direction: 1 | -1): void;
  /** The field got focus. */
  onFocus?(): void;
  /** Compact size, for tight layouts such as the box-model diagram (12px tall). */
  compact?: boolean;
  /**
   * A linked field is being edited: show its text once something has been
   * typed there, and its selection highlight while all of it is selected (a
   * page holds only one real selection, so it's drawn).
   */
  mirror?: InputDraft;
  /** Report this field's draft while it's being edited (null when editing ends). */
  onDraft?(draft: InputDraft | null): void;
}

/**
 * The value control in an editor row: a text input, shared by the property
 * editors. It sizes itself to its content, selects everything on the first
 * click (so typing replaces the value), commits on Enter/Tab/blur and
 * discards on Esc (which then bubbles to the dialog: back to the search).
 * Parentheses close themselves, for calc()-style math and var().
 */
export function PropertyInputText({
  value,
  placeholder,
  label,
  inputRef,
  onCommit,
  onStep,
  onSubmit,
  onTab,
  onFocus,
  compact,
  mirror,
  onDraft,
}: PropertyInputTextProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  // What's being typed; null when the field isn't being edited.
  const [draft, setDraft] = useState<string | null>(null);
  // Enter commits right away; the blur that follows must not commit again.
  const skipBlurCommit = useRef(false);

  // Being edited, and typed into since it got focus (see InputDraft).
  const editing = useRef(false);
  const typed = useRef(false);

  const shown = mirror?.typed ? mirror.text : (draft ?? value);

  // An empty field that has focus and hasn't been typed into counts as
  // selected: typing will replace its placeholder, as it replaces a selected
  // value. Drawn behind the placeholder, and mirrored by linked fields, so it's
  // clear several values will change at once even when they're all defaults.
  const placeholderSelected = draft === "" && !typed.current && !!placeholder;

  const report = () => {
    const el = ref.current;
    if (!el || !editing.current || !onDraft) return;
    const selected =
      el.value.length > 0
        ? el.selectionStart === 0 && el.selectionEnd === el.value.length
        : !typed.current && !!placeholder;
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

  const onKeyDown = (e: KeyboardEvent) => {
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
      onStep((e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1), shown);
    } else if (e.key === "Escape") {
      setDraft(value); // discard; the dialog then returns to the search
      typed.current = false;
      onDraft?.({ text: value, selected: false, typed: false });
    }
  };

  return (
    <input
      ref={ref}
      class="property-input-text"
      type="text"
      spellcheck={false}
      autocomplete="off"
      aria-label={label}
      data-compact={compact || undefined}
      data-mirror-selected={mirror?.selected || undefined}
      data-placeholder-selected={placeholderSelected || undefined}
      value={shown}
      placeholder={placeholder}
      // Fallback sizing where `field-sizing: content` isn't supported: the
      // font is monospaced, so the width in `ch` is exact (an empty field is
      // as wide as its placeholder).
      style={{ "--chars": String(Math.max(1, (shown || placeholder || "").length)) }}
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
      }}
      onBlur={() => {
        editing.current = false;
        onDraft?.(null);
        if (skipBlurCommit.current) skipBlurCommit.current = false;
        else commit();
        setDraft(null);
      }}
      onKeyDown={onKeyDown}
    />
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
