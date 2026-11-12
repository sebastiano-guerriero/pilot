// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { matchEditors } from "../registry.ts";
import type { FocusRequest } from "../types.ts";
import { gridColumnsEditor } from "../grid-columns/GridColumnsEditor.tsx";
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

/** A select by its label: "display" (the first one), "grid-columns"… */
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
  it("are the grid-columns, gap, justify-content and align-items editors", () => {
    expect(displayEditor.embeds?.map((e) => e.id)).toEqual(["grid-columns", "gap", "justify-content", "align-items"]);
    expect(gridColumnsEditor.properties).toEqual(["grid-template-columns"]);
  });

  it("appear only for grid and inline-grid", () => {
    mount();
    pick("grid");
    expect(labels()).toEqual(["display", "grid-columns", "gap", "justify-content", "align-items"]);
    pick("inline-grid");
    expect(labels()).toEqual(["display", "grid-columns", "gap", "justify-content", "align-items"]);
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

  it("justify-content and align-items: the icon selects, writing their own property", () => {
    element.style.display = "grid";
    mount();
    pick("center", "justify-content");
    pick("stretch", "align-items");
    expect(changes).toEqual([
      ["justify-content", "center"],
      ["align-items", "stretch"],
    ]);
    expect(select("justify-content").querySelector(".option-icon")).not.toBeNull();
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
  it("Tab goes display → columns select → count → gap → justify → align, then out of the editor", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
    mount({ query: "grid" });
    expect(focused()).toBe("display");
    key(select(), "Tab");
    expect(focused()).toBe("grid-columns");
    key(select("grid-columns"), "Tab");
    expect(focused()).toBe("column count");
    key(field("column count") as HTMLInputElement, "Tab");
    expect(focused()).toBe("gap");
    key(field("gap") as HTMLInputElement, "Tab");
    expect(focused()).toBe("justify-content");
    key(select("justify-content"), "Tab");
    expect(focused()).toBe("align-items");
    key(select("align-items"), "Tab");
    expect(tabbedOut).toEqual([1]);
    key(select("align-items"), "Tab", { shiftKey: true });
    expect(focused()).toBe("justify-content");
    key(select("justify-content"), "Tab", { shiftKey: true });
    expect(focused()).toBe("gap");
    key(field("gap") as HTMLInputElement, "Tab", { shiftKey: true });
    expect(focused()).toBe("column count");
    key(field("column count") as HTMLInputElement, "Tab", { shiftKey: true });
    expect(focused()).toBe("grid-columns");
    key(select("grid-columns"), "Tab", { shiftKey: true });
    expect(focused()).toBe("display");
  });

  it("without a columns field (subgrid), Tab goes from the grid-columns select to gap", () => {
    element.style.display = "grid";
    element.style.gridTemplateColumns = "subgrid";
    mount({ query: "grid" });
    key(select(), "Tab");
    expect(focused()).toBe("grid-columns");
    key(select("grid-columns"), "Tab");
    expect(focused()).toBe("gap");
  });

  it("without grid, Tab from the select leaves the editor", () => {
    mount({ query: "display" });
    key(select(), "Tab");
    expect(tabbedOut).toEqual([1]);
  });

  it("from the search it lands on display; from the next editor (Shift+Tab), on the last row", () => {
    element.style.display = "grid";
    mount({ query: "grid" });
    expect(focused()).toBe("display");
    mount({ query: "", edge: "last" });
    expect(focused()).toBe("align-items");
  });
});


describe("search", () => {
  it("Tailwind's display and grid utilities land on display", () => {
    for (const q of ["display", "grid", "flex", "hidden"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["display"]);
    }
  });

  it("the grid rows are found on their own, without display or each other", () => {
    expect(matchEditors("gap").map((e) => e.id)).toEqual(["gap"]);
    for (const q of ["cols", "grid-cols", "grid-columns"]) {
      expect(matchEditors(q).map((e) => e.id)).toEqual(["grid-columns"]);
    }
  });

  it("the embedded grid rows don't make display match: their own editors do", () => {
    expect(matchEditors("justify-content").map((e) => e.id)).toEqual(["justify-content"]);
    expect(matchEditors("align-items").map((e) => e.id)).toEqual(["align-items"]);
    expect(matchEditors("align").map((e) => e.id)).toEqual(["align-items"]);
  });
});
