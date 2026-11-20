import { useEffect, useState } from "preact/hooks";

/** Holding Alt alone without moving the pointer: measuring starts after this, in ms. */
export const ALT_STILL_MS = 500;
/** How far the pointer must move with Alt held to start measuring at once, in px (a trackpad's jitter isn't a move). */
export const ALT_MOVE_PX = 3;

/**
 * Whether Alt (Option) is held to measure (Measurements, as Figma shows
 * them with Option). Alt is also how a Mac types characters (`⌥ò` is @ on
 * an Italian layout) and Pilot's shortcuts (Alt+C, Alt+V), so Alt alone
 * isn't enough, or measuring would flash on (the panels fading) at every
 * one of those:
 * - with Alt held alone, moving the pointer starts it at once: typing never
 *   moves the pointer;
 * - holding Alt still starts it after ALT_STILL_MS;
 * - any other key while Alt is down (a character, a shortcut) rules it out
 *   until Alt is released.
 * It ends when Alt is released, or the window loses focus (the keyup would
 * go elsewhere).
 */
export function useAltHeld(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    // Alt is down, alone, and nothing has ruled measuring out since.
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Where the pointer was when Alt went down (or its first move after).
    let from: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;

    const reset = () => {
      armed = false;
      clearTimeout(timer);
      from = null;
      setHeld(false);
    };
    const start = () => {
      clearTimeout(timer);
      setHeld(true);
    };
    const down = (e: KeyboardEvent) => {
      if (e.key !== "Alt" || e.ctrlKey || e.metaKey || e.shiftKey) return reset();
      if (e.repeat || armed) return;
      armed = true;
      from = last;
      timer = setTimeout(start, ALT_STILL_MS);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt") reset();
    };
    const move = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      if (!armed || !e.altKey) return;
      if (!from) from = last;
      else if (Math.hypot(last.x - from.x, last.y - from.y) >= ALT_MOVE_PX) start();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("blur", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("blur", reset);
    };
  }, []);
  return held;
}
