// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { matchEditors } from "../registry.ts";
import { transitionEditor } from "./TransitionEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let declared: Record<string, string>;
let changes: Array<[string, string]>;

// The editor reads what the element declares from `declared` (the dialog's job), so this stands in for it.
const mount = () =>
  act(() => {
    render(
      h(transitionEditor.component, {
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
const chips = () => [...container.querySelectorAll(".layer-chip-name")].map((e) => e.textContent);
const labels = () => [...container.querySelectorAll(".property-label")].map((e) => e.textContent);
const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const type = (label: string, text: string) => {
  const input = field(label);
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

describe("transition", () => {
  it("+ adds opacity with Tailwind's 150ms (no duration set), one undo step, and opens its panel", () => {
    mount();
    expect(labels()).toEqual(["transition", "duration", "easing", "delay"]);
    // Nothing set: the easing select says Select, as any; the times, CSS's 0s.
    expect(container.querySelector('[aria-label="transition easing"] .placeholder')?.textContent).toBe("Select");
    expect(field("transition duration").placeholder).toBe("0s");
    add();
    expect(changes).toEqual([
      ["transition-property", "opacity"],
      ["transition-duration", "150ms"],
    ]);
    expect(chips()).toEqual(["opacity"]);
    expect(container.querySelector(".property-panel")?.getAttribute("aria-label")).toBe("Transition");
    act(() => {
      history.undo();
    });
    expect(history.changes()).toEqual([]);
  });

  it("the shared rows set every transition's timing at once; one's own makes a list, and the shared row reads Mixed", () => {
    declared["transition-property"] = "opacity, transform";
    declared["transition-duration"] = "200ms";
    mount();
    expect(field("transition duration").value).toBe("200ms");
    // The second chip's panel: its duration empty, the shared one as its placeholder.
    act(() => (container.querySelectorAll(".layer-chip-open")[1] as HTMLButtonElement).click());
    expect(field("transform duration").value).toBe("");
    expect(field("transform duration").placeholder).toBe("200ms");
    type("transform duration", "500");
    expect(changes.at(-1)).toEqual(["transition-duration", "200ms, 500ms"]);
    expect(field("transition duration").placeholder).toBe("Mixed");
    // Each chip says its duration while they differ.
    expect(chips()).toEqual(["opacity200ms", "transform500ms"]);
    expect(field("transform duration").value).toBe("500ms");
    // Emptied: the others' again, one value.
    type("transform duration", "");
    expect(changes.at(-1)).toEqual(["transition-duration", "200ms"]);
    type("transform duration", "500");
    // Typed in the shared row: all the same again.
    type("transition duration", "300");
    expect(changes.at(-1)).toEqual(["transition-duration", "300ms"]);
  });

  it("× takes one off with its timing; the last one takes the timing too", () => {
    declared["transition-property"] = "opacity, transform";
    declared["transition-duration"] = "200ms, 500ms";
    mount();
    const remove = () => act(() => (container.querySelector(".layer-chip-remove") as HTMLButtonElement).click());
    remove();
    expect(changes).toEqual([
      ["transition-property", "transform"],
      ["transition-duration", "500ms"],
    ]);
    remove();
    expect(changes.slice(-2)).toEqual([
      ["transition-property", ""],
      ["transition-duration", ""],
    ]);
  });

  it("custom: any other property, its name typed beside the select; its timing as for any, past a line in the menu", () => {
    declared["transition-property"] = "opacity, grid-template-rows";
    declared["transition-duration"] = "200ms";
    mount();
    act(() => (container.querySelectorAll(".layer-chip-open")[1] as HTMLButtonElement).click());
    expect(field("custom transition property").value).toBe("grid-template-rows");
    expect(field("custom transition property").placeholder).toBe("padding");
    // Its own timing, as any transition.
    expect(field("grid-template-rows duration").placeholder).toBe("200ms");
    type("custom transition property", "--Progress");
    expect(changes.at(-1)).toEqual(["transition-property", "opacity, --Progress"]);
    act(() => (container.querySelector('[aria-label="transition property"]') as HTMLButtonElement).click());
    const menu = [...container.querySelectorAll('[role="listbox"] > *')].map((o) =>
      o.getAttribute("role") === "separator" ? "—" : o.querySelector(".label")?.textContent,
    );
    expect(menu.slice(-4)).toEqual(["height", "—", "custom", "none"]);
  });

  it("none is its own chip, with no + under it, and hides the timing", () => {
    declared["transition-property"] = "none";
    mount();
    expect(chips()).toEqual(["none"]);
    expect(container.querySelector(".layer-add")).toBeNull();
    expect(labels()).toEqual(["transition"]);
  });

  it("found by Tailwind's transition-*; duration-*, ease-* and delay-* find their own rows alone", () => {
    expect(matchEditors("transition-opacity").map((e) => e.id)).toEqual(["transition"]);
    expect(matchEditors("transition").map((e) => e.id)).toEqual(["transition"]);
    expect(matchEditors("duration-300").map((e) => e.id)).toEqual(["transition-duration"]);
    expect(matchEditors("ease-out").map((e) => e.id)).toEqual(["transition-timing-function"]);
    expect(matchEditors("delay").map((e) => e.id)).toEqual(["transition-delay"]);
  });
});
