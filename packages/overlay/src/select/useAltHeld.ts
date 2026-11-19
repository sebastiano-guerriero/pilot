import { useEffect, useState } from "preact/hooks";

/**
 * Whether Alt (Option) is held, alone: true from its keydown to its keyup.
 * Pressing another key with it (a shortcut, Alt+P) ends it, and so does the
 * window losing focus (the keyup would go elsewhere). For the redlines
 * (Measurements), as Figma shows them with Option.
 */
export function useAltHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => setHeld(e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey);
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") setHeld(false);
    };
    const reset = () => setHeld(false);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", reset);
    };
  }, []);
  return held;
}
