// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { clearsView, groupOf } from "../listOrder.ts";
import { matchEditors } from "../registry.ts";
import { borderEditor } from "./BorderEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let declared: Record<string, string>;
let changes: Array<[string, string]>;
let reset: Set<string>;

// The editor reads what the element declares from `declared` (the dialog's job).
const mount = () =>
  act(() => {
    render(
      h(borderEditor.component, {
        element,
        values: {},
        declared: { ...declared },
        reset,
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
  reset = new Set();
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const typeAndEnter = (label: string, text: string) => {
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
const select = (label: string) => container.querySelector(`[role="combobox"][aria-label="${label}"]`) as HTMLButtonElement;
const pick = (label: string, name: string) => {
  act(() => select(label).click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.querySelector(".label")?.firstChild?.textContent === name);
  act(() => (option as HTMLElement).click());
};

const split = () => act(() => (container.querySelector(".split-toggle") as HTMLButtonElement).click());

describe("border", () => {
  it("one line: the width, the style and the color, then border-radius's split button; the style shows only its icon", () => {
    mount();
    const labels = [...container.querySelectorAll(".property-label")].map((l) => l.textContent);
    expect(labels).toEqual(["border"]);
    expect(field("border width")).toBeTruthy();
    expect(select("border style").querySelector(".chevron")).toBeNull();
    expect(select("border style").querySelector(".value")).toBeNull();
    expect(container.querySelector('button[aria-label="border color"] .color-preview')).toBeTruthy();
    expect(container.querySelector(".action .split-toggle")?.getAttribute("aria-pressed")).toBe("false");
    // No drag handle: no room for it.
    expect(container.querySelector(".border-line .scrub-handle, .border-line [data-scrub]")).toBeNull();
  });

  it("a width with no style comes with solid, one undo step, on every side", () => {
    mount();
    typeAndEnter("border width", "2");
    expect(changes).toEqual([
      ["border-width", "2px"],
      ["border-style", "solid"],
    ]);
    history.undo();
    expect(history.changes()).toEqual([]);
    pick("border style", "dashed");
    expect(changes.at(-1)).toEqual(["border-style", "dashed"]);
  });

  it("split: a line per side, writing its longhands; switching changes nothing on the page", () => {
    declared = { "border-width": "1px", "border-style": "solid" };
    mount();
    split();
    expect(changes).toEqual([]);
    expect(container.querySelector(".split-toggle")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".split-toggle .icon")).toHaveLength(4);
    for (const side of ["top", "right", "bottom", "left"]) expect(field(`border ${side} width`).value).toBe("1px");
    typeAndEnter("border bottom width", "4");
    pick("border left style", "dotted");
    expect(changes).toEqual([
      ["border-bottom-width", "4px"],
      ["border-left-style", "dotted"],
    ]);
    split();
    expect(field("border width").value).toBe("");
    expect(field("border width").placeholder).toBe("Mixed");
  });

  it("opens on the sides when they differ (Tailwind's border-b over the reset's 0)", () => {
    declared = { "border-width": "0px", "border-style": "solid", "border-bottom-width": "1px" };
    mount();
    expect(field("border bottom width").value).toBe("1px");
    expect(field("border top width").value).toBe("0px");
  });

  it("a style only a reset gives (Tailwind's `border: 0 solid`) shows as not set, dimmed; a width then adds no style", () => {
    declared = { "border-width": "0px", "border-style": "solid" };
    reset = new Set(["border-width", "border-style"]);
    mount();
    expect(select("border style").querySelector(".style-unset")).toBeTruthy();
    // Its width too: dimmed, as the placeholder.
    expect(field("border width").value).toBe("");
    expect(field("border width").placeholder).toBe("0px");
    typeAndEnter("border width", "2");
    expect(changes).toEqual([["border-width", "2px"]]);
  });

  it("cleared on every side, it's cleared on each side too, one undo step", () => {
    declared = { "border-width": "2px" };
    mount();
    typeAndEnter("border width", "");
    expect(changes.map(([p, v]) => `${p}:${v}`)).toEqual([
      "border-width:",
      "border-top-width:",
      "border-right-width:",
      "border-bottom-width:",
      "border-left-width:",
    ]);
  });

  it("found by its properties and Tailwind's classes; in Appearance, after the background", () => {
    for (const q of ["border", "border-width", "border-style", "border-color", "border-dashed", "border-b", "border-top-width"]) {
      expect(matchEditors(q)[0]?.id).toBe("border");
    }
    expect(groupOf("border")).toBe("Appearance");
    expect(clearsView("border")).toBe(true);
  });
});
