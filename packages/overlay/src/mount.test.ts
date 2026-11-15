// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { matchesShortcut, parseShortcut } from "./mount.tsx";

const key = (code: string, mods: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { code, ...mods });

describe("launch shortcut", () => {
  it("alt+p is Alt (Option) and the P key, on the physical key", () => {
    const s = parseShortcut("alt+p");
    expect(s && matchesShortcut(key("KeyP", { altKey: true }), s)).toBe(true);
    expect(s && matchesShortcut(key("KeyP"), s)).toBe(false);
    expect(s && matchesShortcut(key("KeyP", { altKey: true, shiftKey: true }), s)).toBe(false);
  });

  it("other modifiers and keys", () => {
    const s = parseShortcut("Ctrl+Shift+E");
    expect(s && matchesShortcut(key("KeyE", { ctrlKey: true, shiftKey: true }), s)).toBe(true);
    const cmd = parseShortcut("cmd+1");
    expect(cmd && matchesShortcut(key("Digit1", { metaKey: true }), cmd)).toBe(true);
  });
});
