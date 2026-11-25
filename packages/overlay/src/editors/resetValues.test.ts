// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { boxSizingEditor } from "./box-sizing/BoxSizingEditor.tsx";
import { paddingEditor } from "./padding/PaddingEditor.tsx";
import { editors } from "./registry.ts";
import type { PropertyEditor } from "./types.ts";

let element: HTMLElement;
let container: HTMLElement;

const mount = (editor: PropertyEditor, declared: Record<string, string>, reset: string[]) =>
  act(() => {
    render(h(editor.component, { element, values: {}, declared, reset: new Set(reset), onChange: () => {} }), container);
  });
const input = () => container.querySelector("input") as HTMLInputElement;

beforeEach(() => {
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

describe("a value only a reset gives (Tailwind's preflight): the field empty, the value its dimmed placeholder", () => {
  it("a length", () => {
    const maxWidth = editors.find((e) => e.id === "max-width") as PropertyEditor;
    mount(maxWidth, { "max-width": "none" }, ["max-width"]);
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("none");
    mount(maxWidth, { "max-width": "320px" }, []);
    expect(input().value).toBe("320px");
  });

  it("a split (padding): the one value, and each side", () => {
    const sides = { "padding-top": "0px", "padding-right": "0px", "padding-bottom": "0px", "padding-left": "0px" };
    mount(paddingEditor, { padding: "0px", ...sides }, ["padding", ...Object.keys(sides)]);
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("0px");
    // The element's own top: the sides differ, each shows as it is (split, as it opens when they differ).
    act(() => render(null, container));
    mount(paddingEditor, { padding: "", ...sides, "padding-top": "8px" }, ["padding-right", "padding-bottom", "padding-left"]);
    const fields = [...container.querySelectorAll("input")] as HTMLInputElement[];
    expect(fields.map((f) => [f.value, f.placeholder])).toEqual([
      ["8px", ""],
      ["", "0px"],
      ["", "0px"],
      ["", "0px"],
    ]);
  });

  it("a keyword: the select's placeholder", () => {
    mount(boxSizingEditor, { "box-sizing": "border-box" }, ["box-sizing"]);
    const trigger = container.querySelector('[role="combobox"]') as HTMLElement;
    expect(trigger.querySelector(".placeholder")?.textContent).toBe("border-box");
  });
});
