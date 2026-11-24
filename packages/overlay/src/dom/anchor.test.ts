// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { dialogAnchor } from "../ui/components/PropertyDialog/PropertyDialog.tsx";
import { anchorAt, sameAt, within } from "./anchor.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

const at = { x: 0, y: 500, height: 3000 };

describe("within", () => {
  it("keeps the page anchor while what's drawn stays inside the page", () => {
    expect(within(at, 2500)).toBe(at);
  });

  it("past the page's end (it would make it longer), in the window", () => {
    expect(within(at, 2501)).toBeNull();
    expect(within(null, 0)).toBeNull();
  });
});

describe("anchorAt", () => {
  const box = { bottom: 100 };

  it("an element in a fixed or sticky container stays in the window", () => {
    document.body.innerHTML = `<header style="position: fixed"><a id="fixed">Home</a></header><nav style="position: sticky"><a id="sticky">Docs</a></nav>`;
    expect(anchorAt(document.getElementById("fixed") as Element, box, 0, windowWith(4000))).toBeNull();
    expect(anchorAt(document.getElementById("sticky") as Element, box, 0, windowWith(4000))).toBeNull();
  });

  it("one that scrolls with the window is drawn in the page, at the scroll of now", () => {
    document.body.innerHTML = `<main><p id="p">Hi</p></main>`;
    expect(anchorAt(document.getElementById("p") as Element, box, 0, windowWith(4000))).toEqual({ x: 0, y: 250, height: 4000 });
  });

  it("with its marks around it (the label, the actions) reaching past the page's end, in the window", () => {
    document.body.innerHTML = `<p id="p">Hi</p>`;
    expect(anchorAt(document.getElementById("p") as Element, { bottom: 3740 }, 32, windowWith(4000))).toBeNull();
    expect(anchorAt(document.getElementById("p") as Element, { bottom: 3700 }, 32, windowWith(4000))).not.toBeNull();
  });
});

describe("sameAt", () => {
  it("compares every field", () => {
    expect(sameAt(at, { ...at })).toBe(true);
    expect(sameAt(at, { ...at, y: 501 })).toBe(false);
    expect(sameAt(null, null)).toBe(true);
    expect(sameAt(at, null)).toBe(false);
  });
});

describe("dialogAnchor", () => {
  const scroll = { x: 0, y: 400 };

  it("at its spot, in the page: it scrolls with it", () => {
    expect(dialogAnchor({ left: 600, top: 520 }, { left: 600, top: 120 }, scroll)).toBe(scroll);
  });

  it("shifted to stay on screen, fixed in the window", () => {
    expect(dialogAnchor({ left: 600, top: 300 }, { left: 600, top: 8 }, scroll)).toBeNull();
  });
});

/** The window, scrolled 250px down a page `height` tall. */
function windowWith(height: number): Window {
  return {
    scrollX: 0,
    scrollY: 250,
    performance,
    getComputedStyle: (el: Element) => window.getComputedStyle(el),
    document: { scrollingElement: { scrollHeight: height }, documentElement: document.documentElement },
  } as unknown as Window;
}
