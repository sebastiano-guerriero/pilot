import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

/**
 * The four sides, as trapezoids between the label and the wrapper's edges.
 * `axis`/`sign` map a drag to a value: dragging *outward* (away from the
 * label) increases the padding, e.g. up for top, left for left.
 */
const SIDES = [
  { side: "top", property: "padding-top", axis: "y", sign: -1 },
  { side: "right", property: "padding-right", axis: "x", sign: 1 },
  { side: "bottom", property: "padding-bottom", axis: "y", sign: 1 },
  { side: "left", property: "padding-left", axis: "x", sign: -1 },
] as const;

type Side = (typeof SIDES)[number];
type SideName = Side["side"];

/**
 * What the designer typed in the search → which side to focus, and which sides
 * a typed value applies to. Tailwind semantics: `px` sets left and right,
 * `py` top and bottom, `p` all four. Anything else (`padding`, `pad`…) focuses
 * top and edits one side at a time.
 */
const FOCUS_TARGETS: Record<string, { focus: SideName; linked?: SideName[] }> = {
  p: { focus: "top", linked: ["top", "right", "bottom", "left"] },
  pt: { focus: "top" },
  pr: { focus: "right" },
  pb: { focus: "bottom" },
  pl: { focus: "left" },
  px: { focus: "left", linked: ["left", "right"] },
  py: { focus: "top", linked: ["top", "bottom"] },
  "padding-top": { focus: "top" },
  "padding-right": { focus: "right" },
  "padding-bottom": { focus: "bottom" },
  "padding-left": { focus: "left" },
};

/** Alt-dragging a side also sets the side across from it. */
const OPPOSITE: Record<SideName, SideName> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/**
 * Which other sides a drag also changes: none, the opposite one (Alt), or all
 * of them (Shift; wins over Alt).
 */
type Mode = "one" | "both" | "all";
const modeOf = (e: { altKey: boolean; shiftKey: boolean }): Mode => (e.shiftKey ? "all" : e.altKey ? "both" : "one");

/** The other sides a drag on `side` changes in `mode`. */
function companions(side: SideName, mode: Mode): SideName[] {
  if (mode === "all") return SIDES.map((s) => s.side).filter((s) => s !== side);
  if (mode === "both") return [OPPOSITE[side]];
  return [];
}

/** Pointer travel (px) before a press on a side becomes a drag instead of a click. */
const DRAG_THRESHOLD = 3;

/**
 * Padding editor: a box-model diagram with an editable number per side. Each
 * side can be typed into (click it, type, Enter) or scrubbed by dragging over
 * its area. From the search, `pt`/`pr`/`pb`/`pl` focus that side and
 * `px`/`py`/`p` link sides so one value sets them all.
 */
export function PaddingEditor({
  values,
  onChange,
  onRevert,
  focusRequest,
  onReturnToSearch,
  onHint,
  onInspect,
}: PropertyEditorProps) {
  // The editable number of each side, in SIDES order, so focus can move between them.
  const refs = useRef(SIDES.map(() => ({ current: null as HTMLSpanElement | null })));
  // Sides a typed value currently applies to together (set by px/py/p).
  const [linked, setLinked] = useState<SideName[] | null>(null);
  // What's being typed in a linked side, mirrored on the other linked sides so
  // all of them show the edit (text, and the selection while it's all selected).
  const [draft, setDraft] = useState<{ from: SideName } & Draft | null>(null);

  // The side being dragged, and which other sides the drag also changes.
  const [drag, setDrag] = useState<{ side: SideName; mode: Mode } | null>(null);
  // The side whose drag area (not its number) is under the pointer, and the
  // modifiers held: what a drag would do is shown before it starts.
  const [hover, setHover] = useState<SideName | null>(null);
  const [keys, setKeys] = useState({ altKey: false, shiftKey: false });
  const keyMode = modeOf(keys);

  // While a side is hovered or dragged, follow Alt and Shift.
  const tracking = hover !== null || drag !== null;
  useEffect(() => {
    if (!tracking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Alt" && e.key !== "Shift") return;
      if (e.key === "Alt") e.preventDefault(); // e.g. Firefox on Windows shows its menu bar on Alt
      // The key that changed is down on keydown, up on keyup; the other one
      // comes from the event's modifier state.
      const down = e.type === "keydown";
      setKeys({
        altKey: e.key === "Alt" ? down : e.altKey,
        shiftKey: e.key === "Shift" ? down : e.shiftKey,
      });
    };
    const onBlur = () => setKeys({ altKey: false, shiftKey: false });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [tracking]);

  // The side being worked on, and which other sides come along.
  const active = drag?.side ?? hover;
  const mode: Mode = drag ? drag.mode : keyMode;
  const included = active ? companions(active, mode) : [];

  // Tell the designer about Alt at the moment it's useful: as soon as the
  // pointer is on a side's drag area, and while dragging. (Shift isn't
  // advertised, but the message still says what it does while held.) A layout
  // effect, so the footer changes in the same frame.
  useLayoutEffect(() => {
    if (!active) return onHint?.(null);
    const what = mode === "all" ? "all sides" : mode === "both" ? pairName(active) : null;
    if (what) onHint?.(drag ? `Changing ${what}` : `Drag to change ${what}`);
    else
      onHint?.(
        <>
          Hold <kbd>Alt</kbd> to change both sides
        </>,
      );
  }, [active, mode, drag !== null]);
  // Show the affected padding on the page itself while a side is hovered or
  // dragged (with Alt/Shift, every side that will change).
  useLayoutEffect(() => {
    onInspect?.(active ? [active, ...included].map((side) => ({ box: "padding", side })) : null);
  }, [active, mode]);

  useEffect(
    () => () => {
      onHint?.(null);
      onInspect?.(null);
    },
    [],
  );

  const focusSide = (index: number) => {
    const el = refs.current[index]?.current;
    if (!el) return;
    el.focus();
    selectContents(el);
  };

  const returnToSearch = () => {
    setLinked(null);
    setDraft(null);
    onReturnToSearch?.();
  };

  // Jumped in from the search: focus the side the query points at.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    const target = FOCUS_TARGETS[focusRequest.query] ?? { focus: "top" };
    setLinked(target.linked ?? null);
    focusSide(SIDES.findIndex((s) => s.side === target.focus));
  }, [focusRequest]);

  // Tab/Shift+Tab: next/previous side in CSS order; past either end, back to the search.
  const navigate = (index: number, direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0 || next >= SIDES.length) returnToSearch();
    else focusSide(next);
  };

  return (
    <div class="padding-editor">
      <div class="wrapper">
        {SIDES.map((s, i) => {
          const isLinked = linked?.includes(s.side) ?? false;
          return (
            <PaddingSide
              key={s.side}
              side={s}
              valueRef={refs.current[i] as { current: HTMLSpanElement | null }}
              linked={isLinked}
              // Mirroring is decided here, at render time, not when the draft is
              // reported: focusing a side and linking it happen together, so the
              // first reports can arrive before the link is in place.
              mirror={isLinked && draft && draft.from !== s.side && linked?.includes(draft.from) ? draft : undefined}
              onDraft={(d) => {
                if (d) setDraft({ from: s.side, ...d });
                else setDraft((current) => (current?.from === s.side ? null : current));
              }}
              value={toNumber(values[s.property])}
              onCompanion={(name, n, gesture) => {
                const property = `padding-${name}`;
                if (n === null) onRevert?.(property, gesture);
                else onChange(property, `${n}px`, { gesture });
              }}
              paired={included.includes(s.side)}
              mode={keyMode}
              onHover={(over, e) => {
                setHover((current) => (over ? s.side : current === s.side ? null : current));
                setKeys({ altKey: e.altKey, shiftKey: e.shiftKey });
              }}
              onDragState={(state) => setDrag(state ? { side: s.side, mode: state.mode } : null)}
              onChange={(n, gesture) => {
                // Linked sides change together, as one undo step (the edited side first).
                const others = isLinked && linked ? SIDES.filter((t) => t !== s && linked.includes(t.side)) : [];
                const targets = [s, ...others];
                const step = gesture ?? {};
                for (const t of targets) onChange(t.property, `${n}px`, { gesture: step });
              }}
              onFocus={() => {
                // Focusing a side outside the linked group ends the link.
                if (linked && !isLinked) {
                  setLinked(null);
                  setDraft(null);
                }
              }}
              onNavigate={(direction) => navigate(i, direction)}
              onSubmit={returnToSearch}
            />
          );
        })}
        <div class="label">padding</div>
      </div>
    </div>
  );
}

interface PaddingSideProps {
  side: Side;
  /** The editable number; owned by the editor so it can move focus between sides. */
  valueRef: { current: HTMLSpanElement | null };
  /** Part of a linked group (px/py/p): a typed value also applies to the other sides. */
  linked: boolean;
  /** Another linked side is being edited: show its text (and selection) instead of this side's value. */
  mirror?: Draft;
  /** Report what's being typed here (null when editing ends), for the linked sides to mirror. */
  onDraft(draft: Draft | null): void;
  /** Current padding in px. */
  value: number;
  /** Set another side along with the drag (Alt/Shift), in the same gesture; null takes it back. */
  onCompanion(side: SideName, value: number | null, gesture: object): void;
  /** Another side is hovered or dragged with Alt/Shift and includes this one: highlight it too. */
  paired: boolean;
  /** What Alt/Shift currently select (tracked by the editor while a side is hovered or dragged). */
  mode: Mode;
  /** The pointer is on this side's drag area (true), or left it / is on the number (false). */
  onHover(over: boolean, keys: { altKey: boolean; shiftKey: boolean }): void;
  /** A drag started (or its mode changed), or ended (null). */
  onDragState(state: { mode: Mode } | null): void;
  /** Apply a new padding in px (already clamped to ≥ 0); `gesture` groups a drag into one undo step. */
  onChange(value: number, gesture?: object): void;
  onFocus(): void;
  /** Tab (1) / Shift+Tab (-1). */
  onNavigate(direction: 1 | -1): void;
  /** Enter: the value is done, back to the search. */
  onSubmit(): void;
}

function PaddingSide({
  side,
  valueRef,
  linked,
  mirror,
  onDraft,
  value,
  onCompanion,
  paired,
  mode,
  onHover,
  onDragState,
  onChange,
  onFocus,
  onNavigate,
  onSubmit,
}: PaddingSideProps) {
  // The editable number's text is managed here, not rendered by Preact, so
  // re-renders never reset the caret while typing.
  const editing = useRef(false);
  // Enter commits right away; the blur that follows must not commit again.
  const skipBlurCommit = useRef(false);
  const [dragging, setDragging] = useState(false);
  // The current press: where it started, the values it started from, and how
  // far it has moved along the side's axis. Also the drag's undo gesture.
  const press = useRef<{
    x: number;
    y: number;
    start: number;
    delta: number;
    moved: boolean;
    mode: Mode;
    /** Other sides this drag has set so far (to take back if the mode changes). */
    companions: Set<SideName>;
  } | null>(null);

  const set = (n: number, gesture?: object) => onChange(Math.max(0, n), gesture);
  const text = () => valueRef.current?.textContent ?? "";
  const showValue = () => {
    if (valueRef.current) valueRef.current.textContent = format(value);
  };

  // Show the current value, including after an outside change (undo/redo,
  // arrow keys). While editing, keep it selected so typing replaces it.
  // A linked side shows the text typed in the side being edited, but only once
  // something has been typed: until then every side keeps its own value.
  const mirroredText = mirror?.typed ? mirror.text : null;
  useLayoutEffect(() => {
    const el = valueRef.current;
    if (!el) return;
    if (mirroredText !== null) {
      el.textContent = mirroredText;
      return;
    }
    showValue();
    if (editing.current) selectContents(el);
  }, [value, mirroredText]);

  // Whether the designer has typed in this side since focusing it. Focusing
  // (or stepping with the arrows, which applies right away) doesn't count.
  const typed = useRef(false);

  // While editing, report the text and whether it's all selected, so linked
  // sides can mirror both. `selectionchange` covers select-all, caret moves and
  // arrow-key steps; `input` (below) covers typing.
  const report = () => {
    const el = valueRef.current;
    if (el && editing.current) onDraft({ text: el.textContent ?? "", selected: isFullySelected(el), typed: typed.current });
  };
  useEffect(() => {
    document.addEventListener("selectionchange", report);
    return () => document.removeEventListener("selectionchange", report);
  });

  const commit = () => {
    const n = parseValue(text());
    // Unchanged values aren't re-applied, so they don't create empty undo steps.
    if (n !== null && n !== value) set(n);
    else showValue(); // invalid or unchanged: put the current value back
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // On the number itself it's a text field. The first click selects all of
    // it (so typing replaces the value); once it's being edited, clicks place
    // the caret natively.
    const number = valueRef.current;
    if (number && e.target === number) {
      if (!editing.current) {
        e.preventDefault();
        number.focus();
        selectContents(number);
      }
      return;
    }
    // Elsewhere on the side the press is ours: no focus or text selection
    // until we know whether it's a click (→ type) or a drag (→ scrub).
    e.preventDefault();
    press.current = {
      x: e.clientX,
      y: e.clientY,
      start: value,
      delta: 0,
      moved: false,
      mode: "one",
      companions: new Set(),
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // Apply the drag: this side follows the pointer; with Alt the opposite side
  // gets the same value, with Shift all sides do. Sides that drop out when the
  // key is released are reverted to exactly what they were. Everything uses
  // the press object as gesture: one undo step per drag.
  const applyDrag = (p: NonNullable<typeof press.current>, next: Mode) => {
    const n = Math.max(0, Math.round(p.start + p.delta));
    set(n, p);
    const targets = companions(side.side, next);
    for (const t of targets) {
      onCompanion(t, n, p);
      p.companions.add(t);
    }
    for (const t of [...p.companions]) {
      if (targets.includes(t)) continue;
      onCompanion(t, null, p);
      p.companions.delete(t);
    }
    if (next !== p.mode) {
      p.mode = next;
      onDragState({ mode: next });
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (!p) {
      // Just hovering: the drag area counts, the editable number doesn't.
      onHover(e.target !== valueRef.current, e);
      return;
    }
    p.delta = (side.axis === "x" ? e.clientX - p.x : e.clientY - p.y) * side.sign;
    if (!p.moved) {
      if (Math.abs(p.delta) < DRAG_THRESHOLD) return;
      p.moved = true;
      setDragging(true);
      p.mode = modeOf(e);
      onDragState({ mode: p.mode });
      valueRef.current?.blur();
    }
    applyDrag(p, modeOf(e));
  };

  // Alt/Shift pressed or released while dragging, without moving the pointer.
  useEffect(() => {
    const p = press.current;
    if (p?.moved && p.mode !== mode) applyDrag(p, mode);
  }, [mode]);

  const endPress = () => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.moved) {
      setDragging(false);
      onDragState(null);
    } else if (valueRef.current) {
      // A click: start typing, with the current value selected.
      valueRef.current.focus();
      selectContents(valueRef.current);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault(); // no line breaks
      commit();
      skipBlurCommit.current = true;
      onSubmit(); // focus moves to the search
      valueRef.current?.blur(); // no-op if it already moved; otherwise leave the field
    } else if (e.key === "Tab") {
      e.preventDefault();
      onNavigate(e.shiftKey ? -1 : 1); // commits on blur, like Enter
    } else if (e.key === "Escape") {
      // Discard what was typed; the dialog then returns focus to the search.
      typed.current = false;
      showValue();
      report();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
      const next = Math.max(0, (parseValue(text()) ?? value) + step);
      typed.current = false; // the step is applied right away, to all linked sides
      if (next !== value) set(next);
      else showValue();
    }
  };

  return (
    <div
      class="side"
      data-side={side.side}
      data-dragging={dragging || undefined}
      data-linked={linked || undefined}
      data-paired={paired || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerLeave={(e: PointerEvent) => {
        if (!press.current) onHover(false, e);
      }}
      onPointerCancel={() => {
        press.current = null;
        setDragging(false);
        onDragState(null);
      }}
    >
      {/* Highlights the whole side on hover. */}
      <span class="fill" aria-hidden="true" />
      <span
        ref={valueRef}
        class="value"
        contentEditable="plaintext-only"
        role="textbox"
        inputMode="decimal"
        spellcheck={false}
        aria-label={`Padding ${side.side}`}
        data-mirror-selected={mirror?.selected || undefined}
        onFocus={() => {
          editing.current = true;
          typed.current = false;
          onFocus();
          report();
        }}
        onInput={() => {
          typed.current = true;
          report();
        }}
        onBlur={() => {
          editing.current = false;
          onDraft(null);
          if (skipBlurCommit.current) skipBlurCommit.current = false;
          else commit();
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** "top and bottom" / "left and right", for the dragged side. */
function pairName(side: SideName): string {
  return side === "top" || side === "bottom" ? "top and bottom" : "left and right";
}

/** Text in the side being edited, whether all of it is selected, and whether it was typed (vs. just focused). */
interface Draft {
  text: string;
  selected: boolean;
  typed: boolean;
}

/** All of `el`'s (non-empty) text is selected. */
function isFullySelected(el: HTMLElement): boolean {
  const text = el.textContent ?? "";
  const selection = el.ownerDocument.getSelection();
  return text !== "" && !!selection && selection.toString() === text && el.contains(selection.anchorNode);
}

/** Select all the text inside `el` (works inside Pilot's Shadow DOM). */
function selectContents(el: HTMLElement) {
  const selection = el.ownerDocument.getSelection();
  if (!selection) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Computed padding ("12px") → 12. */
function toNumber(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** What the designer typed ("12", "12px", " 12.5 ") → px number ≥ 0, or null if it isn't one. */
export function parseValue(text: string): number | null {
  const match = text.trim().match(/^(-?\d*\.?\d+)\s*(px)?$/i);
  if (!match) return null;
  return Math.max(0, Number(match[1]));
}

function format(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export const paddingEditor: PropertyEditor = {
  id: "padding",
  label: "Padding",
  properties: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  aliases: ["p", "pt", "pr", "pb", "pl", "px", "py"],
  keywords: ["spacing", "inset", "inner space"],
  component: PaddingEditor,
};
