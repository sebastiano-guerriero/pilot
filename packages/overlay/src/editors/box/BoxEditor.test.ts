// @vitest-environment happy-dom
import type { BoxArea } from "../../dom/boxModel.ts";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../../edits/history.ts";
import { borderEditor } from "../border/BorderEditor.tsx";
import { marginEditor } from "../margin/MarginEditor.tsx";
import type { PropertyEditor } from "../types.ts";
import { boxEditor, compactPx } from "./BoxEditor.tsx";

// Padding as a box diagram. The real padding editor is now four rows, but
// padding's values make the clearest test case for the shared box component
// that margin and border use.
const paddingEditor = boxEditor({
  id: "padding",
  label: "Padding",
  title: "padding",
  box: "padding",
  property: (side) => `padding-${side}`,
  aliases: { all: "p", top: "pt", right: "pr", bottom: "pb", left: "pl", x: "px", y: "py" },
});

// Mimics the dialog: computed values come from `computed` (what the stylesheet
// gives), changes go through a real EditHistory onto a real element.
let element: HTMLElement;
let history: EditHistory;
let changes: Array<[string, string]>;
let gestures: Array<object | undefined>;
let hints: unknown[];
let inspects: Array<string[] | null>;
let returned: number;
let requestFocus: (query: string, edge?: "first" | "last") => void;
let computedStyle: Record<string, string>;

function Harness({ editor }: { editor: PropertyEditor }) {
  const [focusRequest, setFocusRequest] = useState<{ query: string; edge?: "first" | "last" } | undefined>(undefined);
  const [, setTick] = useState(0);
  requestFocus = (query, edge) => setFocusRequest({ query, edge });
  const values = Object.fromEntries(editor.properties.map((p) => [p, element.style.getPropertyValue(p) || computedStyle[p] || "0px"]));
  return h(editor.component, {
    element,
    values,
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
    onReturnToSearch: () => returned++,
    onHint: (hint: unknown) => hints.push(hint),
    onInspect: (areas: BoxArea[] | null) =>
      inspects.push(areas ? areas.map((a) => `${a.box}-${"side" in a ? a.side : ""}`).sort() : null),
  });
}

let container: HTMLElement;
const mount = (editor: PropertyEditor) => act(() => render(h(Harness, { editor }), container));

beforeEach(() => {
  element = document.createElement("div");
  history = new EditHistory();
  changes = [];
  gestures = [];
  hints = [];
  inspects = [];
  returned = 0;
  computedStyle = {
    "padding-top": "10px",
    "padding-right": "20px",
    "padding-bottom": "10px",
    "padding-left": "20px",
  };
  // Fields show inline values only, so most tests start from inline padding
  // matching the computed one.
  element.style.padding = "10px 20px";
  container = document.createElement("div");
  document.body.append(element, container);
  mount(paddingEditor);
});
afterEach(() => {
  render(null, container);
  container.remove();
  element.remove();
});

const side = (name: string) => container.querySelector(`.side[data-side="${name}"]`) as HTMLElement;
const field = (name: string) => side(name).querySelector("input") as HTMLInputElement;
/** What a side shows: its value, or the dimmed dash. */
const shown = (name: string) => field(name).value || field(name).placeholder;
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label");
const typeInto = (name: string, text: string) =>
  act(() => {
    field(name).value = text;
    field(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
const press = (el: Element, key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
const pointer = (name: string, type: string, x: number, y: number, init: PointerEventInit = {}) =>
  act(() => {
    side(name).dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y, ...init }),
    );
  });
const key = (type: "keydown" | "keyup", k: "Alt" | "Shift") =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, [k === "Alt" ? "altKey" : "shiftKey"]: type === "keydown" }));
  });
const hintText = () => {
  const last = hints.at(-1);
  if (last === null || last === undefined || typeof last === "string") return last;
  const host = document.createElement("div");
  render(last as never, host);
  return host.textContent;
};

describe("BoxEditor values", () => {
  it("an inline value shows at full contrast (px implied)", () => {
    expect(["top", "right", "bottom", "left"].map((n) => field(n).value)).toEqual(["10", "20", "10", "20"]);
  });

  it("with no inline value, a side shows a dimmed dash, never the computed value", () => {
    element.style.removeProperty("padding-top");
    mount(paddingEditor);
    expect(field("top").value).toBe("");
    expect(field("top").placeholder).toBe("—");
  });

  it("an inline value wins over the page's", () => {
    element.style.paddingTop = "12px";
    element.style.paddingLeft = "1.5rem";
    mount(paddingEditor);
    expect(field("top").value).toBe("12");
    expect(field("left").value).toBe("1.5rem");
  });

  it("the first click on a value selects all of it", () => {
    const down = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      field("right").dispatchEvent(down);
    });
    expect(document.activeElement).toBe(field("right"));
    expect(field("right").value.slice(field("right").selectionStart ?? 0, field("right").selectionEnd ?? 0)).toBe("20");
  });

  it("a click elsewhere on a side focuses its value, selected", () => {
    pointer("bottom", "pointerdown", 5, 5);
    pointer("bottom", "pointerup", 5, 5);
    expect(document.activeElement).toBe(field("bottom"));
    expect(field("bottom").selectionStart).toBe(0);
    expect(field("bottom").selectionEnd).toBe(2);
  });

  it("uses compact fields that size to their content", () => {
    expect(field("left").hasAttribute("data-compact")).toBe(true);
    expect(field("left").classList.contains("property-input-text")).toBe(true);
  });

  it("accepts what every field accepts: px by default, units, math", () => {
    act(() => field("top").focus());
    typeInto("top", "24");
    press(field("top"), "Enter");
    act(() => field("left").focus());
    typeInto("left", "1rem");
    press(field("left"), "Enter");
    act(() => field("right").focus());
    typeInto("right", "2% + 4px");
    press(field("right"), "Enter");
    expect(changes).toEqual([
      ["padding-top", "24px"],
      ["padding-left", "1rem"],
      ["padding-right", "calc(2% + 4px)"],
    ]);
    expect(returned).toBe(3);
  });

  it("deleting a value shows the dash (not the deleted value) before Enter", () => {
    element.style.paddingLeft = "1234px";
    mount(paddingEditor);
    act(() => field("left").focus());
    typeInto("left", "");
    expect(field("left").value).toBe("");
    expect(field("left").placeholder).toBe("—");
  });

  it("clearing a side removes its value", () => {
    element.style.paddingTop = "12px";
    mount(paddingEditor);
    act(() => field("top").focus());
    typeInto("top", "");
    press(field("top"), "Enter");
    expect(element.style.paddingTop).toBe("");
    expect(field("top").value).toBe(""); // not set: the dash
  });

  it("arrows step from the computed value (Shift = 10), never below 0", () => {
    act(() => field("left").focus());
    press(field("left"), "ArrowUp");
    expect(changes.at(-1)).toEqual(["padding-left", "21px"]);
    press(field("left"), "ArrowDown", { shiftKey: true });
    expect(changes.at(-1)).toEqual(["padding-left", "11px"]);
    press(field("left"), "ArrowDown", { shiftKey: true });
    press(field("left"), "ArrowDown", { shiftKey: true });
    expect(changes.at(-1)).toEqual(["padding-left", "0px"]);
  });

  it("compactPx drops px only", () => {
    expect(compactPx("12px")).toBe("12");
    expect(compactPx("-4px")).toBe("-4");
    expect(compactPx("1rem")).toBe("1rem");
    expect(compactPx("auto")).toBe("auto");
  });
});

describe("BoxEditor keyboard", () => {
  it("focuses the side named by the alias", () => {
    for (const [query, label] of [
      ["pt", "padding-top"],
      ["pr", "padding-right"],
      ["paddingbottom", "padding-bottom"],
      ["pl", "padding-left"],
      ["padding", "padding-top"],
    ]) {
      act(() => requestFocus(query as string));
      expect(focused(), query).toBe(label);
    }
  });

  it("px links left and right: one value sets both, as one undo step", () => {
    act(() => requestFocus("px"));
    expect(focused()).toBe("padding-left");
    expect(side("right").hasAttribute("data-linked")).toBe(true);
    typeInto("left", "8");
    press(field("left"), "Enter");
    expect(changes).toEqual([
      ["padding-left", "8px"],
      ["padding-right", "8px"],
    ]);
    expect(gestures[1]).toBe(gestures[0]);
    act(() => {
      history.undo();
    });
    expect([element.style.paddingLeft, element.style.paddingRight]).toEqual(["20px", "20px"]);
  });

  it("p links all four; linked sides keep their own values until something is typed", () => {
    // Values from the page's CSS only: the selection is mirrored on all of them.
    act(() => requestFocus("p"));
    act(() => {
      field("top").dispatchEvent(new Event("select"));
    });
    expect(["top", "right", "bottom", "left"].map(shown)).toEqual(["10", "20", "10", "20"]);
    expect(["right", "bottom", "left"].every((n) => field(n).hasAttribute("data-mirror-selected"))).toBe(true);
    act(() => {
      field("top").value = "5";
      field("top").setSelectionRange(1, 1); // typing leaves a caret, not a selection
      field("top").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(["right", "bottom", "left"].map((n) => field(n).value)).toEqual(["5", "5", "5"]);
    expect(field("right").hasAttribute("data-mirror-selected")).toBe(false);
    press(field("top"), "Enter");
    expect(changes.map(([p]) => p).sort()).toEqual(["padding-bottom", "padding-left", "padding-right", "padding-top"]);
  });

  it("a link ends when focus leaves the editor: a later click edits just one side", () => {
    act(() => requestFocus("p"));
    const outside = document.createElement("button");
    document.body.append(outside);
    act(() => outside.focus()); // e.g. Esc back to the search
    expect(container.querySelectorAll(".side[data-linked]")).toHaveLength(0);
    act(() => field("right").focus());
    typeInto("right", "6");
    press(field("right"), "Enter");
    expect(changes).toEqual([["padding-right", "6px"]]);
    outside.remove();
  });

  it("moving to another side of the same group keeps the link", () => {
    act(() => requestFocus("py"));
    act(() => field("bottom").focus()); // focus moves inside the editor
    expect([side("top").hasAttribute("data-linked"), side("bottom").hasAttribute("data-linked")]).toEqual([true, true]);
  });

  it("with nothing set (empty fields), linked sides still show the selected look", () => {
    element.style.removeProperty("padding");
    mount(paddingEditor);
    act(() => requestFocus("p"));
    expect(field("top").value).toBe("");
    expect(field("top").hasAttribute("data-placeholder-selected")).toBe(true);
    expect(["right", "bottom", "left"].every((n) => field(n).hasAttribute("data-mirror-selected"))).toBe(true);
    typeInto("top", "4");
    expect(field("top").hasAttribute("data-placeholder-selected")).toBe(false);
    expect(["right", "bottom", "left"].map((n) => field(n).value)).toEqual(["4", "4", "4"]);
    expect(field("right").hasAttribute("data-mirror-selected")).toBe(false);
  });

  it("Esc on a linked side puts every side back", () => {
    act(() => requestFocus("px"));
    typeInto("left", "77");
    expect(field("right").value).toBe("77");
    press(field("left"), "Escape");
    act(() => field("left").blur());
    expect([shown("left"), shown("right")]).toEqual(["20", "20"]);
    expect(changes).toEqual([]);
  });

  it("Tab/Shift+Tab go through the sides; past the ends, out of the editor", () => {
    act(() => requestFocus("pt"));
    press(field("top"), "Tab");
    expect(focused()).toBe("padding-right");
    press(field("right"), "Tab");
    press(field("bottom"), "Tab");
    expect(focused()).toBe("padding-left");
    press(field("left"), "Tab");
    expect(returned).toBe(1); // no onTabOut in this harness: back to the search
  });

  it("tabbed in from another editor: starts at the first or last side", () => {
    act(() => requestFocus("w", "last"));
    expect(focused()).toBe("padding-left");
    act(() => requestFocus("w", "first"));
    expect(focused()).toBe("padding-top");
  });
});

describe("BoxEditor dragging", () => {
  it("drags outward to increase, one undo step per drag", () => {
    pointer("top", "pointerdown", 0, 100);
    pointer("top", "pointermove", 0, 95);
    pointer("top", "pointermove", 0, 90);
    pointer("top", "pointerup", 0, 90);
    expect(changes.at(-1)).toEqual(["padding-top", "20px"]);
    expect(new Set(gestures).size).toBe(1);
  });

  it("Alt mirrors the opposite side, Shift all sides; dropping out reverts", () => {
    pointer("left", "pointerdown", 100, 0);
    pointer("left", "pointermove", 90, 0, { shiftKey: true });
    expect(["top", "right", "bottom", "left"].map((n) => element.style.getPropertyValue(`padding-${n}`))).toEqual([
      "30px",
      "30px",
      "30px",
      "30px",
    ]);
    pointer("left", "pointermove", 89, 0, { altKey: true });
    // Back to the exact earlier values, not re-applied numbers.
    expect([element.style.paddingTop, element.style.paddingRight, element.style.paddingBottom]).toEqual(["10px", "31px", "10px"]);
    pointer("left", "pointerup", 89, 0);
  });

  it("shows the affected area on the page, and hints at Alt, while hovering", () => {
    act(() => {
      side("left").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1 }));
    });
    expect(inspects.at(-1)).toEqual(["padding-left"]);
    expect(hintText()).toBe("Hold Alt to change both sides");
    key("keydown", "Alt");
    expect(inspects.at(-1)).toEqual(["padding-left", "padding-right"]);
    expect(hintText()).toBe("Drag to change left and right");
    key("keyup", "Alt");
    act(() => {
      side("left").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
    });
    expect(inspects.at(-1)).toBeNull();
  });
});

describe("margin", () => {
  beforeEach(() => {
    computedStyle = { "margin-top": "0px", "margin-right": "0px", "margin-bottom": "0px", "margin-left": "0px" };
    mount(marginEditor);
  });

  it("uses margin properties, aliases and area", () => {
    act(() => requestFocus("mx"));
    expect(focused()).toBe("margin-left");
    typeInto("left", "auto");
    press(field("left"), "Enter");
    expect(changes).toEqual([
      ["margin-left", "auto"],
      ["margin-right", "auto"],
    ]);
    act(() => {
      side("top").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1 }));
    });
    expect(inspects.at(-1)).toEqual(["margin-top"]);
  });

  it("drags below 0 (negative margins are valid)", () => {
    pointer("top", "pointerdown", 0, 100);
    pointer("top", "pointermove", 0, 108); // inward: negative
    expect(changes.at(-1)).toEqual(["margin-top", "-8px"]);
    pointer("top", "pointerup", 0, 108);
  });
});

describe("border", () => {
  beforeEach(() => {
    computedStyle = {
      "border-top-width": "0px",
      "border-right-width": "0px",
      "border-bottom-width": "0px",
      "border-left-width": "0px",
    };
    mount(borderEditor);
  });

  it("setting a width on a side without a style also makes it solid, in the same undo step", () => {
    act(() => requestFocus("border-t"));
    typeInto("top", "2");
    press(field("top"), "Enter");
    expect(element.style.borderTopWidth).toBe("2px");
    expect(element.style.borderTopStyle).toBe("solid");
    act(() => {
      history.undo();
    });
    expect([element.style.borderTopWidth, element.style.borderTopStyle]).toEqual(["", ""]);
  });

  it("clearing the width removes the style Pilot added", () => {
    act(() => requestFocus("border-t"));
    typeInto("top", "2");
    press(field("top"), "Enter");
    act(() => requestFocus("border-t"));
    typeInto("top", "");
    press(field("top"), "Enter");
    expect([element.style.borderTopWidth, element.style.borderTopStyle]).toEqual(["", ""]);
  });

  it("leaves an existing style alone", () => {
    element.style.borderLeftStyle = "dashed";
    mount(borderEditor);
    act(() => requestFocus("border-l"));
    typeInto("left", "3");
    press(field("left"), "Enter");
    expect(element.style.borderLeftStyle).toBe("dashed");
    expect(changes).toEqual([["border-left-width", "3px"]]);
  });

  it("accepts the border keywords", () => {
    act(() => requestFocus("border-b"));
    typeInto("bottom", "thick");
    press(field("bottom"), "Enter");
    expect(element.style.borderBottomWidth).toBe("thick");
  });
});
