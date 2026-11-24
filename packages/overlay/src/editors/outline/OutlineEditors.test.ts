// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { matchEditors } from "../registry.ts";
import type { PropertyEditor } from "../types.ts";
import { outlineColorEditor, outlineOffsetEditor, outlineStyleEditor, outlineWidthEditor } from "./OutlineEditors.tsx";

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

const label = () => container.querySelector(".property-label")?.textContent;
const field = (name: string) => container.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;
const typeAndEnter = (name: string, text: string) => {
  const input = field(name);
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("outline", () => {
  it("four rows, one per longhand: no shorthand", () => {
    for (const [editor, name] of [
      [outlineColorEditor, "outline-color"],
      [outlineStyleEditor, "outline-style"],
      [outlineWidthEditor, "outline-width"],
      [outlineOffsetEditor, "outline-offset"],
    ] as const) {
      mount(editor);
      expect(label()).toBe(name);
      expect(editor.properties).toEqual([name]);
    }
  });

  it("width and offset are lengths with a drag handle; the offset can be negative", () => {
    mount(outlineWidthEditor);
    expect(container.querySelector(".scrub-handle")).not.toBeNull();
    typeAndEnter("outline-width", "2");
    expect(element.style.getPropertyValue("outline-width")).toBe("2px");
    mount(outlineOffsetEditor);
    expect(container.querySelector(".scrub-handle")).not.toBeNull();
    typeAndEnter("outline-offset", "-2");
    expect(element.style.getPropertyValue("outline-offset")).toBe("-2px");
  });

  it("outline finds the four rows; Tailwind's outline-dashed… find the style", () => {
    expect(matchEditors("outline").map((e) => e.id)).toEqual(["outline-width", "outline-style", "outline-color", "outline-offset"]);
    for (const q of ["outline-solid", "outline-dashed", "outline-dotted", "outline-double", "outline-none"]) {
      expect(matchEditors(q).map((e) => e.id), q).toEqual(["outline-style"]);
    }
  });
});
