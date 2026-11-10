import { useEffect, useRef, useState } from "preact/hooks";
import { editors, searchEditors } from "../editors/registry.ts";

interface AppProps {
  open: boolean;
  onClose(): void;
}

/**
 * Placeholder shell: a floating panel with the property search box.
 * Element selection, editors and the change list plug in here next.
 */
export function App({ open, onClose }: AppProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const results = searchEditors(query);

  return (
    <div class="panel" role="dialog" aria-label="Pilot">
      <header class="header">
        <span class="title">Pilot</span>
        <button type="button" class="icon-button" onClick={onClose} aria-label="Close Pilot">
          ×
        </button>
      </header>
      <input
        ref={inputRef}
        class="search"
        type="search"
        placeholder="Search a property… (opacity, padding, radius)"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
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
