// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { matchEditors } from "../registry.ts";
import type { FocusRequest } from "../types.ts";
import { columnsCount, columnsMode, columnsValue, parseCustomColumns } from "./ColumnsRow.tsx";
import { displayEditor } from "./DisplayEditor.tsx";

const DisplayEditor = displayEditor.component;

let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;
let tabbedOut: Array<1 | -1>;
let inspects: unknown[];

const mount = (focusRequest?: FocusRequest) =>
  act(() => {
    render(
      h(DisplayEditor, {
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
  history = new EditHistory();
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

/** A select by its label: "display" (the first one) or "columns". */
const select = (label = "display") => container.querySelector(`[role="combobox"][aria-label="${label}"]`) as HTMLButtonElement;
/** What the select shows: its value, or "" for the dimmed "Select". */
const shown = () => {
  const value = select().querySelector(".value") as HTMLElement;
  return value.classList.contains("placeholder") ? "" : value.textContent;
};
const field = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null;
const labels = () => [...container.querySelectorAll(".property-label")].map((l) => l.textContent);
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label");
/** Open a select's menu and click an option; "" clears the value with Backspace. */
const pick = (value: string, label = "display") => {
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

describe("display select", () => {
  it("says Select when no display is set, never the computed one", () => {
    mount();
    expect(shown()).toBe("");
    expect(select().textContent).toBe("Select");
    expect(labels()).toEqual(["display"]);
  });

  it("picking a value sets it; Backspace removes it", () => {
    mount();
    pick("flex");
    pick("");
    expect(changes).toEqual([
      ["display", "flex"],
      ["display", ""],
    ]);
    expect(element.style.display).toBe("");
  });

  it("shows a value set some other way, even if it isn't offered", () => {
    element.style.display = "table";
    mount();
    expect(shown()).toBe("table");
  });
});

describe("grid rows", () => {
  it("appear only for grid and inline-grid", () => {
    mount();
    pick("grid");
    expect(labels()).toEqual(["display", "columns", "gap"]);
    pick("inline-grid");
    expect(labels()).toEqual(["display", "columns", "gap"]);
    pick("flex");
    expect(labels()).toEqual(["display"]);
  });

  it("undoing back past grid hides them again", () => {
    mount();
    pick("grid");
    act(() => {
      history.undo();
    });
    mount();
    expect(labels()).toEqual(["display"]);
  });

  it("columns: with nothing set, shows repeat and 1 (CSS grid's default), writing nothing", () => {
    element.style.display = "grid";
    mount();
    expect(select("columns").textContent).toBe("repeat");
    expect(field("column count")?.value).toBe("1");
    expect(changes).toEqual([]);
  });

  it("columns: there's no Select option, and Backspace on the select does nothing", () => {
    element.style.display = "grid";
    mount();
    act(() => select("columns").click());
    const options = [...container.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options).toEqual(["repeat", "custom", "subgrid", "none"]);
    act(() => select("columns").click());
    element.style.gridTemplateColumns = "subgrid";
    mount();
    key(select("columns"), "Backspace");
    expect(changes).toEqual([]);
  });

  it("columns, repeat: a count writes equal columns, shown back as the number", () => {
    element.style.display = "grid";
    mount();
    typeAndEnter("column count", "3");
    expect(changes).toEqual([["grid-template-columns", "repeat(3, minmax(0, 1fr))"]]);
    expect(field("column count")?.value).toBe("3");
  });

  it("columns, repeat: clearing the count goes back to the default, 1", () => {
    element.style.display = "grid";
    mount();
    typeAndEnter("column count", "3");
    typeAndEnter("column count", "");
    expect(changes.at(-1)).toEqual(["grid-template-columns", ""]);
    expect(field("column count")?.value).toBe("1");
  });

  it("columns, repeat: a value Pilot wrote is read back as repeat with its count", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(4, minmax(0px, 1fr))";
    mount();
    expect(select("columns").textContent).toBe("repeat");
    expect(field("column count")?.value).toBe("4");
  });

  it("columns, repeat: anything but a whole number from 1 is ignored", () => {
    element.style.display = "grid";
    mount();
    for (const text of ["0", "-2", "1.5", "1fr 2fr", "abc"]) typeAndEnter("column count", text);
    expect(changes).toEqual([]);
  });

  it("columns, repeat: ↑/↓ add or remove one column, never below 1, from the default 1", () => {
    element.style.display = "grid";
    mount();
    act(() => field("column count")?.focus());
    for (const k of ["ArrowDown", "ArrowUp", "ArrowUp", "ArrowDown"]) key(field("column count") as HTMLInputElement, k);
    // ↓ at the default 1 writes nothing; then 2, 3, 2.
    expect(changes.map(([, v]) => columnsCount(v))).toEqual(["2", "3", "2"]);
  });

  it("columns, custom: any valid CSS, shown as it is", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
    mount();
    pick("custom", "columns");
    // Switching to custom starts from the current value, to edit it.
    expect(field("custom columns")?.value).toBe(element.style.gridTemplateColumns);
    typeAndEnter("custom columns", "1fr   2fr");
    expect(changes).toEqual([["grid-template-columns", "1fr 2fr"]]);
    expect(select("columns").textContent).toBe("custom");
    expect(field("custom columns")?.value).toBe("1fr 2fr");
  });

  it("columns: subgrid and none are written right away, with no field; repeat brings back 1 column", () => {
    element.style.display = "grid";
    mount();
    pick("subgrid", "columns");
    expect(field("column count")).toBeNull();
    expect(field("custom columns")).toBeNull();
    pick("none", "columns");
    pick("repeat", "columns");
    expect(changes).toEqual([
      ["grid-template-columns", "subgrid"],
      ["grid-template-columns", "none"],
      ["grid-template-columns", "repeat(1, minmax(0, 1fr))"],
    ]);
    expect(field("column count")?.value).toBe("1");
  });

  it("columns: picking custom writes nothing until typed; undoing clears the picked mode", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "subgrid";
    mount();
    pick("custom", "columns");
    expect(changes).toEqual([]);
    expect(field("custom columns")?.value).toBe("");
    pick("none", "columns");
    act(() => {
      history.undo();
    });
    mount();
    expect(select("columns").textContent).toBe("subgrid");
    expect(field("custom columns")).toBeNull();
  });

  it("gap: hovering or focusing the row stripes the grid's gaps", () => {
    element.style.display = "grid";
    mount();
    const row = (field("gap") as HTMLInputElement).closest(".property-row") as HTMLElement;
    act(() => {
      row.dispatchEvent(new PointerEvent("pointerenter"));
    });
    expect(inspects.at(-1)).toEqual([{ box: "gap" }]);
    act(() => {
      row.dispatchEvent(new PointerEvent("pointerleave"));
    });
    expect(inspects.at(-1)).toBeNull();
    act(() => field("gap")?.focus());
    expect(inspects.at(-1)).toEqual([{ box: "gap" }]);
  });

  it("only the gap field has a drag handle", () => {
    element.style.display = "grid";
    mount();
    const handles = [...container.querySelectorAll(".scrub-handle")];
    expect(handles).toHaveLength(1);
    expect(handles[0]?.closest(".property-row")?.querySelector(".property-label")?.textContent).toBe("gap");
  });

  it("gap is a length field like the others", () => {
    element.style.display = "grid";
    mount();
    typeAndEnter("gap", "16");
    expect(changes).toEqual([["gap", "16px"]]);
    expect(field("gap")?.value).toBe("16px");
  });
});

describe("keyboard", () => {
  it("Tab goes display → columns select → count → gap, then out of the editor", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    mount({ query: "grid" });
    expect(focused()).toBe("display");
    key(select(), "Tab");
    expect(focused()).toBe("columns");
    key(select("columns"), "Tab");
    expect(focused()).toBe("column count");
    key(field("column count") as HTMLInputElement, "Tab");
    expect(focused()).toBe("gap");
    key(field("gap") as HTMLInputElement, "Tab");
    expect(tabbedOut).toEqual([1]);
    key(field("gap") as HTMLInputElement, "Tab", { shiftKey: true });
    expect(focused()).toBe("column count");
    key(field("column count") as HTMLInputElement, "Tab", { shiftKey: true });
    expect(focused()).toBe("columns");
    key(select("columns"), "Tab", { shiftKey: true });
    expect(focused()).toBe("display");
  });

  it("without a columns field (subgrid), Tab goes from the columns select to gap", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "subgrid";
    mount({ query: "grid-cols" });
    expect(focused()).toBe("columns");
    key(select("columns"), "Tab");
    expect(focused()).toBe("gap");
  });

  it("without grid, Tab from the select leaves the editor", () => {
    mount({ query: "display" });
    key(select(), "Tab");
    expect(tabbedOut).toEqual([1]);
  });

  it("the query picks the row: gap, cols", () => {
    element.style.display = "grid";
    mount({ query: "gap" });
    expect(focused()).toBe("gap");
    mount({ query: "grid-cols" });
    expect(focused()).toBe("columns");
    mount({ query: "", edge: "last" });
    expect(focused()).toBe("gap");
  });
});

describe("columns value", () => {
  it("tells the mode from the value", () => {
    expect(["", "repeat(3, minmax(0, 1fr))", "subgrid", "none", "1fr 2fr", "repeat(3, 1fr)"].map(columnsMode)).toEqual([
      "",
      "repeat",
      "subgrid",
      "none",
      "custom",
      "custom", // only Pilot's own repeat is a count
    ]);
  });

  it("custom: cleared removes, whitespace is tidied", () => {
    expect(parseCustomColumns("  ")).toBe("");
    expect(parseCustomColumns(" 1fr   200px ")).toBe("1fr 200px");
  });

  it("round-trips, including the browser's minmax(0px, …)", () => {
    expect(columnsValue(4)).toBe("repeat(4, minmax(0, 1fr))");
    expect(columnsCount("repeat(4, minmax(0, 1fr))")).toBe("4");
    expect(columnsCount("repeat(4, minmax(0px, 1fr))")).toBe("4");
    expect(columnsCount("1fr 2fr")).toBeNull();
  });
});

describe("search", () => {
  it("Tailwind's display and grid utilities land on display", () => {
    for (const q of ["display", "grid", "flex", "hidden", "gap", "cols", "grid-cols"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["display"]);
    }
  });
});
