// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { matchEditors } from "../registry.ts";
import type { PropertyEditor } from "../types.ts";
import {
  textDecorationColorEditor,
  textDecorationLineEditor,
  textDecorationStyleEditor,
  textDecorationThicknessEditor,
  textUnderlineOffsetEditor,
} from "./TextDecorationEditors.tsx";

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

describe("text decoration", () => {
  it("rows are named to fit: decoration-line, -color, -style, -width, underline-offset", () => {
    for (const [editor, name] of [
      [textDecorationLineEditor, "decoration-line"],
      [textDecorationColorEditor, "decoration-color"],
      [textDecorationStyleEditor, "decoration-style"],
      [textDecorationThicknessEditor, "decoration-width"],
      [textUnderlineOffsetEditor, "underline-offset"],
    ] as const) {
      mount(editor);
      expect(label()).toBe(name);
    }
  });

  it("thickness and offset are lengths with a drag handle; the offset can be negative", () => {
    mount(textDecorationThicknessEditor);
    expect(container.querySelector(".scrub-handle")).not.toBeNull();
    typeAndEnter("decoration-width", "2");
    expect(element.style.getPropertyValue("text-decoration-thickness")).toBe("2px");
    mount(textUnderlineOffsetEditor);
    expect(container.querySelector(".scrub-handle")).not.toBeNull();
    typeAndEnter("underline-offset", "-1");
    expect(element.style.getPropertyValue("text-underline-offset")).toBe("-1px");
  });

  it("Tailwind's names find them; decoration finds the four decoration rows", () => {
    for (const [q, id] of [
      ["underline", "text-decoration-line"],
      ["line-through", "text-decoration-line"],
      ["no-underline", "text-decoration-line"],
      ["decoration-wavy", "text-decoration-style"],
      ["decoration-from-font", "text-decoration-thickness"],
      ["underline-offset", "text-underline-offset"],
    ] as const) {
      expect(matchEditors(q).map((e) => e.id), q).toEqual([id]);
    }
    expect(matchEditors("decoration").map((e) => e.id)).toEqual([
      "text-decoration-line",
      "text-decoration-color",
      "text-decoration-style",
      "text-decoration-thickness",
    ]);
  });
});
