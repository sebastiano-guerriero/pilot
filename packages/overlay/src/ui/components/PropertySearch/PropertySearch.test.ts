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

  it("words Pilot can't read: picked, they go on being described, the line saying so; Enter sets them anyway", () => {
    value = "/when it feels right";
    mount();
    expect(rows()).toEqual(["Create modifier"]);
    enter();
    expect(set).toEqual([]);
    expect(container.querySelector(".condition-reading")?.textContent).toContain("Enter sets it anyway, without a live preview.");
    expect(container.querySelector("input")?.getAttribute("aria-label")).toBe("Describe when");
    expect(container.querySelector(".condition-reading[data-error]")).not.toBeNull();
    // Short: what's wrong in red, how to put it after.
    expect(container.querySelector(".condition-error")?.textContent).toBe("Pilot can't read that yet.");
    expect(container.querySelector(".condition-reading")?.textContent).toContain("Try “the parent .card is hovered”");
    // Everything deleted: back to the search as it was.
    act(() => {
      const input = container.querySelector("input") as HTMLInputElement;
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("input")?.getAttribute("aria-label")).toBe("Add a property");
    expect(container.querySelector(".condition-reading")).toBeNull();
    // Described again and entered: set as the words.
    value = "/when it feels right";
    mount();
    enter();
    enter();
    expect(set).toEqual([{ words: "when it feels right" }]);
  });

  it("a word that matches a modifier lists it, not Create modifier", () => {
    value = "/hov";
    mount();
    expect(rows()).toEqual(["Hover"]);
  });
});

describe("a condition's force state checkbox", () => {
  it("checked: its changes shown as if it held (the preview only); unchecked: Pilot doesn't interfere", async () => {
    const { EditHistory } = await import("../../../edits/history.ts");
    const { inlinePreview } = await import("../../../test/inlinePreview.ts");
    document.body.innerHTML = `<p id="title">Title</p>`;
    const element = document.getElementById("title") as HTMLElement;
    const container = document.createElement("div");
    document.body.append(container);
    const history = new EditHistory(inlinePreview());
    const open = { words: "it has data-open", selector: "&[data-open]" };
    act(() => {
      render(
        h(PropertySearch, { value: "", onChange: () => {}, inputRef: createRef<HTMLInputElement>(), element, condition: open, history, onConditionChange: () => {} }),
        container,
      );
    });
    const box = () => container.querySelector(".pill-force input") as HTMLInputElement;
    expect(container.querySelector(".pill-force")?.textContent).toBe("force state");
    expect(box().checked).toBe(false);
    act(() => box().click());
    expect(box().checked).toBe(true);
    expect(history.forced(open)).toBe(true);
    act(() => box().click());
    expect(history.forced(open)).toBe(false);
    // Its text too.
    act(() => (container.querySelector(".pill-force .force-label") as HTMLElement).click());
    expect(history.forced(open)).toBe(true);
    expect(box().checked).toBe(true);
    // Checked: the select's checkmark over the box.
    expect(container.querySelector(".force-box svg")).not.toBeNull();
    act(() => (container.querySelector(".pill-force .force-label") as HTMLElement).click());
    expect(history.forced(open)).toBe(false);
    render(null, container);
    document.body.innerHTML = "";
  });
});
