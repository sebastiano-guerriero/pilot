import { useCallback, useEffect, useReducer, useState } from "preact/hooks";
import { type BoxArea, hidesSelection } from "../dom/boxModel.ts";
import { type EditableElement, isEditable } from "../dom/target.ts";
import { EditHistory, historyShortcut } from "../edits/history.ts";
import type { PilotDevOptions } from "../mount.tsx";
import { useElementPicker } from "../select/useElementPicker.ts";
import { useElementRect } from "../select/useElementRect.ts";
import { BoxAreas } from "./components/BoxAreas/BoxAreas.tsx";
import { GridOverlay } from "./components/GridOverlay/GridOverlay.tsx";
import { Highlight } from "./components/Highlight/Highlight.tsx";
import { PropertyDialog } from "./components/PropertyDialog/PropertyDialog.tsx";
import { Toolbar } from "./components/Toolbar/Toolbar.tsx";

interface AppProps {
  /** Pilot's Shadow DOM host, so the picker can ignore events from Pilot's own UI. */
  host: HTMLElement;
  /** See `PilotOptions.dev`: start with an element selected and the dialog open. */
  dev?: PilotDevOptions;
  onQuit(): void;
}

/**
 * Pilot while running.
 * - Cursor on: Pilot owns page clicks. Hover shows an outline, a click selects,
 *   and the property dialog opens next to the selected element. Clicking
 *   another element re-selects; Esc clears the selection.
 * - Cursor off: the page behaves normally again and the selection is cleared.
 */
export function App({ host, dev, onQuit }: AppProps) {
  const [selecting, setSelecting] = useState(!!dev);
  const [selected, setSelected] = useState<{ element: EditableElement; key: number } | null>(() => {
    if (!dev) return null;
    const element = document.querySelector(dev.select);
    if (isEditable(element)) return { element, key: 1 };
    console.warn(`[pilot] dev.select "${dev.select}" matched no element.`);
    return null;
  });

  const onPick = useCallback((element: EditableElement) => {
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1 }));
  }, []);

  // Areas of the selected element an editor wants shown (e.g. the padding
  // being hovered or dragged); while set, they replace the selection highlight.
  const [inspect, setInspect] = useState<BoxArea[] | null>(null);
  useEffect(() => setInspect(null), [selected?.key]);

  // One history for the whole Pilot session, so undo works across selections.
  const [history] = useState(() => new EditHistory());
  const [, refresh] = useReducer((n: number) => n + 1, 0);

  // Cmd/Ctrl+Z undoes the last property change, Cmd/Ctrl+Shift+Z (or Ctrl+Y)
  // redoes it. Left alone when there's nothing to undo/redo, and when the
  // user is typing in one of the page's own fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = historyShortcut(e);
      if (!action) return;
      if (!e.composedPath().includes(host) && isTextField(document.activeElement)) return;
      if (action === "undo" ? history.undo() : history.redo()) {
        e.preventDefault();
        e.stopPropagation();
        refresh(0); // editors re-read the element's values
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [history, host]);

  const hovered = useElementPicker(selecting, host, onPick);
  const hoverRect = useElementRect(hovered !== selected?.element ? hovered : null);
  const selectedRect = useElementRect(selected?.element ?? null);

  // The selected element disappeared (re-render, HMR): drop the selection.
  useEffect(() => {
    if (selected && !selected.element.isConnected) setSelected(null);
  }, [selected, selectedRect]);

  // Esc, one level at a time:
  // - something selected: clear the selection (inside the dialog, the dialog
  //   handles Esc itself: editor → search → clear → close);
  // - only the select tool on, nothing selected: turn the tool off.
  useEffect(() => {
    if (!selected && !selecting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selected) {
        if (e.composedPath().includes(host)) return;
        e.preventDefault();
        setSelected(null);
      } else {
        e.preventDefault();
        setSelecting(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected, selecting, host]);

  const toggleSelect = () => {
    if (selecting) setSelected(null);
    setSelecting(!selecting);
  };

  const hideSelection = !!inspect?.some(hidesSelection);

  return (
    <>
      {hovered && hoverRect && (
        <>
          <Highlight element={hovered} rect={hoverRect} variant="hover" />
          {/* A hovered grid shows its lines; numbers come with the selection. */}
          <GridOverlay element={hovered} part="lines" />
        </>
      )}
      {selected && selectedRect && (
        <>
          {/* Grid containers also show their grid lines, under the selection
              highlight and the gap stripes; their numbers go on top (below). */}
          {!hideSelection && <GridOverlay element={selected.element} part="lines" />}
          {/* While some properties are edited (padding…) their areas replace the
              selection highlight and the grid lines and numbers, so the change
              is visible; others (the gap) are drawn along with them. See
              hidesSelection(). */}
          {!hideSelection && (
            <Highlight
              element={selected.element}
              rect={selectedRect}
              variant="selected"
              // Hovering another element: only its label shows, so they don't overlap.
              label={!(hovered && hovered !== selected.element)}
            />
          )}
          {inspect && <BoxAreas element={selected.element} areas={inspect} />}
          {!hideSelection && <GridOverlay element={selected.element} part="numbers" />}
          <PropertyDialog
            key={selected.key}
            element={selected.element}
            anchor={selectedRect}
            // Only the dev-pinned first selection gets the pre-filled query.
            initialQuery={dev && selected.key === 1 ? dev.query : undefined}
            history={history}
            onClose={() => setSelected(null)}
            onInspect={setInspect}
          />
        </>
      )}
      <Toolbar selecting={selecting} onToggleSelect={toggleSelect} canSend={false} onSend={() => {}} onQuit={onQuit} />
    </>
  );
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}
