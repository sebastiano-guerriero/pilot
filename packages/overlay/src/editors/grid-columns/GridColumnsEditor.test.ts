// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import type { FocusRequest } from "../types.ts";
import { tracksCount, tracksMode, tracksValue, parseCustomTracks } from "./TracksRow.tsx";
import { gridColumnsEditor } from "./GridColumnsEditor.tsx";
import { gridRowsEditor } from "../grid-rows/GridRowsEditor.tsx";
import { inlinePreview } from "../../test/inlinePreview.ts";

const GridColumnsEditor = gridColumnsEditor.component;

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;
let tabbedOut: Array<1 | -1>;
let inspects: unknown[];

const mount = (focusRequest?: FocusRequest) =>
  act(() => {
    render(
      h(GridColumnsEditor, {
        element,
        values: { display: "block", "grid-template-columns": "none", gap: "normal" },
        onChange: (p: string, v: string) => {
          changes.push([p, v]);
          history.apply(element, p, v);
          mount(); // the dialog re-renders after a change
        },
        focusRequest,
        onTabOut: (d: 1 | -1) => tabbedOut.push(d),
        onInspect: (areas: unknown) => inspects.push(areas),
      }),
      container,
    );
  });

beforeEach(() => {
  history = new EditHistory(inlinePreview());
  changes = [];
  tabbedOut = [];
  inspects = [];
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

/** A select by its label. */
const select = (label = "grid-columns") => container.querySelector(`[role="combobox"][aria-label="${label}"]`) as HTMLButtonElement;
/** What the select shows: its value, or "" for the dimmed "Select". */
const shown = () => {
  const value = select().querySelector(".value") as HTMLElement;
  return value.classList.contains("placeholder") ? "" : value.textContent;
};
const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;
const labels = () => [...container.querySelectorAll(".property-label")].map((l) => l.textContent);
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label");
/** Open a select's menu and click an option; "" clears the value with Backspace. */
const pick = (value: string, label = "grid-columns") => {
  if (!value) return key(select(label), "Backspace");
  act(() => select(label).click());
  const option = [...container.querySelectorAll('[role="option"]')].find((o) => o.textContent === value) as HTMLElement;
  act(() => option.click());
};
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  });
const typeAndEnter = (label: string, text: string) => {
  const input = field(label) as HTMLInputElement;
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  key(input, "Enter");
};

describe("grid-columns", () => {
  it("with nothing set, shows repeat and 1 (CSS grid's default), writing nothing", () => {
    element.style.display = "grid";
    mount();
    expect(select("grid-columns").textContent).toBe("repeat");
    expect(field("column count")?.value).toBe("1");
    expect(changes).toEqual([]);
  });

  it("there's no Select option, and Backspace on the select does nothing", () => {
    element.style.display = "grid";
    mount();
    act(() => select("grid-columns").click());
    const options = [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options).toEqual(["repeat", "custom", "subgrid", "none"]);
    act(() => select("grid-columns").click());
    element.style.gridTemplateColumns = "subgrid";
    mount();
    key(select("grid-columns"), "Backspace");
    expect(changes).toEqual([]);
  });

  it("repeat: a count writes equal columns, shown back as the number", () => {
    element.style.display = "grid";
    mount();
    typeAndEnter("column count", "3");
    expect(changes).toEqual([["grid-template-columns", "repeat(3, minmax(0, 1fr))"]]);
    expect(field("column count")?.value).toBe("3");
  });

  it("repeat: clearing the count goes back to the default, 1", () => {
    element.style.display = "grid";
    mount();
    typeAndEnter("column count", "3");
    typeAndEnter("column count", "");
    expect(changes.at(-1)).toEqual(["grid-template-columns", ""]);
    expect(field("column count")?.value).toBe("1");
  });

  it("repeat: a value Pilot wrote is read back as repeat with its count", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(4, minmax(0px, 1fr))";
    mount();
    expect(select("grid-columns").textContent).toBe("repeat");
    expect(field("column count")?.value).toBe("4");
  });

  it("repeat: anything but a whole number from 1 is ignored", () => {
    element.style.display = "grid";
    mount();
    for (const text of ["0", "-2", "1.5", "1fr 2fr", "abc"]) typeAndEnter("column count", text);
    expect(changes).toEqual([]);
  });

  it("repeat: ↑/↓ add or remove one column, never below 1, from the default 1", () => {
    element.style.display = "grid";
    mount();
    act(() => field("column count")?.focus());
    for (const k of ["ArrowDown", "ArrowUp", "ArrowUp", "ArrowDown"]) key(field("column count") as HTMLInputElement, k);
    // ↓ at the default 1 writes nothing; then 2, 3, 2.
    expect(changes.map(([, v]) => tracksCount(v))).toEqual(["2", "3", "2"]);
  });

  it("custom: any valid CSS, shown as it is", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    mount();
    pick("custom", "grid-columns");
    // Switching to custom starts from the current value, to edit it.
    expect(field("custom columns")?.value).toBe(element.style.gridTemplateColumns);
    typeAndEnter("custom columns", "1fr   2fr");
    expect(changes).toEqual([["grid-template-columns", "1fr 2fr"]]);
    expect(select("grid-columns").textContent).toBe("custom");
    expect(field("custom columns")?.value).toBe("1fr 2fr");
  });

  it("subgrid and none are written right away, with no field; repeat brings back 1 column", () => {
    element.style.display = "grid";
    mount();
    pick("subgrid", "grid-columns");
    expect(field("column count")).toBeNull();
    expect(field("custom columns")).toBeNull();
    pick("none", "grid-columns");
    pick("repeat", "grid-columns");
    expect(changes).toEqual([
      ["grid-template-columns", "subgrid"],
      ["grid-template-columns", "none"],
      ["grid-template-columns", "repeat(1, minmax(0, 1fr))"],
    ]);
    expect(field("column count")?.value).toBe("1");
  });

  it("picking custom writes nothing until typed; undoing clears the picked mode", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "subgrid";
    mount();
    pick("custom", "grid-columns");
    expect(changes).toEqual([]);
    expect(field("custom columns")?.value).toBe("");
    pick("none", "grid-columns");
    act(() => {
      history.undo();
    });
    mount();
    expect(select("grid-columns").textContent).toBe("subgrid");
    expect(field("custom columns")).toBeNull();
  });

  it("Tab goes select → count, then out of the editor", () => {
    mount({ query: "cols" });
    expect(focused()).toBe("grid-columns");
    key(select(), "Tab");
    expect(focused()).toBe("column count");
    key(field("column count") as HTMLInputElement, "Tab");
    expect(tabbedOut).toEqual([1]);
  });
});

describe("grid-rows", () => {
  const mountRows = () =>
    act(() => {
      render(
        h(gridRowsEditor.component, {
          element,
          values: {},
          onChange: (p: string, v: string) => {
            changes.push([p, v]);
            history.apply(element, p, v);
            mountRows();
          },
        }),
        container,
      );
    });

  it("with nothing set, shows repeat and an empty count (auto: as many rows as the items need)", () => {
    element.style.display = "grid";
    mountRows();
    expect(select("grid-rows").textContent).toBe("repeat");
    expect(field("row count")?.value).toBe("");
    expect(field("row count")?.placeholder).toBe("auto");
    expect(changes).toEqual([]);
  });

  it("a count writes equal rows; 1 is written too, since it isn't the default", () => {
    element.style.display = "grid";
    mountRows();
    typeAndEnter("row count", "1");
    expect(changes).toEqual([["grid-template-rows", "repeat(1, minmax(0, 1fr))"]]);
    typeAndEnter("row count", "3");
    expect(element.style.gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))");
    expect(field("row count")?.value).toBe("3");
  });

  it("↑ on the empty count is one row; ↓ writes nothing", () => {
    element.style.display = "grid";
    mountRows();
    key(field("row count") as HTMLInputElement, "ArrowDown");
    expect(changes).toEqual([]);
    key(field("row count") as HTMLInputElement, "ArrowUp");
    expect(changes).toEqual([["grid-template-rows", "repeat(1, minmax(0, 1fr))"]]);
  });

  it("custom: checked as grid-template-rows", () => {
    expect(parseCustomTracks("grid-template-rows", " auto   1fr ")).toBe("auto 1fr");
  });
});

describe("columns value", () => {
  it("tells the mode from the value", () => {
    expect(["", "repeat(3, minmax(0, 1fr))", "subgrid", "none", "1fr 2fr", "repeat(3, 1fr)"].map(tracksMode)).toEqual([
      "",
      "repeat",
      "subgrid",
      "none",
      "custom",
      "custom", // only Pilot's own repeat is a count
    ]);
  });

  it("custom: cleared removes, whitespace is tidied", () => {
    expect(parseCustomTracks("grid-template-columns", "  ")).toBe("");
    expect(parseCustomTracks("grid-template-columns", " 1fr   200px ")).toBe("1fr 200px");
  });

  it("round-trips, including the browser's minmax(0px, …)", () => {
    expect(tracksValue(4)).toBe("repeat(4, minmax(0, 1fr))");
    expect(tracksCount("repeat(4, minmax(0, 1fr))")).toBe("4");
    expect(tracksCount("repeat(4, minmax(0px, 1fr))")).toBe("4");
    expect(tracksCount("1fr 2fr")).toBeNull();
  });
});
