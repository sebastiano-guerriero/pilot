// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { clearsView, groupOf } from "../listOrder.ts";
import { matchEditors } from "../registry.ts";
import { boxShadowEditor, swatchLook } from "./BoxShadowEditor.tsx";
import { type BoxShadow, parseBoxShadow } from "./boxShadow.ts";
import { smoothLayers } from "./smooth.ts";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let declared: Record<string, string>;
let changes: Array<[string, string]>;

// The editor reads what the element declares from `declared` (the dialog's job).
const mount = () =>
  act(() => {
    render(
      h(boxShadowEditor.component, {
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
const pickType = (name: string) => {
  act(() => (container.querySelector('[role="combobox"][aria-label="shadow type"]') as HTMLButtonElement).click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.querySelector(".label")?.firstChild?.textContent === name);
  act(() => (option as HTMLElement).click());
};

describe("box-shadow", () => {
  it("+ adds Tailwind's shadow-md layer, without a spread, and opens its panel: type, mode (manual), x, y, blur, spread, color, and the type's help", () => {
    mount();
    add();
    expect(changes).toEqual([["box-shadow", "0px 4px 6px #0000001a"]]);
    expect(chips()).toEqual(["outer 0px 4px 6px"]);
    expect(panel()?.getAttribute("aria-label")).toBe("Box Shadow");
    const labels = [...(panel()?.querySelectorAll(".property-label") ?? [])].map((l) => l.textContent);
    expect(labels).toEqual(["type", "mode", "x", "y", "blur", "spread", "color"]);
    expect(panel()?.querySelector(".footer")?.textContent).toMatch(/^Cast outside/);
  });

  it("each part writes the shadow; inset keeps the parts", () => {
    mount();
    add();
    typeAndEnter("shadow spread", "2");
    expect(changes.at(-1)).toEqual(["box-shadow", "0px 4px 6px 2px #0000001a"]);
    pickType("inset");
    expect(changes.at(-1)).toEqual(["box-shadow", "inset 0px 4px 6px 2px #0000001a"]);
    expect(chips()).toEqual(["inset 0px 4px 6px 2px"]);
  });

  it("shadows stack; none is the whole value; × on the last chip declares nothing", () => {
    declared["box-shadow"] = "0 1px 2px red, inset 0 0 4px blue";
    mount();
    expect(chips()).toEqual(["outer 0px 1px 2px", "inset 0px 0px 4px"]);
    act(() => (container.querySelector(".layer-chip-open") as HTMLButtonElement).click());
    pickType("none");
    expect(changes.at(-1)).toEqual(["box-shadow", "none"]);
    act(() => (container.querySelector(".layer-chip-remove") as HTMLButtonElement).click());
    expect(changes.at(-1)).toEqual(["box-shadow", ""]);
  });

  it("a manual or custom chip shows its whole value on hover (the color too); a smooth one doesn't", () => {
    declared["box-shadow"] = ["var(--shadow-card)", "0 1px 2px red", ...smoothLayers({ distance: 10, direction: 180, elevation: 10, layers: 4, color: "#00000040" }, false)].join(", ");
    mount();
    const tips = [...container.querySelectorAll(".layer-chip")].map((c) => c.querySelector(".tooltip")?.textContent ?? null);
    expect(tips).toEqual(["var(--shadow-card)", "0px 1px 2px red", null]);
  });

  it("each chip has a swatch of its kind: outer, inset, a 1px ring, or mask's none icon", () => {
    const look = (value: string) => (parseBoxShadow(value) as BoxShadow[]).map(swatchLook);
    expect(look("0 4px 6px red, inset 0 2px 4px blue")).toEqual(["outer", "inset"]);
    expect(look("0 0 0 1px red, inset 0 0 0 1px red")).toEqual(["ring", "inset-ring"]);
    // A ring is only a 1px spread: anything else is the plain kind.
    expect(look("0 0 0 2px red, 0 1px 0 1px red")).toEqual(["outer", "outer"]);
    expect(look(smoothLayers({ distance: 10, direction: 180, elevation: 10, layers: 4, color: "#00000040" }, true).join(", "))).toEqual(["inset"]);
    expect(look("var(--shadow)")).toEqual(["plain"]);
    declared["box-shadow"] = "0 0 0 1px red, inset 0 2px 4px blue";
    mount();
    expect([...container.querySelectorAll(".layer-chip .shadow-icon")].map((s) => s.getAttribute("data-look"))).toEqual(["ring", "inset"]);
    declared["box-shadow"] = "none";
    mount();
    expect(container.querySelector(".layer-chip svg")).not.toBeNull();
  });

  it("a shadow that doesn't split (a variable) is a custom chip, with its CSS", () => {
    declared["box-shadow"] = "var(--shadow)";
    mount();
    expect(chips()).toEqual(["custom var(--shadow)"]);
    act(() => (container.querySelector(".layer-chip-open") as HTMLButtonElement).click());
    act(() => (container.querySelector('[role="combobox"][aria-label="shadow type"]') as HTMLButtonElement).click());
    const options = [...container.querySelectorAll('[role="option"] .label')].map((o) => o.firstChild?.textContent);
    expect(options).toEqual(["outer", "inset", "custom", "none"]);
  });

  it("custom can be picked: it starts from the shadow's CSS, and takes any shadow or a variable", () => {
    mount();
    add();
    pickType("custom");
    expect(changes.at(-1)).toEqual(["box-shadow", "0px 4px 6px #0000001a"]);
    expect(field("shadow value").value).toBe("0px 4px 6px #0000001a");
    typeAndEnter("shadow value", "var(--shadow-card)");
    expect(changes.at(-1)).toEqual(["box-shadow", "var(--shadow-card)"]);
    expect(chips()).toEqual(["custom var(--shadow-card)"]);
  });

  it("smooth: one chip; distance, direction (the dial), layers and color write its layers; manual and back", () => {
    mount();
    add();
    act(() => {
      const select = container.querySelector('[role="combobox"][aria-label="shadow mode"]') as HTMLButtonElement;
      select.click();
    });
    act(() => ([...container.querySelectorAll('[role="option"]')].find((o) => o.textContent === "smooth") as HTMLElement).click());
    // The manual shadow's offset (0 4px) becomes the distance and direction; its color stays.
    const labels = [...(panel()?.querySelectorAll(".property-label") ?? [])].map((l) => l.textContent);
    expect(labels).toEqual(["type", "mode", "direction", "distance", "elevation", "layers", "color"]);
    expect(field("shadow distance").value).toBe("4px");
    expect(field("shadow direction").value).toBe("180deg");
    // The manual shadow's blur (6px) becomes the elevation.
    expect(field("shadow elevation").value).toBe("6px");
    expect(panel()?.querySelector(".scrub-handle[data-dial]")).not.toBeNull();
    expect(chips()).toEqual(["outer smooth"]);
    typeAndEnter("shadow distance", "12");
    typeAndEnter("shadow layers", "3");
    expect(changes.at(-1)?.[1].split(", ")).toHaveLength(3);
    expect(chips()).toEqual(["outer smooth"]);
    pickType("inset");
    expect(changes.at(-1)?.[1].startsWith("inset ")).toBe(true);
    expect(panel()?.querySelector('[aria-label="shadow mode"]')?.textContent).toBe("smooth");
    // And back to manual: its outermost layer, one shadow, which stays manual (read back, it isn't smooth).
    act(() => (container.querySelector('[role="combobox"][aria-label="shadow mode"]') as HTMLButtonElement).click());
    act(() => ([...container.querySelectorAll('[role="option"]')].find((o) => o.textContent === "manual") as HTMLElement).click());
    expect(changes.at(-1)?.[1].split(", ")).toHaveLength(1);
    expect(panel()?.querySelector('[aria-label="shadow mode"]')?.textContent).toBe("manual");
    expect(chips()[0]?.startsWith("inset ")).toBe(true);
    expect(chips()[0]).not.toContain("smooth");
  });

  it("smooth stays smooth at distance 0, and keeps the direction set for when it grows again", () => {
    mount();
    add();
    act(() => (container.querySelector('[role="combobox"][aria-label="shadow mode"]') as HTMLButtonElement).click());
    act(() => ([...container.querySelectorAll('[role="option"]')].find((o) => o.textContent === "smooth") as HTMLElement).click());
    typeAndEnter("shadow direction", "-30");
    typeAndEnter("shadow distance", "0");
    expect(chips()).toEqual(["outer smooth"]);
    expect(field("shadow direction").value).toBe("-30deg");
    typeAndEnter("shadow distance", "10");
    expect(field("shadow direction").value).toBe("-30deg");
    expect(chips()).toEqual(["outer smooth"]);
  });

  it("is found by shadow and Tailwind's classes, not drop-shadow; in Effects, hiding the highlights", () => {
    for (const q of ["box-shadow", "shadow", "shadow-md", "inset-shadow", "shadow-none"]) {
      expect(matchEditors(q).map((e) => e.id), q).toEqual(["box-shadow"]);
    }
    expect(matchEditors("drop-shadow").map((e) => e.id)).toEqual(["filter"]);
    expect(groupOf("box-shadow")).toBe("Effects");
    expect(clearsView("box-shadow")).toBe(true);
  });
});
