import { useEffect, useRef } from "preact/hooks";

interface PropertySearchProps {
  value: string;
  onChange(value: string): void;
}

/** The property search field. Focused as soon as it appears. */
export function PropertySearch({ value, onChange }: PropertySearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

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
      />
    </div>
  );
}
