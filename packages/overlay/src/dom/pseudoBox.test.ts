// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { pseudoRect } from "./pseudoBox.ts";

// happy-dom has no layout: the browser's measurements are stubbed (computed styles, boxes).
type Style = Record<string, string>;
const BASE: Style = {
  display: "block",
  content: '""',
  position: "static",
  boxSizing: "content-box",
  width: "0px",
  height: "0px",
  top: "auto",
  left: "auto",
  marginTop: "0px",
  marginRight: "0px",
  marginBottom: "0px",
  marginLeft: "0px",
  transform: "none",
  filter: "none",
  perspective: "none",
  contain: "none",
  alignSelf: "auto",
  alignItems: "normal",
  justifyContent: "normal",
  flexDirection: "row",
  flexWrap: "nowrap",
  columnGap: "normal",
  rowGap: "normal",
};

function stub(styles: Map<string, Style>, boxes: Map<Element, DOMRect>) {
  vi.spyOn(window, "getComputedStyle").mockImplementation(((element: Element, pseudo?: string | null) => {
    const own = styles.get(`${(element as HTMLElement).id}${pseudo ?? ""}`) ?? {};
    const style = { ...BASE, ...own };
    return { ...style, getPropertyValue: (name: string) => style[name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] ?? "" };
  }) as unknown as typeof getComputedStyle);
  for (const [element, box] of boxes) vi.spyOn(element, "getBoundingClientRect").mockReturnValue(box);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const box = (r: DOMRect | null) => r && [r.x, r.y, r.width, r.height];

describe("pseudoRect", () => {
  it("positioned: its offsets from the containing block's padding box (a card's ribbon)", () => {
    document.body.innerHTML = `<div id="card"></div>`;
    const card = document.getElementById("card") as HTMLElement;
    Object.defineProperty(card, "clientLeft", { value: 1 });
    Object.defineProperty(card, "clientTop", { value: 1 });
    stub(
      new Map<string, Style>([
        ["card", { position: "relative" }],
        ["card::before", { position: "absolute", width: "69px", height: "24px", left: "24px", top: "-12px", content: '"Popular"' }],
      ]),
      new Map([[card, new DOMRect(400, 2000, 320, 360)]]),
    );
    expect(box(pseudoRect(card, "::before"))).toEqual([425, 1989, 69, 24]);
  });

  it("in a flex row: before the first child, after the gap, centered on the cross axis (a badge's dot)", () => {
    document.body.innerHTML = `<span id="badge"><b id="text">New</b></span>`;
    const badge = document.getElementById("badge") as HTMLElement;
    const text = document.getElementById("text") as HTMLElement;
    stub(
      new Map<string, Style>([
        ["badge", { display: "inline-flex", alignItems: "center", columnGap: "8px", paddingLeft: "12px" }],
        ["badge::before", { width: "6px", height: "6px" }],
      ]),
      new Map<Element, DOMRect>([
        [badge, new DOMRect(100, 50, 120, 24)],
        [text, new DOMRect(126, 54, 80, 16)],
      ]),
    );
    expect(box(pseudoRect(badge, "::before"))).toEqual([112, 59, 6, 6]);
  });

  it("spread items (space-between): ::after at the row's end (an FAQ's +)", () => {
    document.body.innerHTML = `<div id="row"><b id="q">Question</b></div>`;
    const row = document.getElementById("row") as HTMLElement;
    const q = document.getElementById("q") as HTMLElement;
    stub(
      new Map<string, Style>([
        ["row", { display: "flex", justifyContent: "space-between", alignItems: "center" }],
        ["row::after", { width: "10px", height: "24px" }],
      ]),
      new Map<Element, DOMRect>([
        [row, new DOMRect(0, 0, 500, 24)],
        [q, new DOMRect(0, 0, 200, 24)],
      ]),
    );
    expect(box(pseudoRect(row, "::after"))).toEqual([490, 0, 10, 24]);
  });

  it("where it can't be told (inline, no size): null, so the owner is highlighted", () => {
    document.body.innerHTML = `<p id="p"></p>`;
    const p = document.getElementById("p") as HTMLElement;
    stub(new Map([["p::before", { display: "inline", width: "auto", height: "auto" }]]), new Map([[p, new DOMRect(0, 0, 100, 20)]]));
    expect(pseudoRect(p, "::before")).toBeNull();
    stub(new Map([["p::before", { content: "none" }]]), new Map());
    expect(pseudoRect(p, "::before")).toBeNull();
  });
});
