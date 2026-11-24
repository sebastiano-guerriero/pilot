// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Highlight } from "./Highlight.tsx";

let container: HTMLElement;
let el: HTMLElement;
const label = () => container.querySelector(".label") as HTMLElement;
const draw = (width: number, labelRoom?: number) =>
  act(() => render(h(Highlight, { element: el, rect: new DOMRect(10, 100, width, 30), variant: "hover", labelRoom }), container));

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  el = document.createElement("code");
  document.body.append(el);
});
afterEach(() => {
  render(null, container);
  container.remove();
  el.remove();
});

describe("Highlight", () => {
  it("the selection's corner dots, only when the box is big enough to tell them apart", () => {
    const dots = (width: number, height: number) => {
      act(() => render(h(Highlight, { element: el, rect: new DOMRect(10, 100, width, height), variant: "dots", label: false }), container));
      return container.querySelectorAll(".handle").length;
    };
    expect(dots(120, 30)).toBe(4);
    expect(dots(18, 18)).toBe(4);
    expect(dots(8, 8)).toBe(4); // side by side, touching
    expect(dots(120, 6)).toBe(0);
    expect(dots(7, 80)).toBe(0);
  });

  it("the label shows the name and size, above the box", () => {
    draw(120);
    expect(label().textContent).toBe("code120×30");
    expect(label().hasAttribute("data-below")).toBe(false);
    expect(label().style.maxWidth).toBe("");
  });

  it("with something further along its row, the label stops before it, or goes below the box when there's no room", () => {
    draw(120, 73);
    expect(label().style.maxWidth).toBe("73px");
    expect(label().hasAttribute("data-below")).toBe(false);
    draw(60, 13);
    expect(label().hasAttribute("data-below")).toBe(true);
    expect(label().style.maxWidth).toBe("");
  });

  it("near the window's right edge, the label lines up with the box's right edge instead; not beside corner icons", () => {
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    const clientWidth = Object.getOwnPropertyDescriptor(document.documentElement, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 90 });
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1000 });
    try {
      const at = (left: number, labelRoom?: number) =>
        act(() => render(h(Highlight, { element: el, rect: new DOMRect(left, 100, 40, 30), variant: "hover", labelRoom }), container));
      at(100);
      expect(label().hasAttribute("data-flipped")).toBe(false);
      at(940); // a 90px label from 939 would end at 1029
      expect(label().hasAttribute("data-flipped")).toBe(true);
      // With corner icons on its row, it keeps to its room (and goes below when there's none).
      at(940, 10);
      expect(label().hasAttribute("data-flipped")).toBe(false);
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
      if (clientWidth) Object.defineProperty(document.documentElement, "clientWidth", clientWidth);
      else delete (document.documentElement as { clientWidth?: number }).clientWidth;
    }
  });

  it("below would leave the window: inside the box, at its bottom", () => {
    act(() => render(h(Highlight, { element: el, rect: new DOMRect(10, window.innerHeight - 30, 40, 28), variant: "hover", labelRoom: 10 }), container));
    expect(label().hasAttribute("data-below")).toBe(false);
    expect(label().hasAttribute("data-inside-bottom")).toBe(true);
  });
});
