// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { orderEditor } from "../order/OrderEditor.tsx";
import { matchEditors } from "../registry.ts";
import type { PropertyEditor } from "../types.ts";
import { colEndEditor, colSpanEditor, colStartEditor, rowEndEditor, rowSpanEditor, rowStartEditor } from "./GridColumnEditor.tsx";
import { inlinePreview } from "../../test/inlinePreview.ts";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;

const mount = (editor: PropertyEditor) =>
  act(() => {
    render(
      h(editor.component, {
        element,
        values: {},
        onChange: (p: string, v: string) => {
          history.apply(element, p, v);
          mount(editor);
        },
      }),
      container,
    );
  });

beforeEach(() => {
  history = new EditHistory(inlinePreview());
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const typeAndEnter = (label: string, text: string) => {
  const input = field(label);
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("col-span", () => {
  it("is labeled col-span and writes the grid-column shorthand", () => {
    mount(colSpanEditor);
    expect(container.querySelector(".property-label")?.textContent).toBe("col-span");
    typeAndEnter("col-span", "3");
    expect(element.style.getPropertyValue("grid-column")).toBe("span 3 / span 3");
    expect(field("col-span").value).toBe("3");
  });

  it("full spans from the first line to the last, shown as full", () => {
    mount(colSpanEditor);
    typeAndEnter("col-span", "full");
    expect(element.style.getPropertyValue("grid-column")).toBe("1 / -1");
    expect(field("col-span").value).toBe("full");
  });
});

describe("row-span, row-start, row-end", () => {
  it("work like the column ones, on grid-row", () => {
    mount(rowSpanEditor);
    expect(container.querySelector(".property-label")?.textContent).toBe("row-span");
    typeAndEnter("row-span", "2");
    expect(element.style.getPropertyValue("grid-row")).toBe("span 2 / span 2");
    expect(field("row-span").value).toBe("2");
    for (const [editor, label, property, text] of [
      [rowStartEditor, "row-start", "grid-row-start", "2"],
      [rowEndEditor, "row-end", "grid-row-end", "-1"],
    ] as const) {
      mount(editor);
      typeAndEnter(label, text);
      expect(element.style.getPropertyValue(property)).toBe(text);
    }
  });

  it("Tailwind's names find each one", () => {
    expect(matchEditors("row-span").map((e) => e.id)).toEqual(["grid-row"]);
    expect(matchEditors("row-start").map((e) => e.id)).toEqual(["grid-row-start"]);
    expect(matchEditors("row-end").map((e) => e.id)).toEqual(["grid-row-end"]);
    expect(matchEditors("grid-rows").map((e) => e.id)).toEqual(["grid-rows"]);
  });
});

describe("col-start, col-end, order", () => {
  it("take whole numbers, without a unit, and no drag handle", () => {
    for (const [editor, label, property, text] of [
      [colStartEditor, "col-start", "grid-column-start", "2"],
      [colEndEditor, "col-end", "grid-column-end", "-1"],
      [orderEditor, "order", "order", "-2"],
    ] as const) {
      mount(editor);
      typeAndEnter(label, text);
      expect(element.style.getPropertyValue(property)).toBe(text);
      expect(container.querySelector(".scrub-handle")).toBeNull();
    }
  });
});

describe("search", () => {
  it("Tailwind's names find each one; col finds all three (and gap, by column-gap, and color)", () => {
    expect(matchEditors("col-span").map((e) => e.id)).toEqual(["grid-column"]);
    expect(matchEditors("col-start").map((e) => e.id)).toEqual(["grid-column-start"]);
    expect(matchEditors("col-end").map((e) => e.id)).toEqual(["grid-column-end"]);
    expect(matchEditors("order").map((e) => e.id)).toEqual(["order"]);
    // column-gap is a property gap writes: it starts with col too.
    // color starts with col too, and prefix ties aren't capped.
    expect(matchEditors("col").map((e) => e.id)).toEqual(["gap", "grid-column", "grid-column-start", "grid-column-end", "color"]);
    // cols is still the grid's columns.
    expect(matchEditors("cols").map((e) => e.id)).toEqual(["grid-columns"]);
  });
});
