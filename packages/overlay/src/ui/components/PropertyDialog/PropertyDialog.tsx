import { isModifierQuery } from "../../../search/modifiers.ts";
import type { ElementState, WidthRange } from "@pilot/protocol";
import { type ComponentChildren, Fragment } from "preact";
import { declaredValues, forcedDeclarations, isFromReset } from "../../../dom/declared.ts";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { BoxArea } from "../../../dom/boxModel.ts";
import type { EditableElement } from "../../../dom/target.ts";
import { clearProperty } from "../../../edits/clear.ts";
import { clickWidth, partialWidth, takeWidths } from "../../../edits/widths.ts";
import { EditHistory } from "../../../edits/history.ts";
import { editors as allEditors, matchEditors } from "../../../editors/registry.ts";
import { groupOf, inListOrder } from "../../../editors/listOrder.ts";
import { type FocusRequest, type PropertyEditor, propertiesOf } from "../../../editors/types.ts";
import { px } from "../../px.ts";
import { Icon } from "../Icon/Icon.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";
import { PropertySearch } from "../PropertySearch/PropertySearch.tsx";

interface PropertyDialogProps {
  /** The selected element (the first one, when several are). */
  element: EditableElement;
  /**
   * The other selected elements (Shift+click, or the DOM tree), none for
   * one: every change goes to all of them, as one undo step, and a field
   * whose value differs across them reads "Mixed".
   */
  others?: readonly EditableElement[];
  /**
   * Its bounding box. The dialog picks its spot next to it when it opens
   * (dialogSpot); later changes of the box don't move it.
   */
  anchor: DOMRect;
  /**
   * The element the spot is picked beside, when it isn't `element`: with
   * several selected, the latest one (App). Picked again when it changes,
   * so the panel follows the last element added.
   */
  placeBy?: Element;
  /**
   * Out of sight for a moment (the redlines, Alt held: App), still there:
   * its search, its fields and its focus stay as they are.
   */
  veiled?: boolean;
  /** Editors to search. Defaults to the built-in registry (overridable for tests). */
  editors?: PropertyEditor[];
  /**
   * Starting search text: the previous selection's (App carries it over), or
   * the dev option's. Empty by default.
   */
  initialQuery?: string;
  /**
   * With nothing typed, list every editor, with a value or not (true), or
   * only those for the properties the element has a value for (false).
   * Defaults to LIST_ALL_EDITORS.
   */
  listAll?: boolean;
  /** The search text changed (App keeps it for the next selection). */
  onQueryChange?(query: string): void;
  /** Where changes are applied and recorded. App passes its shared one so undo spans selections. */
  history?: EditHistory;
  /** Close the dialog (deselect): Esc on an empty search. */
  onClose?(): void;
  /** The editor wants areas of the element shown on the page (null: back to the highlight). */
  onInspect?(areas: BoxArea[] | null): void;
  /**
   * The width chip: the viewport widths changes are for (null: every width).
   * App keeps it across selections, until it's removed.
   */
  widths?: WidthRange | null;
  /** The chip was typed in the search or removed. */
  onWidthsChange?(widths: WidthRange | null): void;
  /**
   * The state pills: the element states changes are for, together ([]: the
   * element as it is). App keeps them across selections, until removed.
   * While set, the element is shown in those states.
   */
  states?: ElementState[];
  /** The state pills were typed, picked or removed. */
  onStatesChange?(states: ElementState[]): void;
  /**
   * Focus the search when the dialog opens (default). False when the
   * selection came from the DOM tree, which keeps focus for its arrow keys.
   */
  autoFocus?: boolean;
  /** The window's width now (see ViewportWidth). */
  viewportWidth?: number;
  /**
   * The viewport width was clicked (a new object per click). The dialog sets
   * the chip, since a `from`/`to` being typed in the search decides it.
   */
  widthPick?: WidthPick;
}

/** A click on the viewport width. */
export interface WidthPick {
  width: number;
  shift: boolean;
}

const GAP = 8;

/**
 * The dialog next to the selected element. It starts with only the search
 * field; as the designer types, it adds the editors for the query below it:
 * the best matches plus their family (see matchEditors). Remounted for every
 * new selection, starting from the previous selection's query (selected, so
 * typing replaces it).
 *
 * Keyboard loop, Tailwind-fast: type a property (`pt`), Tab or Enter into its
 * editor, type a value, Enter: back in the search, ready for the next one.
 * Esc steps back one level: editor → search → clear search → close.
 */
export function PropertyDialog({
  element,
  others = [],
  anchor,
  placeBy,
  veiled = false,
  editors = allEditors,
  initialQuery = "",
  listAll = LIST_ALL_EDITORS,
  onQueryChange,
  history: sharedHistory,
  onClose,
  onInspect,
  widths = null,
  onWidthsChange,
  states = NO_STATES,
  onStatesChange,
  autoFocus = true,
  viewportWidth,
  widthPick,
}: PropertyDialogProps) {
  const [query, setQueryState] = useState(initialQuery);
  const [ownHistory] = useState(() => new EditHistory());
  const history = sharedHistory ?? ownHistory;
  // With state pills, the element is shown in those states (the pointer is
  // on the dialog, not on it): the page's own rules for them, and Pilot's.
  const stateKey = states.join(",");
  useEffect(() => {
    history.setForced(states.length ? { element, states, page: forcedDeclarations(element, states) } : null);
  }, [element, stateKey]);
  useEffect(() => () => history.setForced(null), []);
  // The editors shown for the query: the best matches, plus their family
  // (`w` → width, min-width, max-width). See matchEditors. With nothing
  // typed: the editors for every property the element has a value for. That
  // list is taken when the search becomes empty and kept while you edit, so
  // clearing a value doesn't make its row vanish under the cursor.
  const empty = !query.trim();
  const withValues = useMemo(
    () => (!empty ? [] : listAll ? listedEditors(editors) : editorsWithValues(element, editors, history)),
    [element, empty, listAll],
  );
  const matches = empty ? withValues : matchEditors(query, editors);
  const matchKey = matches.map((m) => m.id).join(",");

  const searchRef = useRef<HTMLInputElement>(null);
  // Which editor should take focus, and why. A new object each time so the
  // editor focuses again. Cleared on typing, so a newly matched editor never
  // grabs focus away from the search.
  const [focus, setFocus] = useState<{ index: number; request: FocusRequest } | null>(null);
  const setQuery = (q: string) => {
    setQueryState(q);
    setFocus(null);
    onQueryChange?.(q);
  };

  // A click on the viewport width sets the chip (clickWidth). With `from`,
  // `to-`… typed in the search, that word decides: `from` (or `to`) the
  // clicked width, as if `from-1108 ` had been typed, and the word goes.
  // The pick the dialog mounted with was handled already (by the previous one).
  const handledPick = useRef(widthPick);
  useEffect(() => {
    if (!widthPick || widthPick === handledPick.current) return;
    handledPick.current = widthPick;
    const typed = partialWidth(query);
    if (typed) {
      onWidthsChange?.(takeWidths(`${typed.end}-${widthPick.width} `, widths).range);
      setQuery("");
    } else onWidthsChange?.(clickWidth(widths, widthPick.width, widthPick.shift));
  }, [widthPick]);

  // Tab past an editor's last field (or Shift+Tab before its first): on to the
  // next/previous editor, or back to the search past either end.
  const tabOut = (index: number, direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0 || next >= matches.length) return returnToSearch();
    setFocus({ index: next, request: { query: query.trim().toLowerCase(), edge: direction === 1 ? "first" : "last" } });
  };

  // Where focus is, for the footer's hint: the search field or the editor.
  const [focusArea, setFocusArea] = useState<"search" | "editor">("search");
  // A message the editor puts in the footer for what's happening right now
  // (e.g. during a drag); it wins over the default hint.
  const [editorHint, setEditorHint] = useState<ComponentChildren | null>(null);
  useEffect(() => setEditorHint(null), [matchKey]);

  // Areas of the element each shown editor wants on the page (keyed by
  // editor id), combined: with several rows, one row's "nothing" must not wipe
  // another row's area, whatever order they report in.
  const [inspectBy, setInspectBy] = useState<Record<string, BoxArea[]>>({});
  const inspectFor = (id: string) => (areas: BoxArea[] | null) =>
    setInspectBy((current) => {
      if (!areas && !(id in current)) return current;
      const next = { ...current };
      if (areas) next[id] = areas;
      else delete next[id];
      return next;
    });
  const inspected = Object.values(inspectBy).flat();
  const inspectKey = inspected.map((a) => `${a.box}-${"side" in a ? a.side : ""}`).join(",");
  useLayoutEffect(() => {
    onInspect?.(inspected.length ? inspected : null);
  }, [inspectKey]);
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element | null;
    if (target === searchRef.current) setFocusArea("search");
    else if (target?.closest(".editor")) setFocusArea("editor");
  };

  const returnToSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  const onSearchKeyDown = (e: KeyboardEvent) => {
    const into = (e.key === "Tab" && !e.shiftKey) || e.key === "Enter";
    if (!into) return;
    e.preventDefault();
    if (matches.length) setFocus({ index: 0, request: { query: query.trim().toLowerCase() } });
  };

  // Esc, one level at a time. Editors may handle it first (e.g. to discard
  // typed text) but let it bubble here.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    if (e.target !== searchRef.current) returnToSearch();
    else if (query) setQuery("");
    else onClose?.();
  };

  // Size comes from CSS (width in PropertyDialog.css; height grows when an
  // editor appears). Measure it so the placement keeps it on screen. Runs
  // before paint, so the first frame is already placed correctly.
  const ref = useRef<HTMLDivElement>(null);
  // The scrolling list, for its scroll thumb.
  const listRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0;
    const height = ref.current?.offsetHeight ?? 0;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  });
  const { width, height } = size;

  // Where the dialog sits (see dialogSpot): picked once, when it opens beside
  // the element, then fixed to the page. Editing the element (growing,
  // shrinking, moving) never moves it; scrolling moves it with the page; it
  // only shifts to stay on screen. A window resize picks the spot again.
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null);
  // Picked at the first layout (before paint, so the first frame is already in
  // place), with the dialog's real width and the element's box measured right
  // then: after a window resize, the `anchor` prop can still be the old layout's.
  const beside = placeBy ?? element;
  const placedBeside = useRef(beside);
  useLayoutEffect(() => {
    if (placedBeside.current !== beside) {
      placedBeside.current = beside;
      if (spot) return setSpot(null);
    }
    if (spot || !ref.current) return;
    const box = beside.isConnected ? beside.getBoundingClientRect() : anchor;
    setSpot(dialogSpot(box, ref.current.offsetWidth, vw, scroll));
  });
  useEffect(() => {
    const repick = () => setSpot(null);
    window.addEventListener("resize", repick);
    return () => window.removeEventListener("resize", repick);
  }, []);
  const { left, top } = dialogPosition(spot ?? dialogSpot(anchor, width, vw, scroll), { width, height }, { width: vw, height: vh }, scroll);
  // When growing pushed it up (the list got taller than the room below),
  // the spot moves up with it: shrinking afterwards (the / menu, a shorter
  // list) keeps its top where it is instead of dropping back down.
  useLayoutEffect(() => {
    if (!spot) return;
    const raised = raisedSpot(spot, { width, height }, { width: vw, height: vh }, scroll);
    if (raised !== spot) setSpot(raised);
  }, [height]);

  // Dragging the strip along the top edge moves the dialog where the designer
  // wants it: the spot follows the pointer (in page coordinates, so it still
  // moves with scrolling), kept on screen like any spot. It lasts for this
  // selection; selecting another element (or resizing the window) picks a
  // spot beside it again. Focus stays where it was (the search).
  const drag = useRef<{ x: number; y: number; from: { left: number; top: number } } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onDragStart = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, from: { left: left + scroll.x, top: top + scroll.y } };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
  };
  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const moved = { left: d.from.left + e.clientX - d.x, top: d.from.top + e.clientY - d.y };
    // Kept on screen: store where it's actually drawn, so the next drag starts there.
    const shown = dialogPosition(moved, { width, height }, { width: vw, height: vh }, scroll);
    setSpot({ left: shown.left + scroll.x, top: shown.top + scroll.y });
  };
  const onDragEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={ref}
      class="property-dialog surface"
      style={{ left: px(left), top: px(top) }}
      role="dialog"
      aria-label="Edit properties"
      data-dragging={dragging || undefined}
      data-veiled={veiled || undefined}
      onKeyDown={onKeyDown}
      onFocusIn={onFocusIn}
    >
      {/* The drag strip: 12px along the top edge, over the search (it adds no
          height), with the grip as the visual clue. */}
      <div
        class="drag-handle"
        aria-hidden="true"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <Icon name="grip" />
      </div>
      <PropertySearch
        value={query}
        onChange={setQuery}
        onKeyDown={onSearchKeyDown}
        inputRef={searchRef}
        widths={widths}
        onWidthsChange={onWidthsChange}
        states={states}
        onStatesChange={onStatesChange}
        viewportWidth={viewportWidth}
        autoFocus={autoFocus}
      />
      {matches.length > 0 && (
        // Wrapper for the property editors shown below the search. Only
        // rendered when something matches, so the empty dialog is just the search.
        <>
          {/* The list scrolls inside the frame; the frame draws the line under the
              search and the fades at the list's top and bottom edges. */}
          <div class="properties-frame">
            <div class="properties" ref={listRef}>
              {/* Editors own everything inside `.editor` (see the @scope boundary in the CSS). */}
              {matches.map((match, index) => {
                // With nothing typed, the list is grouped (LIST_ORDER): each group
                // starts with its label, after a dotted line between groups.
                // Searching shows the matches alone, without labels.
                const group = empty ? groupOf(match.id) : undefined;
                const previous = matches[index - 1];
                const startsGroup = !!group && (!previous || groupOf(previous.id) !== group);
                return (
                  <Fragment key={match.id}>
                    {startsGroup && previous && <div class="group-divider" aria-hidden="true" />}
                    {startsGroup && <div class="group-label">{group}</div>}
                    <div class="editor" data-editor={match.id}>
                      <MatchedEditor
                        editor={match}
                        element={element}
                        others={others}
                        history={history}
                        widths={widths ?? undefined}
                        states={states}
                        query={query}
                        focusRequest={focus?.index === index ? focus.request : undefined}
                        onReturnToSearch={returnToSearch}
                        onTabOut={(direction) => tabOut(index, direction)}
                        onHint={setEditorHint}
                        onInspect={inspectFor(match.id)}
                      />
                    </div>
                  </Fragment>
                );
              })}
            </div>
            <div class="fade" data-edge="top" aria-hidden="true" />
            <div class="fade" data-edge="bottom" aria-hidden="true" />
            <ScrollThumb target={listRef} />
          </div>
          <footer class="footer" data-area={editorHint ? "editor-hint" : focusArea} aria-live="polite">
            {editorHint ?? <Hint area={focusArea} />}
          </footer>
        </>
      )}
      {/* Something typed that no property matches (not the `/` modifiers, which have their own menu): say so, rather than nothing. */}
      {!empty && !matches.length && !isModifierQuery(query) && (
        <div class="properties-frame">
          <p class="no-match" role="status">
            No property matches “{query.trim()}”
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * With nothing typed, the dialog lists only the properties the element has
 * a value for (editorsWithValues). True lists every editor, with a value or
 * not, side by side: handy while many editors are added and designed together.
 */
export const LIST_ALL_EDITORS = false;

const NO_STATES: ElementState[] = [];

/**
 * Every editor that can be listed (it writes properties), in LIST_ORDER. One
 * another editor shows as its rows (display's grid and flex rows) is left to
 * that one, as in editorsWithValues.
 */
function listedEditors(editors: PropertyEditor[]): PropertyEditor[] {
  // Only rows of editors that are listed themselves count: size shows width
  // and height as rows, but isn't listed (it writes nothing of its own).
  const listable = editors.filter((e) => e.properties.length > 0);
  const embedded = new Set(listable.flatMap((e) => e.embeds ?? []));
  return inListOrder(listable.filter((e) => !embedded.has(e)));
}

/**
 * The dialog's spot beside the element, in page coordinates (viewport +
 * scroll), picked when it opens: the element's right side, else its left;
 * for an element too wide for either, overlapping its right edge. Level
 * with the element's top.
 */
export function dialogSpot(
  anchor: { left: number; right: number; top: number },
  width: number,
  viewportWidth: number,
  scroll: { x: number; y: number },
): { left: number; top: number } {
  const left =
    anchor.right + GAP + width <= viewportWidth
      ? anchor.right + GAP
      : anchor.left - GAP - width >= 0
        ? anchor.left - GAP - width
        : viewportWidth - GAP - width;
  return { left: left + scroll.x, top: anchor.top + scroll.y };
}

/**
 * Where the dialog is drawn (viewport px) from its spot: moved with the
 * page's scroll, and kept on screen, 8px from the edges (when scrolling would
 * take it off, or when it grows taller than the room below). Whole pixels: a
 * fractional position antialiases the dialog's 1px edges and clipped shapes
 * differently, so they visibly drift apart at the corners.
 */
export function dialogPosition(
  spot: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  scroll: { x: number; y: number },
): { left: number; top: number } {
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(GAP, v), Math.max(GAP, max)));
  return {
    left: clamp(spot.left - scroll.x, viewport.width - GAP - size.width),
    top: clamp(spot.top - scroll.y, viewport.height - GAP - size.height),
  };
}

/**
 * The spot moved up to where the dialog is drawn, when its height (not the
 * scroll) pushed it above the spot to stay on screen; the same spot otherwise.
 * Scrolling still only shifts the drawn dialog: a spot pushed up by a
 * scroll would stay up after scrolling back.
 */
export function raisedSpot(
  spot: { left: number; top: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  scroll: { x: number; y: number },
): { left: number; top: number } {
  const top = viewport.height - GAP - size.height + scroll.y;
  return top < spot.top ? { left: spot.left, top: Math.max(top, GAP + scroll.y) } : spot;
}

/**
 * The editors for the properties `element` has a value for (from any source:
 * stylesheets, classes, inline styles, Pilot's edits; removed ones don't
 * count), in LIST_ORDER (editors/listOrder.ts). An editor another one shows as its rows (gap
 * under display: grid) is left to that one. A page value that only a reset
 * gives (a `*` rule: box-sizing, margin: 0 on every element, isFromReset)
 * doesn't count; Pilot's own edits always do. Searching still finds them.
 */
function editorsWithValues(element: EditableElement, editors: PropertyEditor[], history: EditHistory): PropertyEditor[] {
  const properties = [...new Set(editors.flatMap((e) => e.properties))];
  const page = declaredValues(element, properties);
  const width = window.innerWidth;
  const isSet = (p: string) => {
    if (history.removalOf(element, p, width)) return false;
    if (history.valueOf(element, p, width) !== null) return true;
    const declared = page[p];
    return !!declared?.value && !isFromReset(declared);
  };
  const shown = editors.filter((e) => e.properties.some(isSet));
  const embedded = new Set(shown.flatMap((e) => e.embeds ?? []));
  return inListOrder(shown.filter((e) => !embedded.has(e)));
}

/**
 * What each field shows: Pilot's value at the window's width (from the
 * history, see EditHistory.valueOf), else the page's own declared value,
 * else "". A removed property shows nothing: the element doesn't set it (the
 * page shows what applies without it). See clearProperty.
 */
function fieldValues(
  element: EditableElement,
  properties: string[],
  history: EditHistory,
  states?: readonly ElementState[],
): Record<string, string> {
  // With state pills: the values for exactly those states (Pilot's, else the
  // page's rules for them); empty when nothing sets one for them.
  const page = declaredValues(element, properties, states);
  const width = window.innerWidth;
  return Object.fromEntries(
    properties.map((p) => [
      p,
      history.removalOf(element, p, width, states) ? "" : (history.valueOf(element, p, width, states) ?? page[p]?.value ?? ""),
    ]),
  );
}

/**
 * The footer's helper message: the keys that matter for what the designer is
 * doing. Property-agnostic on purpose: every property panel follows the same
 * keyboard pattern, so the copy never names a property.
 */
function Hint({ area }: { area: "search" | "editor" }) {
  if (area === "editor") {
    return (
      <>
        <kbd>Enter</kbd> to apply, <kbd>Esc</kbd> to go back
      </>
    );
  }
  return (
    <>
      <kbd>Tab</kbd> or <kbd>Enter</kbd> to edit
    </>
  );
}

/**
 * Feeds an editor the element's current values and routes its changes through
 * the edit history (which shows them on the page and makes them undoable).
 */
function MatchedEditor({
  editor,
  element,
  others = [],
  history,
  widths,
  states,
  query,
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onHint,
  onInspect,
}: {
  editor: PropertyEditor;
  element: EditableElement;
  others?: readonly EditableElement[];
  history: EditHistory;
  widths?: WidthRange;
  states?: ElementState[];
  query?: string;
  focusRequest?: FocusRequest;
  onReturnToSearch(): void;
  onTabOut(direction: 1 | -1): void;
  onHint(hint: ComponentChildren | null): void;
  onInspect?(areas: BoxArea[] | null): void;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const computed = getComputedStyle(element);
  const properties = propertiesOf(editor);
  const values = Object.fromEntries(properties.map((p) => [p, computed.getPropertyValue(p)]));
  const all = [element, ...others];
  const declared = fieldValues(element, properties, history, states);
  // Several selected: a property whose value differs across them is "Mixed" (an empty field).
  const mixed = new Set<string>();
  for (const other of others) {
    const theirs = fieldValues(other, properties, history, states);
    for (const p of properties) if (theirs[p] !== declared[p]) mixed.add(p);
  }
  for (const p of mixed) declared[p] = "";
  const Editor = editor.component;
  return (
    <Editor
      element={element}
      values={values}
      declared={declared}
      mixed={mixed}
      onChange={(property, value, options) => {
        // Every selected element, with one gesture: one undo step for all of them.
        const gesture = options?.gesture ?? (others.length ? {} : undefined);
        for (const el of all) {
          // Cleared: the element doesn't set it (a removal, when the page's CSS does).
          // Recorded for the chip's widths (none: every width) and the state pills (none: as it is).
          if (value === "") clearProperty(history, el, property, gesture, widths, states);
          else history.apply(el, property, value, gesture, { widths, states });
        }
        rerender(0);
      }}
      onRevert={(property, gesture) => {
        for (const el of all) history.revert(el, property, gesture);
        rerender(0);
      }}
      query={query}
      focusRequest={focusRequest}
      onReturnToSearch={onReturnToSearch}
      onTabOut={onTabOut}
      onHint={onHint}
      onInspect={onInspect}
    />
  );
}
