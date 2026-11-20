// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALT_MOVE_PX, ALT_STILL_MS, useAltHeld } from "./useAltHeld.ts";

let container: HTMLElement;
let held = false;
function Probe() {
  held = useAltHeld();
  return null;
}
const key = (type: "keydown" | "keyup", k: string, code = k) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: k, code, altKey: k === "Alt" || type === "keydown", bubbles: true }));
  });
const move = (x: number, y: number, altKey = true) =>
  act(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, altKey, bubbles: true }));
  });
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  act(() => render(h(Probe, null), container));
});
afterEach(() => {
  render(null, container);
  vi.useRealTimers();
});

describe("useAltHeld", () => {
  it("Alt held alone, then the pointer moves: measuring at once, until Alt is released", () => {
    move(100, 100, false);
    key("keydown", "Alt", "AltLeft");
    expect(held).toBe(false);
    move(101, 101); // jitter
    expect(held).toBe(false);
    move(100 + ALT_MOVE_PX + 2, 100);
    expect(held).toBe(true);
    key("keyup", "Alt", "AltLeft");
    expect(held).toBe(false);
  });

  it("Alt held still: measuring after a moment", () => {
    key("keydown", "Alt", "AltLeft");
    wait(ALT_STILL_MS - 1);
    expect(held).toBe(false);
    wait(1);
    expect(held).toBe(true);
  });

  it("a character typed with Option (⌥ò = @) or a shortcut rules it out until Alt is released, moves and all", () => {
    move(100, 100, false);
    key("keydown", "Alt", "AltLeft");
    key("keydown", "@", "Semicolon");
    move(200, 200);
    wait(ALT_STILL_MS * 2);
    expect(held).toBe(false);
    key("keyup", "Alt", "AltLeft");
    key("keydown", "Alt", "AltLeft");
    move(250, 250);
    move(260, 260);
    expect(held).toBe(true);
  });
});
