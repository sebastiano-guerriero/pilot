// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPEN_DELAY, WARM_FOR, resetTooltipDelay } from "./delay.ts";
import { Tooltip } from "./Tooltip.tsx";

let container: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  resetTooltipDelay();
  container = document.createElement("div");
  document.body.append(container);
  act(() => {
    render(
      h("div", null, [
        h(Tooltip, { text: "One", children: h("button", null, "1") }),
        h(Tooltip, { text: "Two", children: h("button", null, "2") }),
      ]),
      container,
    );
  });
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.useRealTimers();
});

const anchors = () => [...container.querySelectorAll(".tooltip-anchor")] as HTMLElement[];
const isOpen = (i: number) => anchors()[i]?.querySelector(".tooltip")?.hasAttribute("data-open");
const pointer = (i: number, type: "pointerenter" | "pointerleave") =>
  act(() => {
    anchors()[i]?.dispatchEvent(new Event(type));
  });
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("Tooltip", () => {
  it("opens after a pause on the first hover", () => {
    pointer(0, "pointerenter");
    expect(isOpen(0)).toBe(false);
    wait(OPEN_DELAY - 1);
    expect(isOpen(0)).toBe(false);
    wait(1);
    expect(isOpen(0)).toBe(true);
    pointer(0, "pointerleave");
    expect(isOpen(0)).toBe(false);
  });

  it("doesn't open when the pointer only passes by", () => {
    pointer(0, "pointerenter");
    wait(OPEN_DELAY / 2);
    pointer(0, "pointerleave");
    wait(OPEN_DELAY);
    expect(isOpen(0)).toBe(false);
    // And it didn't warm the next one up.
    pointer(1, "pointerenter");
    expect(isOpen(1)).toBe(false);
  });

  it("opens the next one at once when moving straight on", () => {
    pointer(0, "pointerenter");
    wait(OPEN_DELAY);
    pointer(0, "pointerleave");
    wait(WARM_FOR / 2);
    pointer(1, "pointerenter");
    expect(isOpen(1)).toBe(true);
    // Without its entrance animation; the first one had it.
    expect(anchors()[1]?.querySelector(".tooltip")?.hasAttribute("data-instant")).toBe(true);
    // The one left behind is gone at once too (no fade).
    expect(anchors()[0]?.querySelector(".tooltip")?.hasAttribute("data-instant")).toBe(true);
    expect(isOpen(0)).toBe(false);
  });

  it("fades out when the pointer leaves for no other tooltip", () => {
    pointer(0, "pointerenter");
    wait(OPEN_DELAY);
    pointer(0, "pointerleave");
    expect(anchors()[0]?.querySelector(".tooltip")?.hasAttribute("data-instant")).toBe(false);
  });

  it("waits again once the pointer has been away a while", () => {
    pointer(0, "pointerenter");
    wait(OPEN_DELAY);
    pointer(0, "pointerleave");
    wait(WARM_FOR);
    pointer(1, "pointerenter");
    expect(isOpen(1)).toBe(false);
    wait(OPEN_DELAY);
    expect(isOpen(1)).toBe(true);
  });
});
