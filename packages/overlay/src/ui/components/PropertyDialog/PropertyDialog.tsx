import { useLayoutEffect, useReducer, useRef, useState } from "preact/hooks";
import type { EditableElement } from "../../../dom/target.ts";
import { editors as allEditors, searchEditors } from "../../../editors/registry.ts";
import type { PropertyEditor } from "../../../editors/types.ts";
import { px } from "../../px.ts";
import { PropertySearch } from "../PropertySearch/PropertySearch.tsx";

interface PropertyDialogProps {
  /** The selected element. */
  element: EditableElement;
  /** Its bounding box; the dialog is placed next to it. */
  anchor: DOMRect;
  /** Editors to search. Defaults to the built-in registry (overridable for tests). */
  editors?: PropertyEditor[];
}

const GAP = 8;
const WIDTH = 280;

/**
 * The dialog next to the selected element. It starts with only the search
 * field; as the designer types, it adds the editor of the best-matching
 * property below it. Remounted (empty query, focus) for every new selection.
 */
export function PropertyDialog({ element, anchor, editors = allEditors }: PropertyDialogProps) {
  const [query, setQuery] = useState("");
  const match = query.trim() ? searchEditors(query, editors)[0] : undefined;

  // The dialog grows when an editor appears: measure it so it stays on screen.
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    if (h !== height) setHeight(h);
  });

  // Prefer the right side of the element, then the left; for elements too wide
  // for either, overlap the element's right edge. Keep it inside the viewport.
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const left =
    anchor.right + GAP + WIDTH <= vw
      ? anchor.right + GAP
      : anchor.left - GAP - WIDTH >= 0
        ? anchor.left - GAP - WIDTH
        : Math.max(GAP, vw - GAP - WIDTH);
  const top = Math.min(Math.max(GAP, anchor.top), Math.max(GAP, vh - GAP - height));

  return (
    <div
      ref={ref}
      class="property-dialog surface"
      style={{ left: px(left), top: px(top), width: px(WIDTH) }}
      role="dialog"
      aria-label="Edit properties"
    >
      <PropertySearch value={query} onChange={setQuery} />
      {match && (
        // Editors own everything inside `.editor` (see the @scope boundary in the CSS).
        <div class="editor" data-editor={match.id} key={match.id}>
          <MatchedEditor editor={match} element={element} />
        </div>
      )}
    </div>
  );
}

/**
 * Feeds an editor the element's current values and applies its changes.
 * For now a change is written straight to the inline style; recording
 * `from → to` for the change set comes with the inline-style engine.
 */
function MatchedEditor({ editor, element }: { editor: PropertyEditor; element: EditableElement }) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const computed = getComputedStyle(element);
  const values = Object.fromEntries(editor.properties.map((p) => [p, computed.getPropertyValue(p)]));
  const Editor = editor.component;
  return (
    <Editor
      element={element}
      values={values}
      onChange={(property, value) => {
        element.style.setProperty(property, value);
        rerender(0);
      }}
    />
  );
}
