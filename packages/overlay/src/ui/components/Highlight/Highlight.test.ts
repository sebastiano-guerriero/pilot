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
});
