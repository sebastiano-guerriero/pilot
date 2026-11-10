import { useCallback, useEffect, useState } from "preact/hooks";
import type { EditableElement } from "../dom/target.ts";
import { useElementPicker } from "../select/useElementPicker.ts";
import { useElementRect } from "../select/useElementRect.ts";
import { Highlight } from "./components/Highlight/Highlight.tsx";
import { PropertyDialog } from "./components/PropertyDialog/PropertyDialog.tsx";
import { Toolbar } from "./components/Toolbar/Toolbar.tsx";

interface AppProps {
  /** Pilot's Shadow DOM host, so the picker can ignore events from Pilot's own UI. */
  host: HTMLElement;
  onQuit(): void;
}

/**
 * Pilot while running.
 * - Cursor on: Pilot owns page clicks. Hover shows an outline, a click selects,
 *   and the property dialog opens next to the selected element. Clicking
 *   another element re-selects; Esc clears the selection.
 * - Cursor off: the page behaves normally again and the selection is cleared.
 */
export function App({ host, onQuit }: AppProps) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<{ element: EditableElement; key: number } | null>(null);

  const onPick = useCallback((element: EditableElement) => {
    setSelected((prev) => (prev?.element === element ? prev : { element, key: (prev?.key ?? 0) + 1 }));
  }, []);

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
      if (e.key === "Escape") {
        e.preventDefault();
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selected]);

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
          <PropertyDialog key={selected.key} element={selected.element} anchor={selectedRect} />
        </>
      )}
      <Toolbar selecting={selecting} onToggleSelect={toggleSelect} canSend={false} onSend={() => {}} onQuit={onQuit} />
    </>
  );
}
