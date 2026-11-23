// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { matchEditors } from "../registry.ts";
import { maskImageEditor } from "./MaskImageEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let declared: Record<string, string>;
let changes: Array<[string, string]>;

// The editor reads what the element declares from `declared` (the dialog's
// job: history values over the page's), so this stands in for it.
const mount = () =>
  act(() => {
    render(
      h(maskImageEditor.component, {
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
const panel = () => container.querySelector(".property-panel");

describe("mask-image", () => {
  it("+ adds Tailwind's mask-b-from-50%, with mask-composite: intersect, as one undo step, and opens its panel", () => {
    mount();
    expect(chips()).toEqual([]);
    add();
    expect(changes).toEqual([
      ["mask-image", "linear-gradient(to bottom, black 50%, transparent)"],
      ["mask-composite", "intersect"],
    ]);
    expect(chips()).toEqual(["linear"]);
    expect(panel()?.getAttribute("aria-label")).toBe("Mask Image");
    act(() => {
      history.undo();
    });
    expect(history.changes()).toEqual([]);
  });

  it("+ again stacks another mask; × takes one off, and the last one clears it all (the element declares none)", () => {
    declared["mask-image"] = "linear-gradient(to bottom, black 50%, transparent)";
    declared["mask-composite"] = "intersect";
    mount();
    add();
    expect(changes.at(-1)?.[1]).toBe("linear-gradient(to bottom, black 50%, transparent), linear-gradient(to bottom, black 50%, transparent)");
    expect(chips()).toEqual(["linear", "linear"]);
    const remove = () => act(() => (container.querySelector(".layer-chip-remove") as HTMLButtonElement).click());
    remove();
    remove();
    expect(changes.slice(-2)).toEqual([
      ["mask-image", ""],
      ["mask-composite", ""],
    ]);
    expect(chips()).toEqual([]);
  });

  it("a mask the page sets some other way is a custom chip; none is its own", () => {
    declared["mask-image"] = "url(mask.svg)";
    mount();
    expect(chips()).toEqual(["custom"]);
    declared["mask-image"] = "none";
    mount();
    expect(chips()).toEqual(["none"]);
  });

  it("is found by mask-image, mask and Tailwind's mask classes", () => {
    for (const q of ["mask-image", "mask", "mask-linear", "mask-b"]) {
      expect(matchEditors(q).map((e) => e.id), q).toContain("mask-image");
    }
  });
});
