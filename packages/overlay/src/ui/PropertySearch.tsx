import { useEffect, useRef, useState } from "preact/hooks";
import { editors, searchEditors } from "../editors/registry.ts";
import { px } from "./px.ts";

interface PropertySearchProps {
  /** Bounding box of the selected element; the panel is placed next to it. */
  anchor: DOMRect;
}

const GAP = 8;
const WIDTH = 280;

/**
 * Property search, shown only while an element is selected, placed next to it.
 * Remounted (fresh query, focus) for every new selection.
 */
export function PropertySearch({ anchor }: PropertySearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = searchEditors(query);

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
  const top = Math.min(Math.max(GAP, anchor.top), Math.max(GAP, vh - GAP - 160));

  return (
    <div class="property-search surface" style={{ left: px(left), top: px(top), width: px(WIDTH) }} role="dialog" aria-label="Edit properties">
      <input
        ref={inputRef}
        class="input"
        type="search"
        placeholder="Search a property… (opacity, padding, radius)"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <ul class="results">
        {results.map((editor) => (
          <li key={editor.id} class="result">
            {editor.label}
          </li>
        ))}
      </ul>
      {results.length === 0 && (
        <p class="empty">{editors.length === 0 ? "No property editors yet." : "No matching property."}</p>
      )}
    </div>
  );
}
