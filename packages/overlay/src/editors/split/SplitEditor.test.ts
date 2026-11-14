// @vitest-environment happy-dom
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BoxArea } from "../../dom/boxModel.ts";
import { EditHistory } from "../../edits/history.ts";
import { inlinePreview } from "../../test/inlinePreview.ts";
import { gapEditor } from "../gap/GapEditor.tsx";
import { marginEditor } from "../margin/MarginEditor.tsx";
import { paddingEditor } from "../padding/PaddingEditor.tsx";
import { PropertyDialog } from "../../ui/components/PropertyDialog/PropertyDialog.tsx";
import type { FocusRequest } from "../types.ts";

// Mimics the dialog: changes go through a real EditHistory (shown inline by
// the test preview, so fields read them back from element.style).
let element: HTMLElement;
let container: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;
let gestures: Array<object | undefined>;
let inspects: Array<string[] | null>;
let requestFocus: (request: FocusRequest) => void;
let setQuery: (query: string) => void;

let editor = paddingEditor;

function Harness() {
  const [focusRequest, setFocusRequest] = useState<FocusRequest | undefined>(undefined);
  const [query, setQueryState] = useState("");
  const [, setTick] = useState(0);
  requestFocus = setFocusRequest;
  setQuery = setQueryState;
  return h(editor.component, {
    element,
    query,
    values: Object.fromEntries(editor.properties.map((p) => [p, "0px"])),
    onChange: (property: string, value: string, options?: { gesture?: object }) => {
      changes.push([property, value]);
      gestures.push(options?.gesture);
      history.apply(element, property, value, options?.gesture);
      setTick((n) => n + 1);
    },
    onRevert: (property: string, gesture: object) => {
      history.revert(element, property, gesture);
      setTick((n) => n + 1);
    },
    focusRequest,
    onInspect: (areas: BoxArea[] | null) =>
      inspects.push(areas ? areas.map((a) => `${a.box}-${"side" in a ? a.side : (a.axis ?? "")}`) : null),
  });
}

const mount = () => act(() => render(h(Harness, {}), container));
const inputs = () => [...container.querySelectorAll("input")] as HTMLInputElement[];
const toggle = () => container.querySelector(".split-toggle") as HTMLButtonElement;
const view = () => (container.querySelector(".split-editor") as HTMLElement).dataset.view;
// Focus, type, Enter: separate steps, so the field renders in between.
const commit = (input: HTMLInputElement, text: string) => {
  act(() => input.focus());
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  editor = paddingEditor;
  element = document.createElement("div");
  container = document.createElement("div");
  document.body.append(element, container);
  history = new EditHistory(inlinePreview());
  changes = [];
  gestures = [];
  inspects = [];
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

describe("SplitEditor (padding)", () => {
  it("opens on one value when the sides are the same, on each side when they differ", () => {
    element.style.padding = "12px";
    mount();
    expect(view()).toBe("all");
    expect(inputs().map((i) => i.value)).toEqual(["12px"]);
    render(null, container);
    element.style.padding = "10px 18px";
    mount();
    expect(view()).toBe("parts");
    expect(inputs().map((i) => i.value)).toEqual(["10px", "18px", "10px", "18px"]);
  });

  it("one value writes the shorthand; it takes a single value, not a list", () => {
    mount();
    commit(inputs()[0] as HTMLInputElement, "12");
    expect(changes).toEqual([["padding", "12px"]]);
    commit(inputs()[0] as HTMLInputElement, "12px 16px");
    expect(changes).toHaveLength(1);
  });

  it("the button switches views without changing anything", () => {
    element.style.padding = "12px";
    mount();
    act(() => toggle().click());
    expect(view()).toBe("parts");
    expect(inputs().map((i) => i.value)).toEqual(["12px", "12px", "12px", "12px"]);
    act(() => toggle().click());
    expect(view()).toBe("all");
    expect(changes).toEqual([]);
  });

  it("with sides that differ, one value reads Mixed, and a value there sets them all", () => {
    element.style.padding = "10px 18px";
    mount();
    act(() => toggle().click());
    const all = inputs()[0] as HTMLInputElement;
    expect(all.value).toBe("");
    expect(all.placeholder).toBe("Mixed");
    commit(all, "8");
    expect(changes).toEqual([["padding", "8px"]]);
    expect(element.style.paddingRight).toBe("8px");
  });

  it("a side writes its own property", () => {
    history.apply(element, "padding", "12px");
    mount();
    act(() => toggle().click());
    commit(inputs()[1] as HTMLInputElement, "20");
    expect(changes).toEqual([["padding-right", "20px"]]);
    expect(element.style.paddingRight).toBe("20px");
    expect(element.style.paddingTop).toBe("12px");
  });

  it("clearing one value clears every side, as one undo step", () => {
    history.apply(element, "padding", "12px");
    mount();
    commit(inputs()[0] as HTMLInputElement, "");
    expect(changes.map(([p]) => p)).toEqual(["padding", "padding-top", "padding-right", "padding-bottom", "padding-left"]);
    expect(new Set(gestures).size).toBe(1);
    expect(element.style.cssText).toBe("");
    history.undo();
    expect(element.style.padding).toBe("12px");
  });

  it("from the search: p → one value, pt → that side, px → a pair that a typed value sets together", () => {
    mount();
    act(() => requestFocus({ query: "pt" }));
    expect(view()).toBe("parts");
    expect(document.activeElement).toBe(inputs()[0]);
    act(() => requestFocus({ query: "p" }));
    expect(view()).toBe("all");
    act(() => requestFocus({ query: "px" }));
    expect(document.activeElement).toBe(inputs()[1]);
    commit(inputs()[1] as HTMLInputElement, "6");
    expect(changes).toEqual([
      ["padding-right", "6px"],
      ["padding-left", "6px"],
    ]);
    expect(gestures[0]).toBe(gestures[1]);
  });

  it("shows the area of the field in use: all four sides for one value, one for a side", () => {
    mount();
    act(() => inputs()[0]?.focus());
    expect(inspects.at(-1)).toEqual(["padding-top", "padding-right", "padding-bottom", "padding-left"]);
    act(() => toggle().click());
    act(() => inputs()[2]?.focus());
    expect(inspects.at(-1)).toEqual(["padding-bottom"]);
  });

  it("splits as soon as a side or a pair is typed, before Tab; p brings back one value", () => {
    element.style.padding = "12px";
    mount();
    expect(view()).toBe("all");
    for (const q of ["px", "pl", "ps", "padding-left", "padding-inline", "padding-block-end"]) {
      act(() => setQuery("p"));
      expect(view(), q).toBe("all");
      act(() => setQuery(q));
      expect(view(), q).toBe("parts");
    }
    act(() => setQuery("padding"));
    expect(view()).toBe("parts"); // the label keeps the view
  });

  it("logical names land like the physical ones", () => {
    mount();
    act(() => requestFocus({ query: "padding-inline-start" }));
    expect(document.activeElement).toBe(inputs()[3]);
    act(() => requestFocus({ query: "pe" }));
    expect(document.activeElement).toBe(inputs()[1]);
    act(() => requestFocus({ query: "padding-block" }));
    expect(document.activeElement).toBe(inputs()[0]);
    commit(inputs()[0] as HTMLInputElement, "4");
    expect(changes).toEqual([
      ["padding-top", "4px"],
      ["padding-bottom", "4px"],
    ]);
  });
});

describe("a linked pair (py)", () => {
  it("shows the other field selected too, then mirrors what's typed", () => {
    element.style.padding = "10px 18px";
    mount();
    act(() => requestFocus({ query: "py" }));
    const [top, , bottom] = inputs() as [HTMLInputElement, HTMLInputElement, HTMLInputElement];
    expect(document.activeElement).toBe(top);
    expect(bottom.parentElement?.querySelector(".mirror-selection")?.textContent).toBe("10px");
    act(() => {
      top.value = "4";
      top.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(bottom.value).toBe("4");
    expect(bottom.parentElement?.querySelector(".mirror-selection")).toBeNull();
  });
});

describe("in the dialog", () => {
  it("typing pl shows each side, and Tab lands on left", () => {
    element.style.padding = "12px";
    act(() => {
      render(h(PropertyDialog, { element, anchor: element.getBoundingClientRect(), editors: [paddingEditor] }), container);
    });
    const search = container.querySelector(".property-search input") as HTMLInputElement;
    act(() => {
      search.value = "pl";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view()).toBe("parts");
    act(() => {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(container.querySelectorAll(".split-editor input")[3]);
  });
});

describe("margin", () => {
  beforeEach(() => {
    editor = marginEditor;
  });

  it("mx lands on a pair; auto there centers (both sides, one undo step)", () => {
    mount();
    act(() => setQuery("mx"));
    expect(view()).toBe("parts");
    act(() => requestFocus({ query: "mx" }));
    commit(inputs()[1] as HTMLInputElement, "auto");
    expect(changes).toEqual([
      ["margin-right", "auto"],
      ["margin-left", "auto"],
    ]);
    expect(gestures[0]).toBe(gestures[1]);
  });

  it("goes below 0: negative margins are valid", () => {
    mount();
    act(() => requestFocus({ query: "mt" }));
    const top = inputs()[0] as HTMLInputElement;
    act(() => {
      top.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(changes).toEqual([["margin-top", "-1px"]]);
    commit(inputs()[0] as HTMLInputElement, "-8");
    expect(changes.at(-1)).toEqual(["margin-top", "-8px"]);
  });

  it("one value writes the shorthand, and shows the margin area on all four sides", () => {
    mount();
    act(() => requestFocus({ query: "m" }));
    expect(inspects.at(-1)).toEqual(["margin-top", "margin-right", "margin-bottom", "margin-left"]);
    commit(inputs()[0] as HTMLInputElement, "16");
    expect(changes).toEqual([["margin", "16px"]]);
  });
});

describe("gap", () => {
  beforeEach(() => {
    editor = gapEditor;
  });
  const icons = () => [...container.querySelectorAll(".split-toggle svg")].length;

  it("two parts: row-gap and column-gap; different values open split", () => {
    element.style.rowGap = "8px";
    element.style.columnGap = "16px";
    mount();
    expect(view()).toBe("parts");
    expect(inputs().map((i) => i.getAttribute("aria-label"))).toEqual(["row-gap", "column-gap"]);
    expect(inputs().map((i) => i.value)).toEqual(["8px", "16px"]);
    expect(icons()).toBe(2);
  });

  it("gap-y splits as it's typed and lands on the row gap; gap-x on the column gap", () => {
    mount();
    expect(view()).toBe("all");
    act(() => setQuery("gap-y"));
    expect(view()).toBe("parts");
    act(() => requestFocus({ query: "gap-y" }));
    expect(document.activeElement).toBe(inputs()[0]);
    act(() => requestFocus({ query: "column-gap" }));
    expect(document.activeElement).toBe(inputs()[1]);
    commit(inputs()[1] as HTMLInputElement, "12");
    expect(changes).toEqual([["column-gap", "12px"]]);
  });

  it("gap lands on the one value, like Tailwind's gap-*: a value there sets both", () => {
    element.style.rowGap = "8px";
    element.style.columnGap = "16px";
    mount();
    expect(view()).toBe("parts");
    act(() => setQuery("gap"));
    expect(view()).toBe("all");
    act(() => requestFocus({ query: "gap" }));
    const all = inputs()[0] as HTMLInputElement;
    expect(document.activeElement).toBe(all);
    expect(all.placeholder).toBe("Mixed");
    commit(all, "12");
    expect(changes).toEqual([["gap", "12px"]]);
  });

  it("one value writes gap; its field shows both gaps on the page, a part only its own", () => {
    mount();
    act(() => inputs()[0]?.focus());
    expect(inspects.at(-1)).toEqual(["gap-row", "gap-column"]);
    commit(inputs()[0] as HTMLInputElement, "10");
    expect(changes).toEqual([["gap", "10px"]]);
    expect(icons()).toBe(1);
    act(() => toggle().click());
    act(() => inputs()[1]?.focus());
    expect(inspects.at(-1)).toEqual(["gap-column"]);
  });
});

