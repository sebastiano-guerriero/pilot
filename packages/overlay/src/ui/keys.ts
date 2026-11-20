/** On a Mac (or an iPad with a keyboard): shortcuts are written with symbols, and Cmd stands for Ctrl. */
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const MAC_SYMBOLS: Record<string, string> = { alt: "⌥", shift: "⇧", ctrl: "⌃", meta: "⌘", cmd: "⌘" };
const NAMES: Record<string, string> = { alt: "Alt", shift: "Shift", ctrl: "Ctrl", meta: "Win", cmd: "Ctrl" };

/**
 * A shortcut (`alt+c`, modifiers and a key joined by `+`) as people read it:
 * `⌥C` on a Mac, `Alt+C` elsewhere. For tooltips; `aria-keyshortcuts` keeps
 * its own spelling.
 */
export function keyLabel(shortcut: string, mac = isMac): string {
  const parts = shortcut.split("+").map((p) => p.trim().toLowerCase());
  const key = (parts.pop() ?? "").toUpperCase();
  const mods = parts.map((m) => (mac ? MAC_SYMBOLS[m] : NAMES[m]) ?? m);
  return mac ? [...mods, key].join("") : [...mods, key].join("+");
}
