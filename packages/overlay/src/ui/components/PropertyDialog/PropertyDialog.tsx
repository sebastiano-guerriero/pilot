import { isModifierQuery } from "../../../search/modifiers.ts";
import type { ElementState, WidthRange } from "@pilot/protocol";
import { Component, type ComponentChildren, Fragment } from "preact";
import { type Declared, isFromReset } from "../../../dom/declared.ts";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "preact/hooks";
import type { BoxArea } from "../../../dom/boxModel.ts";
import type { EditableElement } from "../../../dom/target.ts";
import { type Span, type WidthKey, applyChange, hasWidthRules, keyFor, pageValueAt, spansOf } from "../../../edits/reach.ts";
import { type WidthChip, clickWidth, partialWidth, sameChip, takeWidths } from "../../../edits/widths.ts";
import { EditHistory, type RecordedChange, longhandsOf } from "../../../edits/history.ts";
import { editors as allEditors, matchEditors } from "../../../editors/registry.ts";
import { groupOf, inListOrder, rowsOf } from "../../../editors/listOrder.ts";
import { type FocusRequest, type PropertyEditor, propertiesOf } from "../../../editors/types.ts";
import type { PlacedRect } from "../../../select/useElementRect.ts";
import { px } from "../../px.ts";
import { useWindowScroll } from "../../useWindowScroll.ts";
import { Icon } from "../Icon/Icon.tsx";
import { PageAnchor } from "../PageAnchor/PageAnchor.tsx";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";
import { ContextMenu } from "../ContextMenu/ContextMenu.tsx";
import { copiedProperties, copyProperties, cssText, rowEntries } from "../../propertyClipboard.ts";
import { copyText } from "../../../edits/changeSet.ts";
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
  anchor: PlacedRect;
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
   * The editor whose change is being looked at (by id): its drag handle is
   * being dragged, or it changed the value in the last CHANGE_SHOWN_MS (↑/↓,
   * the wheel, Enter, a pick). null when none is. The focus alone isn't it.
   */
  onEditing?(id: string | null): void;
  /**
   * Where the property in use has values among the widths (edits/reach.ts),
   * while it's in use (its field focused, dragged or just changed) and has
   * rules for some widths: App draws them under the ruler. null otherwise.
   */
  onReach?(reach: Reach | null): void;
  /**
   * The width chip: the viewport widths changes are for (null: the rule
   * that applies at the window's width, edits/reach.ts). App keeps it across
   * selections, until it's removed.
   */
  widths?: WidthChip | null;
  /** The chip was typed in the search or removed. */
  onWidthsChange?(widths: WidthChip | null): void;
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

/** Where the property in use has values among the widths, for the ruler (ViewportWidth). */
export interface Reach {
  property: string;
  spans: Span[];
  /** Where its edits go: the spans with this key are the ones they reach (all of them for All widths). */
  target: WidthKey | "all";
}

/** A click on the viewport width. */
export interface WidthPick {
  width: number;
  shift: boolean;
}

const GAP = 8;
/** How long a change (↑/↓, Enter, a pick) is looked at with the page's highlights hidden, when its editor clears the view (clearsView()), in ms. */
export const CHANGE_SHOWN_MS = 1000;

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
  onEditing,
  onReach,
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
  // The window's width: with no chip, where each property's edits go (the rule that applies there).
  const windowWidth = viewportWidth ?? window.innerWidth;
  // State pills only say where edits go: the element isn't shown in those states (the owner's call,
  // 2026-11-26: forcing them over the page hid how its other states behave). Hide Pilot (Option+P) and hover.
  const stateKey = states.join(",");
  // The editors shown for the query: the best matches, plus their family
  // (`w` → width, min-width, max-width). See matchEditors. With nothing
  // typed: the editors for every property the element has a value for. That
  // list is taken when the search becomes empty and kept while you edit, so
  // clearing a value doesn't make its row vanish under the cursor.
  const empty = !query.trim();
  // Listing every editor: what the revealing ones (display, position) show as rows depends on their value, so the list follows it.
  const revealing = listAll ? revealingValues(element, editors, history) : "";
  const withValues = useMemo(
    () => (!empty ? [] : listAll ? listedEditors(element, editors, history) : editorsWithValues(element, editors, history, states, widths, windowWidth)),
    [element, empty, listAll, revealing, stateKey, JSON.stringify(widths)],
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
  // The editor whose change is being looked at: what's being dragged (its
  // drag handle), else what just changed a value, for a moment.
  const [draggedEditor, setDraggedEditor] = useState<string | null>(null);
  const [changedEditor, setChangedEditor] = useState<string | null>(null);
  const scrubbing = useRef(false);
  // The row changing a value right now (a drag, a scrub, held arrows): the other rows skip their render then (EditorRow).
  const live = useRef<{ id: string; at: number } | null>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editing = draggedEditor ?? changedEditor;
  useEffect(() => onEditing?.(editing), [editing]);
  useEffect(
    () => () => {
      clearTimeout(changeTimer.current);
      onEditing?.(null);
    },
    [],
  );
  const changedBy = (id: string) => {
    // A drag's changes are looked at for as long as it lasts (onPointerDown).
    if (scrubbing.current) return;
    clearTimeout(changeTimer.current);
    setChangedEditor(id);
    changeTimer.current = setTimeout(() => setChangedEditor(null), CHANGE_SHOWN_MS);
  };
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    const id = target?.closest(".scrub-handle") ? (target.closest<HTMLElement>(".editor[data-editor]")?.dataset.editor ?? null) : null;
    if (!id || e.button !== 0) return;
    scrubbing.current = true;
    clearTimeout(changeTimer.current);
    setChangedEditor(null);
    setDraggedEditor(id);
    const done = () => {
      scrubbing.current = false;
      setDraggedEditor(null);
      window.removeEventListener("pointerup", done, true);
      window.removeEventListener("pointercancel", done, true);
    };
    window.addEventListener("pointerup", done, true);
    window.addEventListener("pointercancel", done, true);
  };

  // A right-click on a property's name: Copy CSS, Copy properties, Paste
  // properties, for that row's properties (its editor's, the ones it reads
  // with them: line-clamp's companions, mask-image's composite).
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; editor: PropertyEditor } | null>(null);
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const onContextMenu = (e: MouseEvent) => {
    const label = (e.composedPath()[0] as Element | null)?.closest?.(".property-label");
    // A panel's rows (a mask's type, from…) aren't properties.
    if (!label || label.closest(".property-panel")) return;
    const id = label.closest<HTMLElement>("[data-row]")?.dataset.row ?? label.closest<HTMLElement>(".editor[data-editor]")?.dataset.editor;
    const editor = id ? findEditor(editors, id) : undefined;
    if (!editor) return;
    e.preventDefault();
    setRowMenu({ x: e.clientX, y: e.clientY, editor });
  };
  const rowValues = (editor: PropertyEditor) => {
    const properties = [...editor.properties, ...(editor.reads ?? [])];
    return rowEntries(properties, fieldValues(element, properties, history, states, widths, windowWidth));
  };
  const paste = () => {
    const entries = copiedProperties();
    if (!entries) return;
    // On every selected element, as one undo step, for the width chip and the state pills.
    const gesture = {};
    for (const el of [element, ...others]) for (const [p, v] of entries) applyChange(history, el, p, v, gesture, { chip: widths, states, width: windowWidth });
    repaint(0);
  };

  // The editor whose field has focus (by id), for the ruler's bars.
  const [focusedEditor, setFocusedEditor] = useState<string | null>(null);
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element | null;
    if (target === searchRef.current) setFocusArea("search");
    else if (target?.closest(".editor")) setFocusArea("editor");
    setFocusedEditor(target?.closest<HTMLElement>(".editor[data-editor]")?.dataset.editor ?? null);
  };
  const onFocusOut = (e: FocusEvent) => {
    if (!(e.relatedTarget instanceof Element) || !ref.current?.contains(e.relatedTarget)) setFocusedEditor(null);
  };

  // The property in use (its field focused, dragged or just changed): where its values apply among the
  // widths, for the bars under the ruler, when it has rules for some widths (the owner's design, 2026-11-26).
  const inUse = editing ?? focusedEditor;
  const usedEditor = inUse ? findEditor(matches, inUse) : undefined;
  const reach = usedEditor ? reachOf(element, usedEditor, history, states, widths, windowWidth) : null;
  const reachKey = reach ? JSON.stringify(reach) : "";
  useEffect(() => onReach?.(reach), [reachKey]);
  useEffect(() => () => onReach?.(null), []);


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
  // A row whose value the window's resize changed (another rule applies now, edits/reach.ts): a brief
  // tint says "this updated" (PropertyDialog.css), started over if it changes again.
  const flashRow = (id: string) => {
    const row = listRef.current?.querySelector<HTMLElement>(`.editor[data-editor="${CSS.escape(id)}"]`);
    if (!row) return;
    row.removeAttribute("data-updated");
    void row.offsetWidth;
    row.setAttribute("data-updated", "");
    row.addEventListener("animationend", () => row.removeAttribute("data-updated"), { once: true });
  };
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
  const scroll = useWindowScroll(!anchor.at);
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
  const spotNow = spot ?? dialogSpot(anchor, width, vw, scroll);
  const { left, top } = dialogPosition(spotNow, { width, height }, { width: vw, height: vh }, scroll);
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
    <PageAnchor at={dialogAnchor(spotNow, { left, top }, scroll)}>
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
        onFocusOut={onFocusOut}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
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
                {(() => {
                  const liveId = live.current && performance.now() - live.current.at < LIVE_MS ? live.current.id : null;
                  // Pilot's changes, read once for every row's signature (EditorRow).
                  const changes = history.changes();
                  return matches.map((match, index) => {
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
                        <EditorRow
                          quiet={!!liveId && liveId !== match.id}
                          changes={changes}
                          index={index}
                          count={matches.length}
                          editor={match}
                          element={element}
                          others={others}
                          history={history}
                          widths={widths}
                          width={windowWidth}
                          states={states}
                          query={query}
                          focusRequest={focus?.index === index ? focus.request : undefined}
                          onReturnToSearch={returnToSearch}
                          onTabOut={(direction) => tabOut(index, direction)}
                          onHint={setEditorHint}
                          onInspect={inspectFor(match.id)}
                          onChanged={() => {
                            live.current = { id: match.id, at: performance.now() };
                            changedBy(match.id);
                          }}
                          onResized={() => flashRow(match.id)}
                        />
                      </div>
                    </Fragment>
                  );
                  });
                })()}
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
        {rowMenu && (
          <ContextMenu
            x={rowMenu.x}
            y={rowMenu.y}
            onClose={() => setRowMenu(null)}
            items={(() => {
              const entries = rowValues(rowMenu.editor);
              return [
                { label: "Copy CSS", disabled: !entries.length, onSelect: () => void copyText(cssText(entries)) },
                { label: "Copy properties", disabled: !entries.length, onSelect: () => copyProperties(entries) },
                { label: "Paste properties", disabled: !copiedProperties(), onSelect: paste },
              ];
            })()}
          />
        )}
      </div>
      {/* Where the dialog's panels are drawn (PropertyPanel, a portal): beside it, in its anchor, not
          clipped by it, and scrolled with the page by the browser. */}
      <div class="panel-layer" />
    </PageAnchor>
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
/**
 * Every editor, for the design review (LIST_ALL_EDITORS). An editor another
 * one shows as a row is left out only while it shows it, for the element's
 * value now (display: grid shows gap, position always shows inset): else
 * it's listed on its own, right after the one that would show it, as the
 * list of set properties does. Before, every revealed editor was left out,
 * so with no display set, gap and the flex and grid rows weren't anywhere.
 */
function listedEditors(element: EditableElement, editors: PropertyEditor[], history: EditHistory): PropertyEditor[] {
  // Only rows of editors that are listed themselves count: size shows width
  // and height as rows, but isn't listed (it writes nothing of its own).
  const listable = editors.filter((e) => e.properties.length > 0);
  const values = revealedRowsBy(element, listable, history);
  return inListOrder(listable.filter((e) => !values.has(e.id)));
}

/** The ids of the editors the revealing ones (display, position) show as rows now, for the element's values. */
function revealedRowsBy(element: EditableElement, editors: PropertyEditor[], history: EditHistory): Set<string> {
  // Revealing by a value of their own (display, position): size shows width and height but writes nothing.
  const revealing = editors.filter((e) => e.embeds?.length && e.properties.length);
  const values = fieldValues(element, revealing.map((e) => e.properties[0] as string), history);
  return new Set(revealing.flatMap((e) => rowsOf(e.id, values[e.properties[0] as string] ?? "")));
}

/** The revealing editors' values now (display's, position's), as a key: the listed rows change with them. */
function revealingValues(element: EditableElement, editors: PropertyEditor[], history: EditHistory): string {
  const properties = editors.filter((e) => e.embeds?.length && e.properties.length).map((e) => e.properties[0] as string);
  const values = fieldValues(element, properties, history);
  return properties.map((p) => values[p]).join("|");
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
 * Where the dialog is drawn from (PageAnchor): in the page while it's at its
 * spot (`shown`, from dialogPosition), so it scrolls with the page with no
 * lag; shifted to stay on screen, fixed in the window (null), where it's
 * kept.
 */
export function dialogAnchor(
  spot: { left: number; top: number },
  shown: { left: number; top: number },
  scroll: { x: number; y: number },
): { x: number; y: number } | null {
  return shown.left === Math.round(spot.left - scroll.x) && shown.top === Math.round(spot.top - scroll.y) ? scroll : null;
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
 * With state pills (hover…), the values set for exactly those states, as the
 * fields read them (fieldValues): before, the element's own were listed, each
 * field empty for the state; none set for it, the list is empty, and the
 * search adds one.
 */
function editorsWithValues(
  element: EditableElement,
  editors: PropertyEditor[],
  history: EditHistory,
  states: readonly ElementState[] | undefined,
  widths: WidthChip | null | undefined,
  width: number,
): PropertyEditor[] {
  const properties = [...new Set(editors.flatMap((e) => e.properties))];
  // As the fields read them (pageValues), Pilot's own changes too.
  const page = pageValues(element, properties, history, states, widths, width);
  const isSet = (p: string) => {
    const { declared, at } = page[p] as PageValue;
    if (history.removalOf(element, p, at, states)) return false;
    if (history.valueOf(element, p, at, states) !== null) return true;
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
/** The editor with `id`, among `list` or the rows they reveal (display's gap). */
function findEditor(list: readonly PropertyEditor[], id: string): PropertyEditor | undefined {
  for (const editor of list) {
    if (editor.id === id) return editor;
    const inner = editor.embeds && findEditor(editor.embeds, id);
    if (inner) return inner;
  }
  return undefined;
}

function fieldValues(
  element: EditableElement,
  properties: string[],
  history: EditHistory,
  states?: readonly ElementState[],
  widths?: WidthChip | null,
  width: number = window.innerWidth,
): Record<string, string> {
  // With state pills: the values for exactly those states (Pilot's, else the
  // page's rules for them); empty when nothing sets one for them. Each
  // property's value where an edit of it goes (pageValues).
  const page = pageValues(element, properties, history, states, widths, width);
  return Object.fromEntries(
    properties.map((p) => {
      const { declared, at } = page[p] as PageValue;
      return [p, history.removalOf(element, p, at, states) ? "" : (history.valueOf(element, p, at, states) ?? declared?.value ?? "")];
    }),
  );
}

/** A property's page value, and the widths Pilot's own is read at (the history's key). */
interface PageValue {
  declared: Declared | null;
  at: "base" | WidthRange;
}

/**
 * The page's values the fields show, and where Pilot's own are read: per
 * property, where an edit of it goes (keyFor): pills read like CSS, no
 * assumptions (the owner's call, 2026-11-26). With a range chip, what's set
 * for exactly its range (Pilot's change for it, else the project's rule for
 * that breakpoint; nothing, empty, when neither sets it); Base and All
 * widths, what's set outside any media query; no chip, the rule that applies
 * at the window's width (`md:pt-4` between md and lg), so the field follows
 * resizes. With state pills, those states' rules (`.btn:hover`, a hover
 * rule inside a breakpoint only at its widths). What a field shows is what
 * an edit there changes.
 */
function pageValues(
  element: EditableElement,
  properties: string[],
  history: EditHistory,
  states: readonly ElementState[] | undefined,
  widths: WidthChip | null | undefined,
  width: number,
): Record<string, PageValue> {
  return Object.fromEntries(
    properties.map((p) => {
      const key = keyFor(element, p, widths, states, width, history);
      return [p, { declared: pageValueAt(element, p, key, states), at: key }];
    }),
  );
}

/**
 * The property in use: where its values apply among the widths, when it has
 * rules for some (else null, no bars). Of an editor's properties, the first
 * with such rules; a shorthand's sides are read rather than the shorthand
 * (`md:pt-4` sets padding-top, not padding).
 */
function reachOf(
  element: EditableElement,
  editor: PropertyEditor,
  history: EditHistory,
  states: readonly ElementState[] | undefined,
  widths: WidthChip | null | undefined,
  width: number,
): Reach | null {
  const all = propertiesOf(editor);
  const properties = all.filter((p) => !longhandsOf(p).some((l) => l !== p && all.includes(l)));
  for (const property of properties) {
    const target = widths === "all" ? "all" : keyFor(element, property, widths, states, width, history);
    const spans = spansOf(element, property, states, history, target === "all" ? undefined : target);
    if (hasWidthRules(spans)) return { property, spans, target };
  }
  return null;
}

/** The properties whose field value only a reset gives: Pilot sets none there, and the page's comes from a `*` rule. */
function resetValues(
  element: EditableElement,
  properties: string[],
  history: EditHistory,
  states: readonly ElementState[] | undefined,
  widths: WidthChip | null | undefined,
  width: number,
): Set<string> {
  const page = pageValues(element, properties, history, states, widths, width);
  return new Set(
    properties.filter((p) => {
      const { declared, at } = page[p] as PageValue;
      return !history.removalOf(element, p, at, states) && history.valueOf(element, p, at, states) === null && isFromReset(declared);
    }),
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
/** How long after a row's change it counts as changing still (the next frame of a drag comes well within it). */
const LIVE_MS = 400;

type MatchedEditorProps = Parameters<typeof MatchedEditor>[0];

/**
 * A row of the dialog that renders again only when what it shows may have
 * changed. While another row is changing a value (`quiet`: a drag, a scrub,
 * held arrows), it skips its render unless Pilot's own values for its
 * properties changed (`signatureOf`), or it moved, or its element, widths,
 * states, search or focus did: reading its fields (the page's cascade, the
 * computed style) was most of each frame with every property listed (~12ms
 * of ~17 for 84 rows). At any other time it renders as before, so nothing
 * it shows from the page goes stale.
 */
type EditorRowProps = MatchedEditorProps & { quiet: boolean; index: number; count: number; changes: RecordedChange[] };

class EditorRow extends Component<EditorRowProps> {
  private signature = "";

  override shouldComponentUpdate(next: EditorRowProps): boolean {
    const prev = this.props;
    const same =
      next.quiet &&
      prev.editor === next.editor &&
      prev.element === next.element &&
      prev.history === next.history &&
      prev.index === next.index &&
      prev.count === next.count &&
      prev.query === next.query &&
      prev.focusRequest === next.focusRequest &&
      sameChip(prev.widths, next.widths) &&
      prev.width === next.width &&
      (prev.states ?? []).join() === (next.states ?? []).join() &&
      (prev.others ?? []).length === (next.others ?? []).length &&
      (prev.others ?? []).every((o, i) => o === next.others?.[i]) &&
      signatureOf(next) === this.signature;
    return !same;
  }

  override render() {
    this.signature = signatureOf(this.props);
    const { quiet: _quiet, index: _index, count: _count, changes: _changes, ...props } = this.props;
    return <MatchedEditor {...props} />;
  }
}

/**
 * Pilot's changes a row could show (and removals): on its elements, for one
 * of its properties, or a shorthand or longhand of one (`padding` for
 * padding-top, `border-top-width` for border-width). A change elsewhere
 * alters it only if this does. From the changes the dialog read once.
 */
export function signatureOf({
  editor,
  element,
  others = [],
  changes,
}: Pick<EditorRowProps, "editor" | "element" | "others" | "changes">): string {
  const elements = [element, ...others];
  const properties = propertiesOf(editor);
  const related = (property: string) =>
    properties.some((p) => p === property || longhandsOf(property).includes(p) || longhandsOf(p).includes(property));
  return changes
    .filter((c) => elements.includes(c.element) && related(c.property))
    .map((c) => `${elements.indexOf(c.element)}:${c.property}:${c.value}:${c.removal?.from ?? ""}:${c.widths?.min}-${c.widths?.max}:${c.states?.join() ?? ""}`)
    .join("|");
}

function MatchedEditor({
  editor,
  element,
  others = [],
  history,
  widths,
  width,
  states,
  query,
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onHint,
  onInspect,
  onChanged,
  onResized,
}: {
  editor: PropertyEditor;
  element: EditableElement;
  others?: readonly EditableElement[];
  history: EditHistory;
  /** The width chip (null: the rule that applies at `width`). */
  widths?: WidthChip | null;
  /** The window's width. */
  width: number;
  states?: ElementState[];
  query?: string;
  focusRequest?: FocusRequest;
  onReturnToSearch(): void;
  onTabOut(direction: 1 | -1): void;
  onHint(hint: ComponentChildren | null): void;
  onInspect?(areas: BoxArea[] | null): void;
  /** The editor changed a value (or took one back). */
  onChanged?(): void;
  /** The window's resize changed what the fields show (another rule applies there now). */
  onResized?(): void;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const computed = getComputedStyle(element);
  const properties = propertiesOf(editor);
  const values = Object.fromEntries(properties.map((p) => [p, computed.getPropertyValue(p)]));
  const all = [element, ...others];
  const declared = fieldValues(element, properties, history, states, widths, width);
  // Several selected: a property whose value differs across them is "Mixed" (an empty field).
  const mixed = new Set<string>();
  for (const other of others) {
    const theirs = fieldValues(other, properties, history, states, widths, width);
    for (const p of properties) if (theirs[p] !== declared[p]) mixed.add(p);
  }
  for (const p of mixed) declared[p] = "";
  // Values only a reset gives (Pilot sets none, the page's comes from a `*` rule).
  const reset = resetValues(element, properties, history, states, widths, width);
  // What the fields show changed with the window's width, not an edit: say so (the dialog's flashRow).
  const shownKey = JSON.stringify(declared);
  const shown = useRef({ width, values: shownKey });
  useEffect(() => {
    const before = shown.current;
    shown.current = { width, values: shownKey };
    if (before.width !== width && before.values !== shownKey) onResized?.();
  }, [width, shownKey]);
  const Editor = editor.component;
  return (
    <Editor
      element={element}
      values={values}
      declared={declared}
      mixed={mixed}
      reset={reset}
      onChange={(property, value, options) => {
        // Every selected element, with one gesture: one undo step for all of them.
        const gesture = options?.gesture ?? (others.length ? {} : undefined);
        // Each element where the chip sends it (no chip: its rule that applies at the window's
        // width, each element its own); cleared, the element doesn't set it (a removal, when the page's CSS does).
        for (const el of all) applyChange(history, el, property, value, gesture, { chip: widths, states, width });
        onChanged?.();
        rerender(0);
      }}
      onRevert={(property, gesture) => {
        for (const el of all) history.revert(el, property, gesture);
        onChanged?.();
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
