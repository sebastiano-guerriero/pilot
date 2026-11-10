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
