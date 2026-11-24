// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPEN_DELAY, WARM_FOR, resetTooltipDelay } from "./delay.ts";
import { placeTooltip, Tooltip } from "./Tooltip.tsx";

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

/** Triggers measured at 300, 200 (100 × 24); a tooltip's bubble, fixed at 0, 0, at `origin`. */
function measured(origin: { left: number; top: number }) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const box = this.classList.contains("tooltip") ? { ...origin, width: 0, height: 0 } : { left: 300, top: 200, width: 100, height: 24 };
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => ({}) } as DOMRect;
  });
}

describe("placed in the window", () => {
  it("open, it's fixed in the window, from its trigger: a panel's scrolling list can't cut it", () => {
    const rect = measured({ left: 0, top: 0 });
    pointer(0, "pointerenter");
    wait(OPEN_DELAY);
    const bubble = anchors()[0]?.querySelector(".tooltip") as HTMLElement;
    expect(bubble.style.position).toBe("fixed");
    // Above the trigger, 4px away (happy-dom measures it 0 × 0): centered on it.
    expect(bubble.style.top).toBe("196px");
    expect(bubble.style.left).toBe("350px");
    rect.mockRestore();
  });

  it("in a moved container (the toolbar, centered with translate), from where its `fixed` starts", () => {
    // Fixed at 0, 0, the bubble lands at the container's corner: the window's 500, 700.
    const rect = measured({ left: 500, top: 700 });
    pointer(0, "pointerenter");
    wait(OPEN_DELAY);
    const bubble = anchors()[0]?.querySelector(".tooltip") as HTMLElement;
    expect(bubble.style.top).toBe("-504px");
    expect(bubble.style.left).toBe("-150px");
    rect.mockRestore();
  });

  it("above or below, centered or at an edge, kept 8px inside the window", () => {
    const trigger = { left: 300, right: 400, top: 200, bottom: 224 };
    const size = { width: 120, height: 24 };
    const win = { width: 1000, height: 800 };
    expect(placeTooltip(trigger, size, { side: "top", align: "center", gap: 4 }, win)).toEqual({ left: 290, top: 172 });
    expect(placeTooltip(trigger, size, { side: "bottom", align: "end", gap: 4 }, win)).toEqual({ left: 280, top: 228 });
    expect(placeTooltip(trigger, size, { side: "top", align: "start", gap: 4 }, win)).toEqual({ left: 300, top: 172 });
    // A long one at the left edge (a field's value at the dialog's edge): moved along.
    expect(placeTooltip({ left: 10, right: 110, top: 200, bottom: 224 }, { width: 530, height: 24 }, { side: "top", align: "end", gap: 4 }, win)).toEqual({ left: 8, top: 172 });
    // At the top: kept inside too.
    expect(placeTooltip({ left: 300, right: 400, top: 10, bottom: 34 }, size, { side: "top", align: "center", gap: 4 }, win).top).toBe(8);
  });
});
