// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { presetOption } from "../preset/PresetEditor.tsx";
import { flexGrowEditor, flexShrinkEditor } from "./FlexItemEditors.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;
let editor = flexGrowEditor;

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
      }),
      container,
    );
  });

beforeEach(() => {
  editor = flexGrowEditor;
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

const select = () => container.querySelector('[role="combobox"]') as HTMLButtonElement;
const shown = () => {
  const value = select().querySelector(".value") as HTMLElement;
  return value.classList.contains("placeholder") ? "" : value.textContent;
};
const field = () => container.querySelector("input") as HTMLInputElement | null;
const pick = (value: string) => {
  act(() => select().click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.textContent === value) as HTMLElement;
  act(() => option.click());
};
const typeAndEnter = (text: string) => {
  const input = field() as HTMLInputElement;
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("flex-grow and flex-shrink", () => {
  it("offer 0, 1 and custom", () => {
    for (const e of [flexGrowEditor, flexShrinkEditor]) {
      editor = e;
      mount();
      act(() => select().click());
      expect([...container.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
        "Select",
        "0",
        "1",
        "custom",
      ]);
      render(null, container);
    }
  });

  it("picking 0 or 1 writes it", () => {
    mount();
    pick("1");
    pick("0");
    expect(changes).toEqual([
      ["flex-grow", "1"],
      ["flex-grow", "0"],
    ]);
    expect(shown()).toBe("0");
  });

  it("custom opens a field for any other number: decimals, never negative", () => {
    mount();
    pick("custom");
    expect(changes).toEqual([]);
    typeAndEnter("0.5");
    typeAndEnter("-1");
    expect(changes).toEqual([["flex-grow", "0.5"]]);
    expect(shown()).toBe("custom");
    expect(field()?.value).toBe("0.5");
  });

  it("a value set some other way shows as its preset, or as custom", () => {
    expect(presetOption({ property: "flex-grow", presets: ["0", "1"] }, "1.0")).toBe("1");
    element.style.flexShrink = "2";
    editor = flexShrinkEditor;
    mount();
    expect(shown()).toBe("custom");
    expect(field()?.value).toBe("2");
  });
});
