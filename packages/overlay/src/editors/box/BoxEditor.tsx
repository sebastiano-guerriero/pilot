import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cssProperty } from "../../css/properties.ts";
import { displayValue, parseValue, stepValue } from "../../css/values.ts";
import type { SideArea } from "../../dom/boxModel.ts";
import type { EditableElement } from "../../dom/target.ts";
import { type InputDraft, PropertyInputText } from "../../ui/components/PropertyInputText/PropertyInputText.tsx";
import { PropertyLabel } from "../../ui/components/PropertyLabel/PropertyLabel.tsx";
import { normalizeQuery } from "../query.ts";
import { declaredOf } from "../declared.ts";
import type { PropertyEditor, PropertyEditorProps } from "../types.ts";

export type SideName = "top" | "right" | "bottom" | "left";

/**
 * The four sides, as trapezoids between the center and the wrapper's edges.
 * `axis`/`sign` map a drag to a value: dragging *outward* (away from the
 * center) increases it, e.g. up for top, left for left.
 */
const SIDES = [
  { side: "top", axis: "y", sign: -1 },
  { side: "right", axis: "x", sign: 1 },
  { side: "bottom", axis: "y", sign: 1 },
  { side: "left", axis: "x", sign: -1 },
] as const satisfies ReadonlyArray<{ side: SideName; axis: "x" | "y"; sign: 1 | -1 }>;

type Side = (typeof SIDES)[number];
const ALL: SideName[] = ["top", "right", "bottom", "left"];

/** What a box editor edits (padding, margin, border width…). */
export interface BoxConfig {
  /** Editor id, e.g. "padding". */
  id: string;
  /** Search label, e.g. "Padding". */
  label: string;
  /** The row's label, e.g. "padding". */
  title: string;
  /** The box-model area to show on the page while a side is hovered/dragged. */
  box: SideArea["box"];
  /** The CSS property for a side: `padding-top`, `border-top-width`… */
  property(side: SideName): string;
  /** Tailwind-style aliases: one for all sides, one per side, one per axis. */
  aliases: { all: string; top: string; right: string; bottom: string; left: string; x: string; y: string };
  keywords?: string[];
  /**
   * A property that must be set for this one to show. Border widths do
   * nothing while the side's border-style is `none`: setting a width on such a
   * side also sets the style (same undo step), and clearing that width removes
   * the style again if Pilot added it.
   */
  requires?: { property(side: SideName): string; missing: string; value: string };
}

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
  if (mode === "all") return ALL.filter((s) => s !== side);
  if (mode === "both") return [OPPOSITE[side]];
  return [];
}

/** Pointer travel (px) before a press on a side becomes a drag instead of a click. */
const DRAG_THRESHOLD = 3;

/** Sides whose `requires` property (border-style) Pilot set, per element: removed again on reset. */
const addedRequirements = new WeakMap<EditableElement, Set<string>>();

/**
 * What the designer typed in the search → which side to focus, and which sides
 * a typed value applies to. Tailwind semantics: `px` sets left and right, `py`
 * top and bottom, `p` all four; `pt`… or `padding-top`… focus that side.
 * Anything else (`padding`, `pad`…) focuses top, one side at a time.
 */
function focusTarget(config: BoxConfig, query: string): { focus: SideName; linked?: SideName[] } {
  const q = normalizeQuery(query);
  const { aliases } = config;
  if (q === normalizeQuery(aliases.all)) return { focus: "top", linked: ALL };
  if (q === normalizeQuery(aliases.x)) return { focus: "left", linked: ["left", "right"] };
  if (q === normalizeQuery(aliases.y)) return { focus: "top", linked: ["top", "bottom"] };
  for (const side of ALL) {
    if (q === normalizeQuery(aliases[side]) || q === normalizeQuery(config.property(side))) return { focus: side };
  }
  return { focus: "top" };
}

/**
 * A box-model diagram with one value per side (padding, margin, border
 * width). Each side can be typed into (click it, type, Enter), stepped with
 * ↑/↓, or scrubbed by dragging over its area (Alt: opposite side too, Shift:
 * all sides). The values are PropertyInputText fields, so they accept what
 * every Pilot field accepts (`12` as px, units, keywords, math).
 */
export function BoxEditor({
  config,
  element,
  values,
  declared,
  onChange,
  onRevert,
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onHint,
  onInspect,
}: PropertyEditorProps & { config: BoxConfig }) {
  // The value field of each side, in SIDES order, so focus can move between them.
  const refs = useRef(SIDES.map(() => ({ current: null as HTMLInputElement | null })));
  // Sides a typed value currently applies to together (set by px/py/p).
  const [linked, setLinked] = useState<SideName[] | null>(null);
  // What's being typed in a linked side, mirrored on the other linked sides.
  const [draft, setDraft] = useState<({ from: SideName } & InputDraft) | null>(null);

  // The side being dragged, and which other sides the drag also changes.
  const [drag, setDrag] = useState<{ side: SideName; mode: Mode } | null>(null);
  // The side whose drag area (not its value) is under the pointer, and the
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
  // Show the affected area on the page itself while a side is hovered or
  // dragged (with Alt/Shift, every side that will change).
  useLayoutEffect(() => {
    onInspect?.(active ? [active, ...included].map((side) => ({ box: config.box, side })) : null);
  }, [active, mode]);

  useEffect(
    () => () => {
      onHint?.(null);
      onInspect?.(null);
    },
    [],
  );

  /**
   * Set `value` on `sides`, all in one undo step. An empty value removes the
   * inline value (reset). Takes care of `requires` (border-style).
   */
  const apply = (sides: SideName[], value: string, gesture?: object) => {
    const step = gesture ?? {};
    for (const side of sides) {
      onChange(config.property(side), value, { gesture: step });
      const req = config.requires;
      if (!req) continue;
      const reqProperty = req.property(side);
      const added = addedRequirements.get(element) ?? new Set<string>();
      const current = getComputedStyle(element).getPropertyValue(reqProperty);
      if (value && (!current || current === req.missing)) {
        onChange(reqProperty, req.value, { gesture: step });
        added.add(reqProperty);
        addedRequirements.set(element, added);
      } else if (!value && added.has(reqProperty)) {
        onChange(reqProperty, "", { gesture: step });
        added.delete(reqProperty);
      }
    }
  };

  const focusSide = (index: number) => {
    const el = refs.current[index]?.current;
    if (!el) return;
    el.focus();
    el.select();
  };

  const returnToSearch = () => {
    setLinked(null);
    setDraft(null);
    onReturnToSearch?.();
  };

  // Jumped in from the search: focus the side the query points at. Tabbed in
  // from another editor: start at the first (or, going back, the last) side.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.edge) {
      setLinked(null);
      focusSide(focusRequest.edge === "first" ? 0 : SIDES.length - 1);
      return;
    }
    const target = focusTarget(config, focusRequest.query);
    setLinked(target.linked ?? null);
    focusSide(SIDES.findIndex((s) => s.side === target.focus));
  }, [focusRequest]);

  // Tab/Shift+Tab: next/previous side in CSS order. Past either end: on to the
  // next/previous editor in the dialog (or the search, when this is the only one).
  const navigate = (index: number, direction: 1 | -1) => {
    const next = index + direction;
    if (next >= 0 && next < SIDES.length) return focusSide(next);
    if (!onTabOut) return returnToSearch();
    setLinked(null);
    setDraft(null);
    onTabOut(direction);
  };

  // A link (px/py/p) only lasts while focus stays in this editor: leaving it
  // any way (Esc, Enter, a click elsewhere, tabbing out) ends it, so a later
  // click on one side edits just that side. Moving between sides keeps it.
  const root = useRef<HTMLDivElement>(null);
  const onFocusOut = (e: FocusEvent) => {
    if (root.current?.contains(e.relatedTarget as Node | null)) return;
    setLinked(null);
    setDraft(null);
  };

  return (
    <div class="box-editor" data-box={config.box} ref={root} onFocusOut={onFocusOut}>
      <PropertyLabel>{config.title}</PropertyLabel>
      <div class="wrapper">
        {SIDES.map((s, i) => {
          const property = config.property(s.side);
          const isLinked = linked?.includes(s.side) ?? false;
          // The sides a typed value goes to: this one, plus its linked group.
          const targets = isLinked && linked ? [s.side, ...linked.filter((t) => t !== s.side)] : [s.side];
          const computed = values[property];
          // The declared value (from any source), or "" (the field shows the
          // dimmed dash). Computed values are never shown; they're only where
          // steps and drags start from.
          const set = declaredOf({ element, declared }, property);
          const shown = set ? compactPx(displayValue(set)) : "";
          return (
            <BoxSide
              key={s.side}
              side={s}
              property={property}
              inputRef={refs.current[i] as { current: HTMLInputElement | null }}
              shown={shown}
              start={toNumber(computed)}
              negative={cssProperty(property).negative}
              linked={isLinked}
              // Mirroring is decided here, at render time, not when the draft is
              // reported: focusing a side and linking it happen together, so the
              // first reports can arrive before the link is in place.
              mirror={isLinked && draft && draft.from !== s.side && linked?.includes(draft.from) ? draft : undefined}
              onDraft={(d) => {
                if (d) setDraft({ from: s.side, ...d });
                else setDraft((current) => (current?.from === s.side ? null : current));
              }}
              onCommitText={(text) => {
                if (!text.trim()) return apply(targets, "");
                const next = parseValue(property, text);
                if (next) apply(targets, next);
              }}
              onStepText={(delta, text) => {
                const next = stepValue(property, text, delta, computed);
                if (next) apply(targets, next);
              }}
              onDrag={(n, gesture) => apply(targets, `${n}px`, gesture)}
              onCompanion={(name, n, gesture) => {
                if (n !== null) return apply([name], `${n}px`, gesture);
                // Dropped out of the drag (Alt/Shift released): take back what
                // the drag did to that side, including a style it added.
                onRevert?.(config.property(name), gesture);
                const req = config.requires;
                if (req) {
                  onRevert?.(req.property(name), gesture);
                  addedRequirements.get(element)?.delete(req.property(name));
                }
              }}
              paired={included.includes(s.side)}
              mode={keyMode}
              onHover={(over, e) => {
                setHover((current) => (over ? s.side : current === s.side ? null : current));
                setKeys({ altKey: e.altKey, shiftKey: e.shiftKey });
              }}
              onDragState={(state) => setDrag(state ? { side: s.side, mode: state.mode } : null)}
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
        {/* The element itself, in the middle of the diagram. */}
        <div class="center" aria-hidden="true" />
      </div>
    </div>
  );
}

interface BoxSideProps {
  side: Side;
  property: string;
  /** The value field; owned by the editor so it can move focus between sides. */
  inputRef: { current: HTMLInputElement | null };
  /** The side's value, as shown ("12", "1rem"), or "" when none is set. */
  shown: string;
  /** The computed value in px: where a drag starts from. */
  start: number;
  /** Negative values are valid (margins), so drags may go below 0. */
  negative: boolean;
  /** Part of a linked group (px/py/p): a typed value also applies to the other sides. */
  linked: boolean;
  /** Another linked side is being edited: mirror it. */
  mirror?: InputDraft;
  onDraft(draft: InputDraft | null): void;
  /** The designer confirmed typed text ("" = cleared: reset). */
  onCommitText(text: string): void;
  /** ↑/↓ with the field's current text. */
  onStepText(delta: number, text: string): void;
  /** A drag set this side to `px`; `gesture` groups the drag into one undo step. */
  onDrag(px: number, gesture: object): void;
  /** Set another side along with the drag (Alt/Shift), in the same gesture; null takes it back. */
  onCompanion(side: SideName, px: number | null, gesture: object): void;
  /** Another side is hovered or dragged with Alt/Shift and includes this one: highlight it too. */
  paired: boolean;
  /** What Alt/Shift currently select (tracked by the editor while a side is hovered or dragged). */
  mode: Mode;
  /** The pointer is on this side's drag area (true), or left it / is on the value (false). */
  onHover(over: boolean, keys: { altKey: boolean; shiftKey: boolean }): void;
  /** A drag started (or its mode changed), or ended (null). */
  onDragState(state: { mode: Mode } | null): void;
  onFocus(): void;
  /** Tab (1) / Shift+Tab (-1). */
  onNavigate(direction: 1 | -1): void;
  /** Enter: the value is done, back to the search. */
  onSubmit(): void;
}

function BoxSide({
  side,
  property,
  inputRef,
  shown,
  start,
  negative,
  linked,
  mirror,
  onDraft,
  onCommitText,
  onStepText,
  onDrag,
  onCompanion,
  paired,
  mode,
  onHover,
  onDragState,
  onFocus,
  onNavigate,
  onSubmit,
}: BoxSideProps) {
  const [dragging, setDragging] = useState(false);
  // The current press: where it started, the value it started from, and how
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

  const clamp = (n: number) => (negative ? n : Math.max(0, n));

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    // On the value itself it's a text field (it handles its own clicks).
    if (e.target === inputRef.current) return;
    // Elsewhere on the side the press is ours: no focus or text selection
    // until we know whether it's a click (→ type) or a drag (→ scrub).
    e.preventDefault();
    press.current = { x: e.clientX, y: e.clientY, start, delta: 0, moved: false, mode: "one", companions: new Set() };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // Apply the drag: this side follows the pointer; with Alt the opposite side
  // gets the same value, with Shift all sides do. Sides that drop out when the
  // key is released are reverted to exactly what they were. Everything uses
  // the press object as gesture: one undo step per drag.
  const applyDrag = (p: NonNullable<typeof press.current>, next: Mode) => {
    const n = clamp(Math.round(p.start + p.delta));
    onDrag(n, p);
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
      // Just hovering: the drag area counts, the value field doesn't.
      onHover(e.target !== inputRef.current, e);
      return;
    }
    p.delta = (side.axis === "x" ? e.clientX - p.x : e.clientY - p.y) * side.sign;
    if (!p.moved) {
      if (Math.abs(p.delta) < DRAG_THRESHOLD) return;
      p.moved = true;
      setDragging(true);
      p.mode = modeOf(e);
      onDragState({ mode: p.mode });
      inputRef.current?.blur();
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
    } else {
      // A click: start typing, with the current value selected.
      inputRef.current?.focus();
      inputRef.current?.select();
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
      {/* Positions the value field in the middle of the side's band. */}
      <span class="slot">
        <PropertyInputText
          compact
          value={shown}
          label={property}
          inputRef={inputRef}
          mirror={mirror}
          onDraft={onDraft}
          onFocus={onFocus}
          onCommit={onCommitText}
          onStep={onStepText}
          onSubmit={onSubmit}
          onTab={onNavigate}
        />
      </span>
    </div>
  );
}

/** "top and bottom" / "left and right", for the dragged side. */
function pairName(side: SideName): string {
  return side === "top" || side === "bottom" ? "top and bottom" : "left and right";
}

/** Computed value ("12px") → 12 (0 when not a number). */
function toNumber(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/** In the compact diagram px is implied: "12px" → "12". Other units stay. */
export function compactPx(value: string): string {
  return /^-?\d*\.?\d+px$/.test(value) ? value.slice(0, -2) : value;
}

/** Define a box editor (padding, margin, border width…) from its config. */
export function boxEditor(config: BoxConfig): PropertyEditor {
  const { aliases } = config;
  return {
    id: config.id,
    label: config.label,
    properties: ALL.map(config.property),
    aliases: [aliases.all, aliases.top, aliases.right, aliases.bottom, aliases.left, aliases.x, aliases.y],
    keywords: config.keywords,
    component: (props: PropertyEditorProps) => <BoxEditor {...props} config={config} />,
  };
}
