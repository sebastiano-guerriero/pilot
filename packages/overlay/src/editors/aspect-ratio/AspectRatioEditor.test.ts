// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { matchEditors } from "../registry.ts";
import { aspectRatioEditor, ratioOption } from "./AspectRatioEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;

const mount = () =>
  act(() => {
    render(
      h(aspectRatioEditor.component, {
        element,
        values: { "aspect-ratio": "auto" },
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

describe("aspect-ratio", () => {
  it("offers the common ratios and custom; nothing set reads Select, with no field", () => {
    mount();
    expect(shown()).toBe("");
    expect(field()).toBeNull();
    act(() => select().click());
    expect([...container.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      "Select",
      "auto",
      "1 / 1",
      "4 / 3",
      "3 / 2",
      "16 / 9",
      "21 / 9",
      "3 / 4",
      "2 / 3",
      "9 / 16",
      "custom",
    ]);
  });

  it("picking a ratio writes it", () => {
    mount();
    pick("16 / 9");
    expect(changes).toEqual([["aspect-ratio", "16 / 9"]]);
    expect(shown()).toBe("16 / 9");
  });

  it("custom shows a field (placeholder x/y) and writes nothing until a ratio is typed", () => {
    mount();
    pick("custom");
    expect(changes).toEqual([]);
    expect(field()?.placeholder).toBe("x/y");
    typeAndEnter("4:5");
    expect(changes).toEqual([["aspect-ratio", "4 / 5"]]);
    expect(shown()).toBe("custom");
    expect(field()?.value).toBe("4 / 5");
  });

  it("a listed ratio set some other way shows as that option; anything else as custom", () => {
    expect(ratioOption("16/9")).toBe("16 / 9");
    expect(ratioOption("1")).toBe("1 / 1");
    expect(ratioOption("4 / 5")).toBe("custom");
    expect(ratioOption("")).toBe("");
    element.style.aspectRatio = "5 / 4";
    mount();
    expect(shown()).toBe("custom");
    expect(field()?.value).toBe("5 / 4");
  });

  it("the search finds it by its name and Tailwind's aspect-* classes", () => {
    for (const q of ["aspect", "aspect-ratio", "aspect-video", "aspect-square", "ratio"]) {
      expect(matchEditors(q, [aspectRatioEditor]).map((e) => e.id), q).toEqual(["aspect-ratio"]);
    }
  });
});
