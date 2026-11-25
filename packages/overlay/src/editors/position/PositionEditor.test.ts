// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { insetEditor } from "../inset/InsetEditor.tsx";
import { groupOf, inListOrder } from "../listOrder.ts";
import { editors, matchEditors } from "../registry.ts";
import { positionEditor } from "./PositionEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;
let editor = positionEditor;

const mount = () =>
  act(() => {
    render(
      h(editor.component, {
        element,
        values: {},
        onChange: (p: string, v: string) => {
          changes.push([p, v]);
          history.apply(element, p, v);
          mount(); // the dialog re-renders after a change
        },
        onInspect: () => {},
      }),
      container,
    );
  });

beforeEach(() => {
  editor = positionEditor;
  history = new EditHistory(inlinePreview());
  changes = [];
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const labels = () => [...container.querySelectorAll(".property-label")].map((l) => l.textContent);
const inputs = () => [...container.querySelectorAll("input")] as HTMLInputElement[];
const pick = (value: string) => {
  act(() => (container.querySelector('[role="combobox"][aria-label="position"]') as HTMLButtonElement).click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.textContent === value) as HTMLElement;
  act(() => option.click());
};
const commit = (input: HTMLInputElement, text: string) => {
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("position", () => {
  it("is a select that always shows inset below it", () => {
    mount();
    expect(labels()).toEqual(["position", "inset"]);
    pick("absolute");
    expect(changes).toEqual([["position", "absolute"]]);
    expect(element.style.position).toBe("absolute");
    expect(labels()).toEqual(["position", "inset"]);
  });

  it("searching position shows position (with inset); inset, top or inset-x show inset alone", () => {
    expect(matchEditors("position").map((e) => e.id)).toEqual(["position"]);
    expect(matchEditors("absolute").map((e) => e.id)).toEqual(["position"]);
    for (const q of ["inset", "top", "left", "inset-x", "inset-y"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["inset"]);
    }
  });
});

describe("z-index, border-radius and visibility", () => {
  it("are found by their names and Tailwind's classes", () => {
    for (const q of ["z-index", "z"]) expect(matchEditors(q).map((e) => e.id)).toEqual(["z-index"]);
    for (const q of ["border-radius", "rounded", "radius"]) expect(matchEditors(q).map((e) => e.id)).toEqual(["border-radius"]);
    for (const q of ["visibility", "invisible", "visible", "collapse"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["visibility"]);
    }
  });

  it("Position (position, inset, z-index, isolation), then Appearance (bg-color, border, border-radius, opacity), Effects (box-shadow, the outline, the blend modes, filter, backdrop-filter), Transform (rotate, perspective, perspective-origin, transform-style, backface-visibility), then Typography (color first)", () => {
    const ids = inListOrder(editors).map((e) => e.id);
    const at = ids.indexOf("position");
    const order = [
      "position",
      "inset",
      "z-index",
      "isolation",
      "background-color",
      "border",
      "border-radius",
      "opacity",
      "box-shadow",
      "outline-width",
      "outline-style",
      "outline-color",
      "outline-offset",
      "mix-blend-mode",
      "background-blend-mode",
      "filter",
      "backdrop-filter",
      "rotate",
      "perspective",
      "perspective-origin",
      "transform-style",
      "backface-visibility",
      "color",
    ];
    expect(ids.slice(at, at + order.length)).toEqual(order);
    expect(order.map(groupOf)).toEqual([
      ...Array(4).fill("Position"),
      ...Array(4).fill("Appearance"),
      ...Array(9).fill("Effects"),
      ...Array(5).fill("Transform"),
      "Typography",
    ]);
  });
});

describe("inset", () => {
  beforeEach(() => {
    editor = insetEditor;
  });

  it("uses the inset icons: one value, then each side", () => {
    element.style.top = "1px";
    mount();
    const icon = () => (container.querySelector(".split-toggle svg rect") as SVGRectElement).outerHTML;
    // Split view (the sides differ): the toggle shows each side's bar, from the edge to the center.
    const bars = [...container.querySelectorAll(".split-toggle svg rect")].map((r) =>
      ["x", "y", "width", "height"].map((a) => r.getAttribute(a)).join(","),
    );
    expect(bars).toEqual(["5,0,2,6", "6,5,6,2", "5,6,2,6", "0,5,6,2"]);
    expect(icon()).toContain("--plt-color-accent");
  });

  it("writes inset as one value, and top/right/bottom/left as its sides", () => {
    expect(insetEditor.properties).toEqual(["inset", "top", "right", "bottom", "left"]);
    mount();
    commit(inputs()[0] as HTMLInputElement, "0");
    expect(changes).toEqual([["inset", "0px"]]);
  });

  it("shows each side when they differ, negative values and auto included", () => {
    // happy-dom doesn't expand `inset`; declared.test.ts covers reading the shorthand.
    Object.assign(element.style, { top: "10px", right: "auto", bottom: "-4px", left: "0px" });
    mount();
    expect(inputs().map((i) => i.value)).toEqual(["10px", "auto", "-4px", "0px"]);
  });
});
