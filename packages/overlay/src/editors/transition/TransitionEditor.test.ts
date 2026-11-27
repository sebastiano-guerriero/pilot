// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { propertiesOf } from "../types.ts";
import { matchEditors } from "../registry.ts";
import { settleFactor, springEasing } from "./spring.ts";
import { transitionEditor } from "./TransitionEditor.tsx";

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
/** The page's own CSS. */
let page: Record<string, string>;
let changes: Array<[string, string]>;

// Stands in for the dialog: what the fields show is Pilot's value over the page's (history.valueOf, which reads a
// longhand out of Pilot's shorthand too), what Pilot sets itself, and the page's own.
const mount = () =>
  act(() => {
    const properties = propertiesOf(transitionEditor);
    const declared = Object.fromEntries(properties.map((p) => [p, history.valueOf(element, p, "base") ?? page[p] ?? ""]));
    const own = new Set(properties.filter((p) => history.setsItself(element, p, "base")));
    render(
      h(transitionEditor.component, {
        element,
        values: {},
        declared,
        page: Object.fromEntries(properties.map((p) => [p, page[p] ?? ""])),
        own,
        onChange: (p: string, v: string, o?: { gesture?: object; again?: boolean }) => {
          changes.push([p, v]);
          history.apply(element, p, v, o?.gesture, { again: o?.again });
          mount();
        },
      }),
      container,
    );
  });

beforeEach(() => {
  history = new EditHistory();
  page = {};
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
const openChip = (i: number) => act(() => (container.querySelectorAll(".layer-chip-open")[i] as HTMLButtonElement).click());
const chips = () => [...container.querySelectorAll(".layer-chip-name")].map((e) => e.textContent);
const rowLabels = () => [...container.querySelectorAll(".transition-editor .property-label")].filter((e) => !e.closest(".property-panel")).map((e) => e.textContent);
const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const footer = () => container.querySelector(".property-panel")?.textContent ?? "";
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
const pick = (select: string, option: string) => {
  act(() => (container.querySelector(`[aria-label="${select}"]`) as HTMLButtonElement).click());
  const item = [...container.querySelectorAll('[role="option"]')].find((o) => o.querySelector(".label .text")?.textContent === option);
  act(() => (item as HTMLElement).click());
};
const recorded = () => history.changes().map((c) => [c.property, c.value]);

describe("transition: the panels' transitions and the rows, two separate things", () => {
  it("+ adds opacity with Tailwind's 150ms, as the shorthand, one undo step; the rows stay empty", () => {
    mount();
    expect(rowLabels()).toEqual(["transition", "duration", "easing", "delay"]);
    add();
    expect(changes).toEqual([["transition", "opacity 150ms"]]);
    expect(chips()).toEqual(["opacity150ms"]);
    expect(field("transition duration").value).toBe("");
    expect(field("transition duration").placeholder).toBe("0s");
    expect(field("transition delay").placeholder).toBe("0s");
    expect(field("opacity duration").value).toBe("150ms");
    act(() => {
      history.undo();
    });
    expect(history.changes()).toEqual([]);
  });

  it("a panel edits only its transition; a row only its longhand, over every transition's, and the panel says so", () => {
    mount();
    add();
    add();
    // The second transition's own duration: the shorthand, nothing else.
    type("transform duration", "500");
    expect(changes.at(-1)).toEqual(["transition", "opacity 150ms, transform 500ms"]);
    expect(field("transition duration").value).toBe("");
    // The row: its longhand, on its own. The panel keeps its own value, and says the row applies over it.
    type("transition duration", "300");
    expect(changes.at(-1)).toEqual(["transition-duration", "300ms"]);
    expect(field("transform duration").value).toBe("500ms");
    expect(footer()).toContain("The duration row applies to every transition, over this one's.");
    // A panel edit again: the shorthand, then the row again after it, so it still applies.
    type("transform duration", "600");
    expect(changes.slice(-2)).toEqual([
      ["transition", "opacity 150ms, transform 600ms"],
      ["transition-duration", "300ms"],
    ]);
    expect(recorded()).toEqual([
      ["transition", "opacity 150ms, transform 600ms"],
      ["transition-duration", "300ms"],
    ]);
    // The row cleared: the panels' apply again (the shorthand after it).
    type("transition duration", "");
    expect(recorded()).toEqual([["transition", "opacity 150ms, transform 600ms"]]);
  });

  it("with no easing of its own (Select), a panel shows no graph", () => {
    page = { transition: "opacity 500ms" };
    mount();
    openChip(0);
    expect(container.querySelector(".easing-graph")).toBeNull();
    expect(field("opacity easing curve numbers")).toBeNull();
  });

  it("a new transition, with a duration row set, gets no duration of its own", () => {
    mount();
    type("transition duration", "300");
    add();
    expect(changes.slice(-2)).toEqual([
      ["transition", "opacity"],
      ["transition-duration", "300ms"],
    ]);
  });

  it("the page's shorthand: its transitions with their timing, the rows empty", () => {
    page = { transition: "opacity 0.3s ease-out", "transition-property": "opacity", "transition-duration": "0.3s", "transition-timing-function": "ease-out" };
    mount();
    expect(chips()).toEqual(["opacity0.3s"]);
    expect(field("transition duration").value).toBe("");
    openChip(0);
    expect(field("opacity duration").value).toBe("0.3s");
  });

  it("Tailwind's longhands: the property list's transitions, and its duration a row", () => {
    page = { "transition-property": "opacity, transform", "transition-duration": "150ms" };
    mount();
    expect(chips()).toEqual(["opacity", "transform"]);
    expect(field("transition duration").value).toBe("150ms");
    openChip(1);
    expect(field("transform duration").value).toBe("");
    expect(field("transform duration").placeholder).toBe("150ms");
    // Its own: the shorthand, and the page's row written after it, so it still applies.
    type("transform duration", "500");
    expect(changes).toEqual([
      ["transition", "opacity, transform 500ms"],
      ["transition-duration", "150ms"],
    ]);
  });

  it("× takes one off; the last takes the transition", () => {
    mount();
    add();
    add();
    const remove = () => act(() => (container.querySelector(".layer-chip-remove") as HTMLButtonElement).click());
    remove();
    expect(changes.at(-1)).toEqual(["transition", "transform 150ms"]);
    remove();
    expect(changes.at(-1)).toEqual(["transition", ""]);
    expect(chips()).toEqual([]);
  });

  it("custom: any other property, its name beside the select, past a line in the menu", () => {
    page = { transition: "opacity 0.2s, grid-template-rows 0.2s" };
    mount();
    openChip(1);
    expect(field("custom transition property").value).toBe("grid-template-rows");
    expect(field("custom transition property").placeholder).toBe("padding");
    type("custom transition property", "--Progress");
    expect(changes.at(-1)).toEqual(["transition", "opacity 0.2s, --Progress 0.2s"]);
    act(() => (container.querySelector('[aria-label="transition property"]') as HTMLButtonElement).click());
    const menu = [...container.querySelectorAll('[role="listbox"] > *')].map((o) =>
      o.getAttribute("role") === "separator" ? "—" : o.querySelector(".label")?.textContent,
    );
    expect(menu.slice(-4)).toEqual(["height", "—", "custom", "none"]);
  });

  it("none is its own chip, with no + under it, and no rows", () => {
    page = { transition: "none" };
    mount();
    expect(chips()).toEqual(["none"]);
    expect(container.querySelector(".layer-add")).toBeNull();
    expect(rowLabels()).toEqual(["transition"]);
  });

  it("easing: a keyword's curve to drag; a spring keeps its duration as felt; a row draws only its own", () => {
    page = { transition: "opacity 500ms ease-out" };
    mount();
    // A row with nothing set: no graph.
    expect(container.querySelector(".easing-graph")).toBeNull();
    openChip(0);
    act(() => (container.querySelector('[aria-label="opacity easing"]') as HTMLButtonElement).click());
    const options = [...container.querySelectorAll('[role="option"] .label .text')].map((o) => o.textContent);
    act(() => (container.querySelector('[aria-label="opacity easing"]') as HTMLButtonElement).click());
    expect(options).toEqual(["Select", "linear", "ease", "ease-in", "ease-out", "ease-in-out", "spring", "custom"]);
    // A keyword: its curve to drag, and its numbers.
    expect(container.querySelectorAll(".property-panel .easing-graph .handle").length).toBe(2);
    expect(field("opacity easing curve numbers").value).toBe("0, 0, 0.58, 1");
    pick("opacity easing", "spring");
    expect(changes.at(-1)).toEqual(["transition", `opacity ${Math.round(500 * settleFactor(30))}ms ${springEasing(30)}`]);
    expect(field("opacity duration").value).toBe("500ms");
    // Its graph: a square, the same at any bounce.
    const viewBox = () => container.querySelector(".property-panel .easing-graph svg")?.getAttribute("viewBox");
    expect(viewBox()).toBe("0 0 128 128");
    // No dashed frame: dashed lines across at its start (0) and rest (1).
    expect(container.querySelector(".property-panel .easing-graph rect.frame")).toBeNull();
    expect(container.querySelectorAll(".property-panel .easing-graph line.guide").length).toBe(2);
    // And a fainter pattern every 0.25, up to the most bounce's overshoot: 0.25, 0.5, 0.75, 1.25, 1.5.
    expect(container.querySelectorAll(".property-panel .easing-graph line.grid").length).toBe(5);
    // Its bounce has the wheel.
    expect(field("opacity spring bounce").closest(".scrub-field")?.querySelector(".scrub-handle")).toBeTruthy();
    type("opacity spring bounce", "60");
    expect(changes.at(-1)).toEqual(["transition", `opacity ${Math.round(500 * settleFactor(60))}ms ${springEasing(60)}`]);
    expect(field("opacity duration").value).toBe("500ms");
    expect(viewBox()).toBe("0 0 128 128");
    // At most 80%.
    type("opacity spring bounce", "95");
    expect(field("opacity spring bounce").value).toBe("80%");
  });

  it("a cubic-bezier: the select says so; its numbers typed back onto a keyword's curve give the keyword", () => {
    page = { transition: "opacity 500ms cubic-bezier(0.1, 1.33, 0.25, 1)" };
    mount();
    openChip(0);
    expect(container.querySelector('[aria-label="opacity easing"] .value .text')?.textContent).toBe("cubic-bezier");
    expect(field("opacity easing curve numbers").value).toBe("0.1, 1.33, 0.25, 1");
    type("opacity easing curve numbers", "0, 0, 0.58, 1");
    expect(changes.at(-1)).toEqual(["transition", "opacity 500ms ease-out"]);
    // A square, dotted lines at 0 and 1 (no frame), centered with room for overshoot; a handle further out keeps
    // the square, bringing the lines closer, and nothing is cut.
    const svg = () => container.querySelector(".property-panel .easing-graph svg") as SVGSVGElement;
    const gap = () => {
      const [one, zero] = [...svg().querySelectorAll("line.guide")].map((l) => Number(l.getAttribute("y1"))).sort((a, b) => a - b);
      return (zero as number) - (one as number);
    };
    expect(svg().getAttribute("viewBox")).toBe("0 0 128 128");
    expect(svg().querySelector("rect")).toBeNull();
    const before = gap();
    type("opacity easing curve numbers", "0.3, -1, 0.7, 2");
    expect(changes.at(-1)).toEqual(["transition", "opacity 500ms cubic-bezier(0.3, -1, 0.7, 2)"]);
    expect(svg().getAttribute("viewBox")).toBe("0 0 128 128");
    expect(gap()).toBeLessThan(before);
  });

  it("found by Tailwind's transition-*; duration-*, ease-* and delay-* find their own rows alone", () => {
    expect(matchEditors("transition-opacity").map((e) => e.id)).toEqual(["transition"]);
    expect(matchEditors("transition").map((e) => e.id)).toEqual(["transition"]);
    expect(matchEditors("duration-300").map((e) => e.id)).toEqual(["transition-duration"]);
    expect(matchEditors("ease-out").map((e) => e.id)).toEqual(["transition-timing-function"]);
    expect(matchEditors("delay").map((e) => e.id)).toEqual(["transition-delay"]);
  });
});
