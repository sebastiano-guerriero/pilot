// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchEditors } from "../registry.ts";
import { justifyContentEditor } from "./JustifyContentEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let changes: Array<[string, string]>;

const mount = () =>
  act(() => {
    render(
      h(justifyContentEditor.component, {
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

describe("justify-content", () => {
  it("offers the values with an icon each", () => {
    mount();
    act(() => trigger().click());
    expect(options().map((o) => o.querySelector(".label")?.textContent)).toEqual([
      "Select",
      "start",
      "end",
      "center",
      "space-between",
      "space-around",
      "space-evenly",
    ]);
    expect(options().slice(1).every((o) => o.querySelector(".option-icon svg"))).toBe(true);
  });

  it("nothing set: the trigger and the Select option show the crossed-out frame, without the squares", () => {
    mount();
    const frame = (el: Element) => el.querySelector(".option-icon svg") as SVGElement;
    expect(frame(trigger()).querySelector("g")?.getAttribute("opacity")).toBe("0.2");
    expect(frame(trigger()).querySelectorAll("rect")).toHaveLength(0);
    act(() => trigger().click());
    expect(frame(options()[0] as HTMLElement).querySelectorAll("rect")).toHaveLength(0);
    expect(frame(options()[1] as HTMLElement).querySelectorAll("rect")).toHaveLength(2); // start
  });

  it("picking a value sets it, and the trigger shows its icon", () => {
    mount();
    act(() => trigger().click());
    act(() => options()[3]?.click()); // center
    expect(changes).toEqual([["justify-content", "center"]]);
    expect(trigger().querySelector(".value")?.textContent).toBe("center");
    expect(trigger().querySelector(".option-icon svg")).not.toBeNull();
  });

  it("a value set some other way shows, without an icon", () => {
    element.style.justifyContent = "flex-start";
    mount();
    expect(trigger().querySelector(".value")?.textContent).toBe("flex-start");
    expect(trigger().querySelector(".option-icon svg")).toBeNull();
  });

  it("Tailwind's justify-* utilities find it", () => {
    // justify alone is every justify- property, justify-content first.
    expect(matchEditors("justify")[0]?.id).toBe("justify-content");
    for (const q of ["justify-content", "justify-between", "justify-center", "justify-evenly"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["justify-content"]);
    }
  });
});
