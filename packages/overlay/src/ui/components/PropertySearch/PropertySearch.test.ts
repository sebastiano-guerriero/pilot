// @vitest-environment happy-dom
import { createRef, h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Condition } from "../../../edits/condition.ts";
import { PropertySearch } from "./PropertySearch.tsx";

describe("Create modifier: words after / that match no modifier", () => {
  let container: HTMLElement;
  let element: HTMLElement;
  let set: Array<Condition | null>;
  let value: string;
  const mount = () =>
    act(() => {
      render(
        h(PropertySearch, {
          value,
          onChange: (v: string) => {
            value = v;
            mount();
          },
          inputRef: createRef<HTMLInputElement>(),
          onWidthsChange: () => {},
          onStatesChange: () => {},
          element,
          onConditionChange: (c: Condition | null) => set.push(c),
        }),
        container,
      );
    });
  const rows = () => [...container.querySelectorAll(".modifier")].map((r) => r.querySelector(".modifier-name")?.textContent);
  const enter = () =>
    act(() => {
      container.querySelector("input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });

  beforeEach(() => {
    document.body.innerHTML = `<section class="card"><p id="title">Title</p></section>`;
    element = document.getElementById("title") as HTMLElement;
    container = document.createElement("div");
    document.body.append(container);
    set = [];
  });
  afterEach(() => {
    render(null, container);
    document.body.innerHTML = "";
  });

  it("is offered instead of no match; Enter sets it at once when Pilot reads the words", () => {
    value = "/the parent .card is hovered";
    mount();
    expect(rows()).toEqual(["Create modifier"]);
    expect(container.querySelector(".modifier-description")?.textContent).toBe("Use natural language to describe when");
    expect(container.querySelector(".modifier-syntax")?.textContent).toBe("");
    enter();
    expect(set.map((c) => c?.selector)).toEqual([".card:hover > &"]);
    expect(value).toBe("");
  });

  it("words Pilot can't read: picked, they go on being described, the line saying how to put them", () => {
    value = "/when it feels right";
    mount();
    expect(rows()).toEqual(["Create modifier"]);
    enter();
    expect(set).toEqual([]);
    expect(container.querySelector("input")?.getAttribute("aria-label")).toBe("Describe when");
    expect(container.querySelector(".condition-reading[data-error]")).not.toBeNull();
  });

  it("a word that matches a modifier lists it, not Create modifier", () => {
    value = "/hov";
    mount();
    expect(rows()).toEqual(["Hover"]);
  });
});
