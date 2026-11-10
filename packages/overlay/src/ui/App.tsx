import { useCallback, useEffect, useReducer, useState } from "preact/hooks";
import { type EditableElement, isEditable } from "../dom/target.ts";
import { EditHistory, historyShortcut } from "../edits/history.ts";
import type { PilotDevOptions } from "../mount.tsx";
import { useElementPicker } from "../select/useElementPicker.ts";
import { useElementRect } from "../select/useElementRect.ts";
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

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Inside Pilot the dialog handles Esc itself (one level at a time).
      if (e.key === "Escape" && !e.composedPath().includes(host)) {
        e.preventDefault();
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected, host]);

  const toggleSelect = () => {
    if (selecting) setSelected(null);
    setSelecting(!selecting);
  };

  return (
    <>
      {hovered && hoverRect && <Highlight element={hovered} rect={hoverRect} variant="hover" />}
      {selected && selectedRect && (
        <>
          <Highlight element={selected.element} rect={selectedRect} variant="selected" />
          <PropertyDialog
            key={selected.key}
            element={selected.element}
            anchor={selectedRect}
            // Only the dev-pinned first selection gets the pre-filled query.
            initialQuery={dev && selected.key === 1 ? dev.query : undefined}
            history={history}
            onClose={() => setSelected(null)}
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
