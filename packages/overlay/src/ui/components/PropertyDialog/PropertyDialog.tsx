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
  /** Starting search text (dev pinning); empty by default. */
  initialQuery?: string;
}

const GAP = 8;

/**
 * The dialog next to the selected element. It starts with only the search
 * field; as the designer types, it adds the editor of the best-matching
 * property below it. Remounted (empty query, focus) for every new selection.
 */
export function PropertyDialog({ element, anchor, editors = allEditors, initialQuery = "" }: PropertyDialogProps) {
  const [query, setQuery] = useState(initialQuery);
  const match = query.trim() ? searchEditors(query, editors)[0] : undefined;

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
  const left =
    anchor.right + GAP + width <= vw
      ? anchor.right + GAP
      : anchor.left - GAP - width >= 0
        ? anchor.left - GAP - width
        : Math.max(GAP, vw - GAP - width);
  const top = Math.min(Math.max(GAP, anchor.top), Math.max(GAP, vh - GAP - height));

  return (
    <div
      ref={ref}
      class="property-dialog surface"
      style={{ left: px(left), top: px(top) }}
      role="dialog"
      aria-label="Edit properties"
    >
      <PropertySearch value={query} onChange={setQuery} />
      {match && (
        // Wrapper for the property editors shown below the search. Only
        // rendered when something matches, so the empty dialog is just the search.
        <div class="properties">
          {/* Editors own everything inside `.editor` (see the @scope boundary in the CSS). */}
          <div class="editor" data-editor={match.id} key={match.id}>
            <MatchedEditor editor={match} element={element} />
          </div>
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
