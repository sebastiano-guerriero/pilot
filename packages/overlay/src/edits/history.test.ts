// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { EditHistory, historyShortcut } from "./history.ts";

let el: HTMLElement;
let history: EditHistory;
beforeEach(() => {
  el = document.createElement("div");
  history = new EditHistory();
});

describe("EditHistory", () => {
  it("applies, undoes and redoes a change", () => {
    history.apply(el, "padding-top", "12px");
    expect(el.style.paddingTop).toBe("12px");
    expect(history.undo()).toBe(true);
    expect(el.style.paddingTop).toBe("");
    expect(history.redo()).toBe(true);
    expect(el.style.paddingTop).toBe("12px");
  });

  it("restores a previous inline value, not just removes it", () => {
    el.style.paddingTop = "4px";
    history.apply(el, "padding-top", "12px");
    history.undo();
    expect(el.style.paddingTop).toBe("4px");
  });

  it("undoes changes one at a time, newest first", () => {
    history.apply(el, "padding-top", "10px");
    history.apply(el, "padding-top", "20px");
    history.apply(el, "padding-left", "5px");
    history.undo();
    expect([el.style.paddingTop, el.style.paddingLeft]).toEqual(["20px", ""]);
    history.undo();
    expect(el.style.paddingTop).toBe("10px");
  });

  it("groups a gesture (e.g. a drag) into one step", () => {
    const drag = {};
    for (const v of ["11px", "12px", "13px", "14px"]) history.apply(el, "padding-top", v, drag);
    expect(el.style.paddingTop).toBe("14px");
    history.undo();
    expect(el.style.paddingTop).toBe("");
    expect(history.undo()).toBe(false);
  });

  it("groups changes to several properties under one gesture (linked sides)", () => {
    const linked = {};
    history.apply(el, "padding-left", "8px", linked);
    history.apply(el, "padding-right", "8px", linked);
    history.apply(el, "padding-top", "3px");
    history.undo();
    expect([el.style.paddingLeft, el.style.paddingRight, el.style.paddingTop]).toEqual(["8px", "8px", ""]);
    history.undo();
    expect([el.style.paddingLeft, el.style.paddingRight]).toEqual(["", ""]);
    history.redo();
    expect([el.style.paddingLeft, el.style.paddingRight]).toEqual(["8px", "8px"]);
  });

  it("reverts one property of an ongoing gesture to exactly what it was", () => {
    el.style.paddingBottom = "4px";
    const drag = {};
    history.apply(el, "padding-top", "20px", drag);
    history.apply(el, "padding-bottom", "20px", drag);
    history.apply(el, "padding-left", "20px", drag);
    history.revert(el, "padding-bottom", drag);
    history.revert(el, "padding-left", drag);
    expect([el.style.paddingTop, el.style.paddingBottom, el.style.paddingLeft]).toEqual(["20px", "4px", ""]);
    history.undo(); // only padding-top is left in the step
    expect([el.style.paddingTop, el.style.paddingBottom]).toEqual(["", "4px"]);
    expect(history.undo()).toBe(false);
  });

  it("drops a gesture's step entirely when everything in it is reverted", () => {
    history.apply(el, "padding-top", "1px");
    const drag = {};
    history.apply(el, "padding-bottom", "9px", drag);
    history.revert(el, "padding-bottom", drag);
    history.undo();
    expect(el.style.paddingTop).toBe(""); // the earlier change, not an empty step
  });

  it("ignores re-applying the current value", () => {
    history.apply(el, "padding-top", "12px");
    history.apply(el, "padding-top", "12px");
    history.undo();
    expect(history.undo()).toBe(false);
  });

  it("drops the redo stack after a new change", () => {
    history.apply(el, "padding-top", "12px");
    history.undo();
    history.apply(el, "padding-top", "30px");
    expect(history.redo()).toBe(false);
  });
});

describe("historyShortcut", () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
  it("uses Cmd on macOS and Ctrl elsewhere", () => {
    expect(historyShortcut(key({ key: "z", metaKey: true }), true)).toBe("undo");
    expect(historyShortcut(key({ key: "z", ctrlKey: true }), true)).toBeNull();
    expect(historyShortcut(key({ key: "z", ctrlKey: true }), false)).toBe("undo");
    expect(historyShortcut(key({ key: "Z", metaKey: true, shiftKey: true }), true)).toBe("redo");
    expect(historyShortcut(key({ key: "y", ctrlKey: true }), false)).toBe("redo");
    expect(historyShortcut(key({ key: "z" }), true)).toBeNull();
  });
});

describe("shorthands", () => {
  // happy-dom expands padding but not grid-column; browsers expand both
  // (grid-column is checked in the playground).
  it("knows a shorthand's longhands", async () => {
    const { longhandsOf } = await import("./history.ts");
    expect(longhandsOf("padding")).toEqual(["padding-top", "padding-right", "padding-bottom", "padding-left"]);
    expect(longhandsOf("padding-top")).toEqual(["padding-top"]);
  });

  it("undoing a shorthand puts back a longhand that was set on its own", () => {
    history.apply(el, "padding-top", "4px");
    history.apply(el, "padding", "10px");
    expect(el.style.getPropertyValue("padding-top")).toBe("10px");
    history.undo();
    expect(el.style.getPropertyValue("padding-top")).toBe("4px");
    expect(el.style.getPropertyValue("padding-left")).toBe("");
    history.undo();
    expect(el.style.getPropertyValue("padding-top")).toBe("");
  });
});

describe("widths", () => {
  it("records the widths a change is for, a separate change per range", () => {
    history.apply(el, "padding-top", "10px");
    history.apply(el, "padding-top", "20px", undefined, { widths: { min: 1200 } });
    history.apply(el, "padding-top", "24px", undefined, { widths: { min: 1200 } });
    expect(history.changes().map(({ property, value, widths }) => ({ property, value, widths }))).toEqual([
      { property: "padding-top", value: "10px", widths: undefined },
      { property: "padding-top", value: "24px", widths: { min: 1200 } },
    ]);
  });

  it("the same value for other widths is still a change", () => {
    history.apply(el, "padding-top", "10px");
    history.apply(el, "padding-top", "10px", undefined, { widths: { max: 767 } });
    expect(history.changes()).toHaveLength(2);
    history.apply(el, "padding-top", "10px", undefined, { widths: { max: 767 } });
    expect(history.changes()).toHaveLength(2);
  });

  it("undone changes aren't in effect", () => {
    history.apply(el, "padding-top", "10px", undefined, { widths: { min: 768, max: 1199 } });
    history.undo();
    expect(history.changes()).toEqual([]);
  });
});
