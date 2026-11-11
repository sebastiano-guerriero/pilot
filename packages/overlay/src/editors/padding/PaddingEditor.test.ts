// @vitest-environment happy-dom
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaddingEditor, parseValue } from "./PaddingEditor.tsx";

// Mimics the dialog: holds the values and applies every onChange to them.
let changes: Array<[string, string]>;
let gestures: Array<object | undefined>;
let setExternal: (property: string, value: string) => void;
let requestFocus: (query: string) => void;
let returned: number;
let hints: unknown[];
let reverts: string[];
let inspects: Array<Array<{ box: string; side: string }> | null>;
function Harness() {
  const [focusRequest, setFocusRequest] = useState<{ query: string } | undefined>(undefined);
  requestFocus = (query) => setFocusRequest({ query });
  const [values, setValues] = useState<Record<string, string>>({
    "padding-top": "10px",
    "padding-right": "20px",
    "padding-bottom": "10px",
    "padding-left": "20px",
  });
  setExternal = (property, value) => setValues((v) => ({ ...v, [property]: value }));
  return h(PaddingEditor, {
    element: document.body,
    values,
    onChange: (property: string, value: string, options?: { gesture?: object }) => {
      changes.push([property, value]);
      gestures.push(options?.gesture);
      setValues((v) => ({ ...v, [property]: value }));
    },
    focusRequest,
    onReturnToSearch: () => returned++,
    onHint: (hint: unknown) => hints.push(hint),
    onRevert: (property: string) => reverts.push(property),
    onInspect: (areas: Array<{ box: string; side: string }> | null) => inspects.push(areas),
  });
}

let container: HTMLElement;
beforeEach(() => {
  changes = [];
  gestures = [];
  returned = 0;
  hints = [];
  reverts = [];
  inspects = [];
  container = document.createElement("div");
  document.body.append(container);
  act(() => render(h(Harness, {}), container));
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const side = (name: string) => container.querySelector(`.side[data-side="${name}"]`) as HTMLElement;
// The editable number of a side (a contenteditable span).
const number = (name: string) => side(name).querySelector(".value") as HTMLElement;
const pointer = (target: HTMLElement, type: string, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y }));
  });

describe("PaddingEditor", () => {
  it("shows the current value of each side", () => {
    expect(["top", "right", "bottom", "left"].map((s) => number(s).textContent)).toEqual(["10", "20", "10", "20"]);
  });

  it("applies a typed value on Enter", () => {
    act(() => number("top").focus());
    act(() => {
      number("top").textContent = "24";
    });
    act(() => {
      number("top").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(changes.at(-1)).toEqual(["padding-top", "24px"]);
    expect(number("top").textContent).toBe("24");
  });

  it("steps with arrow keys (Shift = 10) and never goes below 0", () => {
    act(() => number("left").focus());
    const key = (key: string, shiftKey = false) =>
      act(() => {
        number("left").dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
      });
    key("ArrowUp");
    expect(changes.at(-1)).toEqual(["padding-left", "21px"]);
    key("ArrowDown", true);
    expect(changes.at(-1)).toEqual(["padding-left", "11px"]);
    key("ArrowDown", true);
    key("ArrowDown", true);
    expect(changes.at(-1)).toEqual(["padding-left", "0px"]);
  });

  it("drags outward to increase: up for top, right for right", () => {
    pointer(side("top"), "pointerdown", 100, 100);
    pointer(side("top"), "pointermove", 100, 90);
    pointer(side("top"), "pointerup", 100, 90);
    expect(changes.at(-1)).toEqual(["padding-top", "20px"]);

    pointer(side("right"), "pointerdown", 100, 100);
    pointer(side("right"), "pointermove", 95, 100);
    pointer(side("right"), "pointerup", 95, 100);
    expect(changes.at(-1)).toEqual(["padding-right", "15px"]);
  });

  it("marks the side as dragging while scrubbing", () => {
    pointer(side("bottom"), "pointerdown", 0, 0);
    pointer(side("bottom"), "pointermove", 0, 10);
    expect(side("bottom").hasAttribute("data-dragging")).toBe(true);
    pointer(side("bottom"), "pointerup", 0, 10);
    expect(side("bottom").hasAttribute("data-dragging")).toBe(false);
  });

  it("passes one gesture for a whole drag, a new one for the next drag", () => {
    pointer(side("top"), "pointerdown", 0, 100);
    pointer(side("top"), "pointermove", 0, 95);
    pointer(side("top"), "pointermove", 0, 90);
    pointer(side("top"), "pointerup", 0, 90);
    pointer(side("top"), "pointerdown", 0, 100);
    pointer(side("top"), "pointermove", 0, 95);
    pointer(side("top"), "pointerup", 0, 95);
    const [a, b, c] = gestures;
    expect(a).toBeDefined();
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  it("puts the current value back after invalid text", () => {
    act(() => number("right").focus());
    act(() => {
      number("right").textContent = "abc";
    });
    act(() => number("right").blur());
    expect(changes).toEqual([]);
    expect(number("right").textContent).toBe("20");
  });

  it("doesn't re-apply an unchanged typed value", () => {
    act(() => number("top").focus());
    act(() => number("top").blur());
    expect(changes).toEqual([]);
  });

  it("shows an outside change (undo) while the input is being edited", () => {
    act(() => number("top").focus());
    act(() => setExternal("padding-top", "4px"));
    expect(number("top").textContent).toBe("4");
  });

  it("selects the whole number on the first click; later clicks place the caret", () => {
    const down = () => {
      const e = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 });
      act(() => {
        number("bottom").dispatchEvent(e);
      });
      return e;
    };
    const first = down();
    expect(first.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(number("bottom"));
    expect(document.getSelection()?.toString()).toBe("10");
    const second = down();
    expect(second.defaultPrevented).toBe(false); // native caret placement
  });

  it("treats a press without movement as a click: focuses the input, changes nothing", () => {
    pointer(side("right"), "pointerdown", 50, 50);
    pointer(side("right"), "pointermove", 51, 50);
    pointer(side("right"), "pointerup", 51, 50);
    expect(changes).toEqual([]);
    expect(document.activeElement).toBe(number("right"));
  });
});

describe("PaddingEditor Alt-drag", () => {
  const drag = (name: string, type: string, x: number, y: number, altKey = false) =>
    act(() => {
      side(name).dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y, altKey }),
      );
    });
  const hintText = () => {
    const last = hints.at(-1);
    if (last === null || last === undefined) return last;
    if (typeof last === "string") return last;
    const host = document.createElement("div");
    render(last as never, host);
    return host.textContent;
  };
  const alt = (type: "keydown" | "keyup") =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent(type, { key: "Alt", bubbles: true, cancelable: true }));
    });

  it("with Alt, the opposite side follows: top and bottom change together", () => {
    drag("top", "pointerdown", 0, 100);
    drag("top", "pointermove", 0, 90, true);
    expect(changes).toEqual([
      ["padding-top", "20px"],
      ["padding-bottom", "20px"],
    ]);
    expect(gestures[1]).toBe(gestures[0]); // one undo step
    expect(side("bottom").hasAttribute("data-paired")).toBe(true);
    drag("top", "pointerup", 0, 90, true);
    expect(side("bottom").hasAttribute("data-paired")).toBe(false);
  });

  it("releasing Alt mid-drag puts the opposite side back where it started", () => {
    drag("left", "pointerdown", 100, 0);
    drag("left", "pointermove", 95, 0, true); // left 20 → 25, right mirrors
    expect(changes.at(-1)).toEqual(["padding-right", "25px"]);
    drag("left", "pointermove", 94, 0, false);
    // Right is reverted to exactly what it was, not re-set to 20px.
    expect(reverts).toEqual(["padding-right"]);
    expect(changes.at(-1)).toEqual(["padding-left", "26px"]);
    expect(side("right").hasAttribute("data-paired")).toBe(false);
  });

  it("reacts to Alt pressed or released without moving the pointer", () => {
    drag("bottom", "pointerdown", 0, 0);
    drag("bottom", "pointermove", 0, 5);
    expect(changes).toEqual([["padding-bottom", "15px"]]);
    alt("keydown");
    expect(changes.at(-1)).toEqual(["padding-top", "15px"]);
    expect(side("top").hasAttribute("data-paired")).toBe(true);
    alt("keyup");
    expect(reverts).toEqual(["padding-top"]);
  });

  it("puts a hint in the footer at the right time", () => {
    drag("top", "pointerdown", 0, 100);
    expect(hintText()).toBeFalsy(); // a press alone isn't a drag
    drag("top", "pointermove", 0, 90);
    expect(hintText()).toBe("Hold Alt to change both sides");
    drag("top", "pointermove", 0, 88, true);
    expect(hintText()).toBe("Changing top and bottom");
    drag("top", "pointerup", 0, 88, true);
    expect(hintText()).toBeNull();
  });

  describe("before dragging (hover)", () => {
    const hoverOn = (target: Element, type = "pointermove", altKey = false) =>
      act(() => {
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 0, clientY: 0, altKey }));
      });

    it("hints at Alt as soon as the pointer is on a side's drag area", () => {
      hoverOn(side("left"));
      expect(hintText()).toBe("Hold Alt to change both sides");
    });

    it("doesn't hint over the editable number", () => {
      hoverOn(side("left"));
      hoverOn(number("left"));
      expect(hintText()).toBeNull();
    });

    it("holding Alt over a side highlights the opposite side and says what a drag will do", () => {
      hoverOn(side("left"));
      alt("keydown");
      expect(side("right").hasAttribute("data-paired")).toBe(true);
      expect(side("left").hasAttribute("data-paired")).toBe(false);
      expect(hintText()).toBe("Drag to change left and right");
      expect(changes).toEqual([]); // nothing applied by Alt alone
      alt("keyup");
      expect(side("right").hasAttribute("data-paired")).toBe(false);
      expect(hintText()).toBe("Hold Alt to change both sides");
    });

    it("picks up Alt already held when the pointer arrives", () => {
      hoverOn(side("top"), "pointermove", true);
      expect(side("bottom").hasAttribute("data-paired")).toBe(true);
    });

    it("clears the hint and highlight when the pointer leaves", () => {
      hoverOn(side("top"), "pointermove", true);
      hoverOn(side("top"), "pointerleave", true);
      expect(hintText()).toBeNull();
      expect(side("bottom").hasAttribute("data-paired")).toBe(false);
    });

    it("a drag started with Alt held mirrors right away", () => {
      hoverOn(side("top"));
      alt("keydown");
      drag("top", "pointerdown", 0, 100, true);
      drag("top", "pointermove", 0, 95, true);
      expect(changes).toEqual([
        ["padding-top", "15px"],
        ["padding-bottom", "15px"],
      ]);
      expect(hintText()).toBe("Changing top and bottom");
    });
  });

  describe("Shift: all sides", () => {
    const shift = (type: "keydown" | "keyup") =>
      act(() => {
        window.dispatchEvent(new KeyboardEvent(type, { key: "Shift", shiftKey: type === "keydown", bubbles: true }));
      });
    const paired = () => ["top", "right", "bottom", "left"].filter((n) => side(n).hasAttribute("data-paired"));

    it("hovering with Shift highlights the other three sides; the hint says so without advertising Shift", () => {
      act(() => {
        side("top").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1 }));
      });
      expect(hintText()).toBe("Hold Alt to change both sides");
      shift("keydown");
      expect(paired()).toEqual(["right", "bottom", "left"]);
      expect(hintText()).toBe("Drag to change all sides");
      shift("keyup");
      expect(paired()).toEqual([]);
    });

    it("a Shift-drag sets all four sides, as one undo step", () => {
      drag("top", "pointerdown", 0, 100);
      drag("top", "pointermove", 0, 90);
      act(() => {
        side("top").dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: 1, clientX: 0, clientY: 90, shiftKey: true }),
        );
      });
      expect(changes.slice(-4).map(([p]) => p).sort()).toEqual(["padding-bottom", "padding-left", "padding-right", "padding-top"]);
      expect(new Set(changes.slice(-4).map(([, v]) => v))).toEqual(new Set(["20px"]));
      expect(new Set(gestures)).toEqual(new Set([gestures[0]]));
      expect(hintText()).toBe("Changing all sides");
    });

    it("switching from Shift to Alt mid-drag reverts the sides that drop out", () => {
      drag("left", "pointerdown", 100, 0);
      act(() => {
        side("left").dispatchEvent(
          new PointerEvent("pointermove", { bubbles: true, cancelable: true, pointerId: 1, clientX: 90, clientY: 0, shiftKey: true }),
        );
      });
      drag("left", "pointermove", 89, 0, true); // Alt only now
      expect(reverts.sort()).toEqual(["padding-bottom", "padding-top"]);
      expect(paired()).toEqual(["right"]);
    });

    it("Shift wins over Alt", () => {
      act(() => {
        side("right").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, altKey: true, shiftKey: true }));
      });
      expect(paired()).toEqual(["top", "bottom", "left"]);
    });
  });

  describe("showing the padding on the page", () => {
    const shown = () => inspects.at(-1)?.map((a) => `${a.box}-${a.side}`).sort() ?? null;
    const move = (target: Element, init: PointerEventInit = {}) =>
      act(() => {
        target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, ...init }));
      });

    it("shows the hovered side, then what Alt and Shift add, then nothing on leave", () => {
      move(side("left"));
      expect(shown()).toEqual(["padding-left"]);
      move(side("left"), { altKey: true });
      expect(shown()).toEqual(["padding-left", "padding-right"]);
      move(side("left"), { shiftKey: true });
      expect(shown()).toEqual(["padding-bottom", "padding-left", "padding-right", "padding-top"]);
      act(() => {
        side("left").dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
      });
      expect(shown()).toBeNull();
    });

    it("doesn't show anything while the pointer is on the number", () => {
      move(side("top"));
      move(number("top"));
      expect(shown()).toBeNull();
    });

    it("keeps showing the dragged side during a drag", () => {
      drag("bottom", "pointerdown", 0, 0);
      drag("bottom", "pointermove", 0, 8, true);
      expect(shown()).toEqual(["padding-bottom", "padding-top"]);
    });
  });

  it("keeps the dragged side highlighted during the drag", () => {
    drag("right", "pointerdown", 0, 0);
    drag("right", "pointermove", 10, 0);
    expect(side("right").hasAttribute("data-dragging")).toBe(true);
  });
});

describe("PaddingEditor keyboard", () => {
  const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label");
  const press = (el: Element, key: string, init: KeyboardEventInit = {}) =>
    act(() => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
    });
  const typeInto = (name: string, text: string) =>
    act(() => {
      number(name).textContent = text;
    });

  it("focuses the side named by the alias", () => {
    for (const [query, label] of [
      ["pt", "Padding top"],
      ["pr", "Padding right"],
      ["pb", "Padding bottom"],
      ["pl", "Padding left"],
      ["padding-right", "Padding right"],
      ["padding", "Padding top"],
    ]) {
      act(() => requestFocus(query as string));
      expect(focused(), query).toBe(label);
    }
  });

  it("px links left and right: one typed value sets both, as one undo step", () => {
    act(() => requestFocus("px"));
    expect(focused()).toBe("Padding left");
    expect(side("left").hasAttribute("data-linked")).toBe(true);
    expect(side("right").hasAttribute("data-linked")).toBe(true);
    expect(side("top").hasAttribute("data-linked")).toBe(false);
    typeInto("left", "8");
    press(number("left"), "Enter");
    expect(changes).toEqual([
      ["padding-left", "8px"],
      ["padding-right", "8px"],
    ]);
    expect(gestures[0]).toBeDefined();
    expect(gestures[1]).toBe(gestures[0]);
  });

  it("mirrors the edit on the linked side: selection, then typed text, then the applied value", () => {
    act(() => requestFocus("py"));
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(number("bottom").hasAttribute("data-mirror-selected")).toBe(true);
    expect(number("left").hasAttribute("data-mirror-selected")).toBe(false); // not linked

    act(() => {
      // Typing replaces the selection and leaves a caret after the new text.
      number("top").textContent = "3";
      document.getSelection()?.collapse(number("top"), 1);
      number("top").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(number("bottom").textContent).toBe("3");
    expect(number("bottom").hasAttribute("data-mirror-selected")).toBe(false);
    expect(changes).toEqual([]); // only shown, not applied yet

    press(number("top"), "Enter");
    expect(changes).toEqual([
      ["padding-top", "3px"],
      ["padding-bottom", "3px"],
    ]);
    expect(number("bottom").textContent).toBe("3");
    expect(number("bottom").hasAttribute("data-mirror-selected")).toBe(false);
  });

  it("Esc on a linked side puts both sides back", () => {
    act(() => requestFocus("px"));
    act(() => {
      number("left").textContent = "77";
      number("left").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(number("right").textContent).toBe("77");
    press(number("left"), "Escape");
    act(() => number("left").blur());
    expect([number("left").textContent, number("right").textContent]).toEqual(["20", "20"]);
    expect(changes).toEqual([]);
  });

  it("linked sides keep their own values until something is typed", () => {
    const shown = () => ["top", "right", "bottom", "left"].map((n) => number(n).textContent);
    act(() => requestFocus("p"));
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(shown()).toEqual(["10", "20", "10", "20"]);
    expect(changes).toEqual([]);
    // Only the selection highlight is mirrored before typing.
    expect(["right", "bottom", "left"].every((n) => number(n).hasAttribute("data-mirror-selected"))).toBe(true);

    act(() => {
      number("top").textContent = "5";
      document.getSelection()?.collapse(number("top"), 1);
      number("top").dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(shown()).toEqual(["5", "5", "5", "5"]);

    press(number("top"), "Escape");
    expect(shown()).toEqual(["10", "20", "10", "20"]);
  });

  it("p links all four sides", () => {
    act(() => requestFocus("p"));
    typeInto("top", "4");
    press(number("top"), "Enter");
    expect(changes.map(([p]) => p).sort()).toEqual(["padding-bottom", "padding-left", "padding-right", "padding-top"]);
  });

  it("moving to a side outside the linked group ends the link", () => {
    act(() => requestFocus("py"));
    press(number("top"), "Tab"); // → right, not part of py
    expect(focused()).toBe("Padding right");
    expect(side("top").hasAttribute("data-linked")).toBe(false);
  });

  it("Tab/Shift+Tab move through the sides in CSS order, back to the search past either end", () => {
    act(() => requestFocus("pt"));
    press(number("top"), "Tab");
    expect(focused()).toBe("Padding right");
    press(number("right"), "Tab");
    press(number("bottom"), "Tab");
    expect(focused()).toBe("Padding left");
    press(number("left"), "Tab");
    expect(returned).toBe(1);
    act(() => requestFocus("pt"));
    press(number("top"), "Tab", { shiftKey: true });
    expect(returned).toBe(2);
  });

  it("Tab commits the typed value before moving on", () => {
    act(() => requestFocus("pt"));
    typeInto("top", "30");
    press(number("top"), "Tab");
    expect(changes).toEqual([["padding-top", "30px"]]);
  });

  it("Enter applies the value once and returns to the search", () => {
    act(() => requestFocus("pr"));
    typeInto("right", "44");
    press(number("right"), "Enter");
    expect(changes).toEqual([["padding-right", "44px"]]);
    expect(returned).toBe(1);
  });

  it("Esc discards the typed text", () => {
    act(() => requestFocus("pb"));
    typeInto("bottom", "99");
    press(number("bottom"), "Escape");
    expect(number("bottom").textContent).toBe("10");
    act(() => number("bottom").blur());
    expect(changes).toEqual([]);
  });
});

describe("parseValue", () => {
  it("accepts numbers with an optional px unit", () => {
    expect(parseValue("12")).toBe(12);
    expect(parseValue(" 12.5px ")).toBe(12.5);
    expect(parseValue("-4")).toBe(0);
    expect(parseValue("abc")).toBeNull();
    expect(parseValue("")).toBeNull();
  });
});
