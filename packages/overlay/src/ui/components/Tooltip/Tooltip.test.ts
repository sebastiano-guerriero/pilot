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

  it("with no text it doesn't open; given some while hovered, it opens as if just hovered", () => {
    const show = (text: string) =>
      act(() => render(h("div", null, [h(Tooltip, { text, children: h("button", null, "1") })]), container));
    show("");
    pointer(0, "pointerenter");
    wait(OPEN_DELAY * 2);
    expect(isOpen(0)).toBe(false);
    show("= 180px");
    wait(OPEN_DELAY);
    expect(isOpen(0)).toBe(true);
    show("");
    expect(isOpen(0)).toBe(false);
  });
});

describe("kept in the window", () => {
  it("one that would go past an edge moves along just enough; back in place when closed", () => {
    // It would open 152px past the left edge (a long stuck message on a loader near the edge).
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const shift = Number.parseFloat(/translateX\((-?[\d.]+)px\)/.exec(this.style.transform)?.[1] ?? "0");
      return { left: -152 + shift, right: 378 + shift, width: 530, top: 0, bottom: 24, height: 24, x: -152 + shift, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    pointer(0, "pointerenter");
    wait(OPEN_DELAY);
    const bubble = anchors()[0]?.querySelector(".tooltip") as HTMLElement;
    expect(bubble.style.transform).toBe("translateX(160px)");
    pointer(0, "pointerleave");
    wait(WARM_FOR);
    expect(bubble.style.transform).toBe("");
    rect.mockRestore();
  });
});
