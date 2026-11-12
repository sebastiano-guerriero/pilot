// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchEditors } from "../registry.ts";
import { alignItemsEditor } from "./AlignItemsEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let changes: Array<[string, string]>;

const mount = () =>
  act(() => {
    render(
      h(alignItemsEditor.component, {
        element,
        values: {},
        onChange: (p: string, v: string) => {
          changes.push([p, v]);
          element.style.setProperty(p, v);
          mount();
        },
      }),
      container,
    );
  });

beforeEach(() => {
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

const trigger = () => container.querySelector('[role="combobox"]') as HTMLButtonElement;
const options = () => [...container.querySelectorAll('[role="option"]')] as HTMLElement[];

describe("align-items", () => {
  it("is a labeled row with an icon select", () => {
    mount();
    expect(container.querySelector(".property-label")?.textContent).toBe("align-items");
    act(() => trigger().click());
    expect(options().map((o) => o.querySelector(".label")?.textContent)).toEqual([
      "Select",
      "start",
      "center",
      "end",
      "stretch",
      "baseline",
    ]);
    expect(options().every((o) => o.querySelector(".option-icon svg"))).toBe(true);
  });

  it("picking a value sets it", () => {
    mount();
    act(() => trigger().click());
    act(() => options()[4]?.click()); // stretch
    expect(changes).toEqual([["align-items", "stretch"]]);
    expect(trigger().querySelector(".value")?.textContent).toBe("stretch");
  });

  it("Tailwind's items-* utilities find it", () => {
    for (const q of ["items", "items-center", "items-baseline", "align-items"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["align-items"]);
    }
  });
});
