import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

interface PropertySearchProps {
  value: string;
  onChange(value: string): void;
  onKeyDown?(e: KeyboardEvent): void;
  /** The field itself, so the dialog can move focus back to it. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * The property search field. Focused as soon as it appears, its text selected
 * (a query carried over from the previous selection): typing replaces it, and
 * Tab/Enter goes straight into its editor.
 */
export function PropertySearch({ value, onChange, onKeyDown, inputRef }: PropertySearchProps) {
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div class="property-search">
      <input
        ref={inputRef}
        class="input"
        type="search"
        aria-label="Search a property"
        placeholder="Search a property…"
        value={value}
        onInput={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          type="button"
          class="clear"
          aria-label="Clear search"
          // Keep focus in the field: a mousedown would otherwise move it here,
          // and clearing unmounts the editor that may have held it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path
              d="m6,0C2.691,0,0,2.691,0,6s2.691,6,6,6,6-2.691,6-6S9.309,0,6,0Zm2.53,7.47c.293.293.293.768,0,1.061-.146.146-.338.22-.53.22s-.384-.073-.53-.22l-1.47-1.47-1.47,1.47c-.146.146-.338.22-.53.22s-.384-.073-.53-.22c-.293-.293-.293-.768,0-1.061l1.47-1.47-1.47-1.47c-.293-.293-.293-.768,0-1.061s.768-.293,1.061,0l1.47,1.47,1.47-1.47c.293-.293.768-.293,1.061,0s.293.768,0,1.061l-1.47,1.47,1.47,1.47Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
