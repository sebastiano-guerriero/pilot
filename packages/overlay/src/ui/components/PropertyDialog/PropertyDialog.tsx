import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import type { BoxArea } from "../../../dom/boxModel.ts";
import type { EditableElement } from "../../../dom/target.ts";
import { EditHistory } from "../../../edits/history.ts";
import { editors as allEditors, matchEditors } from "../../../editors/registry.ts";
import type { FocusRequest, PropertyEditor } from "../../../editors/types.ts";
import { px } from "../../px.ts";
import { PropertySearch } from "../PropertySearch/PropertySearch.tsx";

interface PropertyDialogProps {
  /** The selected element. */
  element: EditableElement;
  /** Its bounding box; the dialog is placed next to it. */
  anchor: DOMRect;
  /** Editors to search. Defaults to the built-in registry (overridable for tests). */
  editors?: PropertyEditor[];
  /** Starting search text (dev pinning); empty by default. */
  initialQuery?: string;
  /** Where changes are applied and recorded. App passes its shared one so undo spans selections. */
  history?: EditHistory;
  /** Close the dialog (deselect): Esc on an empty search. */
  onClose?(): void;
  /** The editor wants areas of the element shown on the page (null: back to the highlight). */
  onInspect?(areas: BoxArea[] | null): void;
}

const GAP = 8;

/**
 * The dialog next to the selected element. It starts with only the search
 * field; as the designer types, it adds the editors for the query below it:
 * the best matches plus their family (see matchEditors). Remounted (empty
 * query, focus) for every new selection.
 *
 * Keyboard loop, Tailwind-fast: type a property (`pt`), Tab or Enter into its
 * editor, type a value, Enter: back in the search, ready for the next one.
 * Esc steps back one level: editor → search → clear search → close.
 */
export function PropertyDialog({
  element,
  anchor,
  editors = allEditors,
  initialQuery = "",
  history: sharedHistory,
  onClose,
  onInspect,
}: PropertyDialogProps) {
  const [query, setQueryState] = useState(initialQuery);
  const [ownHistory] = useState(() => new EditHistory());
  const history = sharedHistory ?? ownHistory;
  // The editors shown for the query: the best matches, plus their family
  // (`w` → width, min-width, max-width). See matchEditors.
  const matches = matchEditors(query, editors);
  const matchKey = matches.map((m) => m.id).join(",");

  const searchRef = useRef<HTMLInputElement>(null);
  // Which editor should take focus, and why. A new object each time so the
  // editor focuses again. Cleared on typing, so a newly matched editor never
  // grabs focus away from the search.
  const [focus, setFocus] = useState<{ index: number; request: FocusRequest } | null>(null);
  const setQuery = (q: string) => {
    setQueryState(q);
    setFocus(null);
  };

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
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const width = ref.current?.offsetWidth ?? 0;
    const height = ref.current?.offsetHeight ?? 0;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  });
  const { width, height } = size;

  // Prefer the right side of the element, then the left; for elements too wide
  // for either, overlap the element's right edge. Keep it inside the viewport.
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  // Whole pixels: a fractional position antialiases the dialog's 1px edges and
  // clipped shapes differently, so they visibly drift apart at the corners.
  const left = Math.round(
    anchor.right + GAP + width <= vw
      ? anchor.right + GAP
      : anchor.left - GAP - width >= 0
        ? anchor.left - GAP - width
        : Math.max(GAP, vw - GAP - width),
  );
  const top = Math.round(Math.min(Math.max(GAP, anchor.top), Math.max(GAP, vh - GAP - height)));

  return (
    <div
      ref={ref}
      class="property-dialog surface"
      style={{ left: px(left), top: px(top) }}
      role="dialog"
      aria-label="Edit properties"
      onKeyDown={onKeyDown}
      onFocusIn={onFocusIn}
    >
      <PropertySearch value={query} onChange={setQuery} onKeyDown={onSearchKeyDown} inputRef={searchRef} />
      {matches.length > 0 && (
        // Wrapper for the property editors shown below the search. Only
        // rendered when something matches, so the empty dialog is just the search.
        <>
          <div class="properties">
            {/* Editors own everything inside `.editor` (see the @scope boundary in the CSS). */}
            {matches.map((match, index) => (
              <div class="editor" data-editor={match.id} key={match.id}>
                <MatchedEditor
                  editor={match}
                  element={element}
                  history={history}
                  focusRequest={focus?.index === index ? focus.request : undefined}
                  onReturnToSearch={returnToSearch}
                  onTabOut={(direction) => tabOut(index, direction)}
                  onHint={setEditorHint}
                  onInspect={onInspect}
                />
              </div>
            ))}
          </div>
          <footer class="footer" data-area={editorHint ? "editor-hint" : focusArea} aria-live="polite">
            {editorHint ?? <Hint area={focusArea} />}
          </footer>
        </>
      )}
    </div>
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
 * the edit history (which applies them as inline styles and makes them undoable).
 */
function MatchedEditor({
  editor,
  element,
  history,
  focusRequest,
  onReturnToSearch,
  onTabOut,
  onHint,
  onInspect,
}: {
  editor: PropertyEditor;
  element: EditableElement;
  history: EditHistory;
  focusRequest?: FocusRequest;
  onReturnToSearch(): void;
  onTabOut(direction: 1 | -1): void;
  onHint(hint: ComponentChildren | null): void;
  onInspect?(areas: BoxArea[] | null): void;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const computed = getComputedStyle(element);
  const values = Object.fromEntries(editor.properties.map((p) => [p, computed.getPropertyValue(p)]));
  const Editor = editor.component;
  return (
    <Editor
      element={element}
      values={values}
      onChange={(property, value, options) => {
        history.apply(element, property, value, options?.gesture);
        rerender(0);
      }}
      onRevert={(property, gesture) => {
        history.revert(element, property, gesture);
        rerender(0);
      }}
      focusRequest={focusRequest}
      onReturnToSearch={onReturnToSearch}
      onTabOut={onTabOut}
      onHint={onHint}
      onInspect={onInspect}
    />
  );
}
