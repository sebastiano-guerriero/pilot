import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

interface PropertySearchProps {
  value: string;
  onChange(value: string): void;
  onKeyDown?(e: KeyboardEvent): void;
  /** The field itself, so the dialog can move focus back to it. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/** The property search field. Focused as soon as it appears. */
export function PropertySearch({ value, onChange, onKeyDown, inputRef }: PropertySearchProps) {
  useEffect(() => {
    inputRef.current?.focus();
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
    </div>
  );
}
