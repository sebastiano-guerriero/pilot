// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { fillEditor } from "./SvgEditors.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;

const mount = () =>
  act(() => {
    render(
      h(fillEditor.component, {
        element,
        values: {},
        declared: { fill: history.valueOf(element, "fill") ?? "" },
        onChange: (p: string, v: string) => {
          history.apply(element, p, v);
          mount();
        },
      }),
      container,
    );
  });

const commit = (label: string, text: string) => {
  const input = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

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

describe("fill", () => {
  it("takes a color, or none, which has no opacity", () => {
    mount();
    commit("fill", "ff0000");
    expect(history.valueOf(element, "fill")).toBe("#ff0000");
    commit("fill", "None");
    expect(history.valueOf(element, "fill")).toBe("none");
    const opacity = container.querySelector('input[aria-label="fill opacity"]') as HTMLInputElement;
    expect(opacity.value).toBe("");
    commit("fill opacity", "50");
    expect(history.valueOf(element, "fill")).toBe("none");
  });
});
