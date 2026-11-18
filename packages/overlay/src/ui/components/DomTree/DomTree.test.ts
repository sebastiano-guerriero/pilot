// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomTree, panelPosition } from "./DomTree.tsx";

let container: HTMLElement;
let page: HTMLElement;
let selected: Element | null;
let hovered: Element | null;
let closed: number;

const mount = () =>
  act(() => {
    render(
      h(DomTree, {
        selected,
        onHover: (el: Element | null) => (hovered = el),
        onSelect: (el: Element) => {
          selected = el;
          mount();
        },
        onClose: () => closed++,
      }),
      container,
    );
  });

beforeEach(() => {
  document.body.innerHTML = "";
  page = document.createElement("main");
  page.innerHTML = `<section id="hero"><h1>Title</h1><div class="actions"><a>One</a><a>Two</a></div></section><footer id="foot"></footer>`;
  container = document.createElement("pilot-root");
  document.body.append(page, container);
  selected = null;
  hovered = null;
  closed = 0;
});
afterEach(() => {
  render(null, container);
});

const rows = () => [...container.querySelectorAll(".row")].map((r) => `${r.getAttribute("aria-level")}:${r.querySelector(".tag")?.textContent}${r.querySelector(".identifiers")?.textContent ?? ""}${r.getAttribute("aria-selected") === "true" ? "*" : ""}`);
const tree = () => container.querySelector('[role="tree"]') as HTMLElement;
const key = (k: string) =>
  act(() => {
    tree().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });

describe("DomTree", () => {
  it("opens down to the selection, one level into it", () => {
    selected = page.querySelector(".actions");
    mount();
    expect(rows()).toEqual(["1:main", "2:section#hero", "3:h1", "3:div*", "4:a", "4:a", "2:footer#foot"]);
  });

  it("hovering a row highlights its element; clicking selects it", () => {
    selected = page.querySelector("#hero");
    mount();
    const h1 = [...container.querySelectorAll(".row")].find((r) => r.querySelector(".tag")?.textContent === "h1") as HTMLElement;
    act(() => {
      h1.dispatchEvent(new PointerEvent("pointerenter"));
    });
    expect(hovered).toBe(page.querySelector("h1"));
    act(() => h1.click());
    expect(selected).toBe(page.querySelector("h1"));
  });

  it("↓/↑ select the next/previous row without opening it; → opens it, ← closes it", () => {
    selected = page.querySelector("h1");
    mount();
    key("ArrowDown");
    expect(selected).toBe(page.querySelector(".actions"));
    expect(rows()).toEqual(["1:main", "2:section#hero", "3:h1", "3:div*", "2:footer#foot"]);
    key("ArrowDown");
    expect(selected).toBe(page.querySelector("#foot"));
    key("ArrowUp");
    key("ArrowRight");
    expect(rows()).toEqual(["1:main", "2:section#hero", "3:h1", "3:div*", "4:a", "4:a", "2:footer#foot"]);
    key("ArrowRight");
    expect(selected).toBe(page.querySelector(".actions a"));
    key("ArrowLeft");
    expect(selected).toBe(page.querySelector(".actions"));
    key("ArrowLeft");
    expect(rows()).toEqual(["1:main", "2:section#hero", "3:h1", "3:div*", "2:footer#foot"]);
    key("ArrowUp");
    expect(selected).toBe(page.querySelector("h1"));
  });

  it("clicking a row doesn't open it; selecting on the page opens the tree down to it", () => {
    selected = page.querySelector("#hero");
    mount();
    const div = [...container.querySelectorAll(".row")].find((r) => r.querySelector(".tag")?.textContent === "div") as HTMLElement;
    act(() => div.click());
    expect(rows()).toEqual(["1:main", "2:section#hero", "3:h1", "3:div*", "2:footer#foot"]);
    selected = page.querySelector("#hero");
    mount();
    selected = page.querySelector(".actions");
    mount();
    expect(rows()).toEqual(["1:main", "2:section#hero", "3:h1", "3:div*", "4:a", "4:a", "2:footer#foot"]);
  });

  it("→ and ← never scroll the list sideways", () => {
    selected = page.querySelector("h1");
    mount();
    for (const k of ["ArrowRight", "ArrowLeft"]) {
      const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
      act(() => {
        tree().dispatchEvent(e);
      });
      expect(e.defaultPrevented).toBe(true);
    }
  });

  it("Esc closes it", () => {
    mount();
    key("Escape");
    expect(closed).toBe(1);
  });
});

describe("panelPosition", () => {
  const viewport = { width: 1000, height: 800 };
  it("opens 8px from the left edge, centered top to bottom with nothing selected", () => {
    expect(panelPosition(null, 300, viewport)).toEqual({ left: 8, top: 250 });
  });
  it("opens level with the selected element's top, kept on screen", () => {
    expect(panelPosition(null, 300, viewport, 340.4)).toEqual({ left: 8, top: 340 });
    expect(panelPosition(null, 300, viewport, 700)).toEqual({ left: 8, top: 800 - 300 - 8 });
    expect(panelPosition(null, 300, viewport, -120)).toEqual({ left: 8, top: 8 });
  });
  it("keeps a spot as it is while it fits", () => {
    expect(panelPosition({ left: 200, top: 100 }, 300, viewport)).toEqual({ left: 200, top: 100 });
  });
  it("moves up, and in from the edges, to stay on screen", () => {
    expect(panelPosition({ left: 900, top: 600 }, 300, viewport)).toEqual({ left: 1000 - 240 - 8, top: 800 - 300 - 8 });
    expect(panelPosition({ left: -50, top: -20 }, 300, viewport)).toEqual({ left: 8, top: 8 });
  });
});
