// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { clearsView, groupOf } from "../listOrder.ts";
import { matchEditors } from "../registry.ts";
import { filterEditor } from "./FilterEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let declared: Record<string, string>;
let changes: Array<[string, string]>;

// The editor reads what the element declares from `declared` (the dialog's job).
const mount = () =>
  act(() => {
    render(
      h(filterEditor.component, {
        element,
        values: {},
        declared: { ...declared },
        onChange: (p: string, v: string, o?: { gesture?: object }) => {
          changes.push([p, v]);
          history.apply(element, p, v, o?.gesture);
          declared[p] = v;
          mount();
        },
      }),
      container,
    );
  });

beforeEach(() => {
  history = new EditHistory();
  declared = {};
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

const add = () => act(() => (container.querySelector(".layer-add") as HTMLButtonElement).click());
/** Each chip's name, and its value after a space. */
const chips = () =>
  [...container.querySelectorAll(".layer-chip-name")].map((e) =>
    [e.firstChild?.textContent, e.querySelector(".layer-chip-hint")?.textContent].filter(Boolean).join(" "),
  );
const panel = () => container.querySelector(".property-panel");
const field = () => container.querySelector('input[aria-label="filter value"]') as HTMLInputElement;
const typeAndEnter = (text: string) => {
  const input = field();
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};
const pickFunction = (name: string) => {
  act(() => (container.querySelector('[role="combobox"][aria-label="filter function"]') as HTMLButtonElement).click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.querySelector(".label")?.firstChild?.textContent === name);
  act(() => (option as HTMLElement).click());
};

describe("filter", () => {
  it("+ adds a blur and opens its panel, with what its value means", () => {
    mount();
    add();
    expect(changes).toEqual([["filter", "blur(4px)"]]);
    expect(chips()).toEqual(["blur 4px"]);
    expect(panel()?.getAttribute("aria-label")).toBe("Filter");
    expect(field().placeholder).toBe("4px");
    expect(container.querySelector(".property-panel .footer")?.textContent).toContain("0 is sharp");
  });

  it("filters stack in order; a bare number takes the function's unit", () => {
    mount();
    add();
    typeAndEnter("8");
    add();
    pickFunction("grayscale");
    typeAndEnter("50");
    expect(changes.at(-1)).toEqual(["filter", "blur(8px) grayscale(50%)"]);
    expect(chips()).toEqual(["blur 8px", "grayscale 50%"]);
  });

  it("none declares filter: none and is the whole value; × on the last chip declares nothing", () => {
    declared.filter = "blur(4px) sepia(100%)";
    mount();
    act(() => (container.querySelector(".layer-chip-open") as HTMLButtonElement).click());
    pickFunction("none");
    expect(changes.at(-1)).toEqual(["filter", "none"]);
    expect(chips()).toEqual(["none"]);
    act(() => (container.querySelector(".layer-chip-remove") as HTMLButtonElement).click());
    expect(changes.at(-1)).toEqual(["filter", ""]);
    expect(chips()).toEqual([]);
  });

  it("a drop-shadow is split into rows: x, y, blur and the color editor", () => {
    declared.filter = "drop-shadow(0 4px 4px #00000040)";
    mount();
    act(() => (container.querySelector(".layer-chip-open") as HTMLButtonElement).click());
    const value = (label: string) => (container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null)?.value;
    expect([value("shadow x"), value("shadow y"), value("shadow blur"), value("color")]).toEqual(["0", "4px", "4px", "#000000"]);
    const y = container.querySelector('input[aria-label="shadow y"]') as HTMLInputElement;
    act(() => y.focus());
    act(() => {
      y.value = "-2";
      y.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      y.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(changes.at(-1)).toEqual(["filter", "drop-shadow(0 -2px 4px #00000040)"]);
  });

  it("custom isn't offered, only shown for a filter the page writes that isn't a function", () => {
    mount();
    add();
    act(() => (container.querySelector('[role="combobox"][aria-label="filter function"]') as HTMLButtonElement).click());
    const options = [...container.querySelectorAll('[role="option"] .label')].map((o) => o.firstChild?.textContent);
    expect(options).not.toContain("custom");
    expect(options.at(-1)).toBe("none");
  });

  it("a filter it can't read is a custom chip, with its CSS", () => {
    declared.filter = "url(#noise)";
    mount();
    expect(chips()).toEqual(["custom url(#noise)"]);
  });

  it("is found by filter and Tailwind's filter classes", () => {
    for (const q of ["filter", "blur", "grayscale", "sepia", "invert", "drop-shadow", "brightness", "hue-rotate", "filter-none"]) {
      expect(matchEditors(q).map((e) => e.id), q).toContain("filter");
    }
  });

  it("is in Effects, with the blend modes, and hides the highlights while it's edited, like Appearance", () => {
    for (const id of ["filter", "mix-blend-mode", "background-blend-mode"]) {
      expect(groupOf(id), id).toBe("Effects");
      expect(clearsView(id), id).toBe(true);
    }
    expect(groupOf("opacity")).toBe("Appearance");
  });
});
