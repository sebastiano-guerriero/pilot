// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { inlinePreview } from "../test/inlinePreview.ts";
import { EditHistory, historyShortcut } from "./history.ts";

let el: HTMLElement;
let history: EditHistory;
beforeEach(() => {
  el = document.createElement("div");
  history = new EditHistory(inlinePreview());
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

  it("a shorthand replaces its longhands' changes; `again` writes one after it even when it gives the same value", () => {
    // Any shorthand (transition's rows after its panels; padding here, which the test DOM expands).
    history.apply(el, "padding-top", "10px");
    expect(history.setsItself(el, "padding-top", "base")).toBe(true);
    history.apply(el, "padding", "10px");
    // Replaced: the shorthand gives it now.
    expect(history.setsItself(el, "padding-top", "base")).toBe(false);
    expect(history.changes().map((c) => c.property)).toEqual(["padding"]);
    // Unchanged, so nothing to record; again, a change of its own, after the shorthand.
    history.apply(el, "padding-top", "10px");
    expect(history.changes().map((c) => c.property)).toEqual(["padding"]);
    history.apply(el, "padding-top", "10px", undefined, { again: true });
    expect(history.changes().map((c) => c.property)).toEqual(["padding", "padding-top"]);
    expect(history.setsItself(el, "padding-top", "base")).toBe(true);
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

describe("the preview's rules", () => {
  // Records what the history hands its preview.
  let rendered: string[];
  const recording = () =>
    new EditHistory({
      render: (rules) => {
        rendered = rules.map((r) => `${r.property}: ${r.value}${r.widths ? ` @${r.widths.min ?? ""}-${r.widths.max ?? ""}` : ""}`);
      },
    });
  beforeEach(() => {
    rendered = [];
  });

  it("every change in effect, in the order made; undo leaves one out", () => {
    const h = recording();
    h.apply(el, "padding-top", "10px");
    h.apply(el, "padding-top", "40px", undefined, { widths: { min: 1200 } });
    expect(rendered).toEqual(["padding-top: 10px", "padding-top: 40px @1200-"]);
    h.undo();
    expect(rendered).toEqual(["padding-top: 10px"]);
    h.redo();
    expect(rendered).toEqual(["padding-top: 10px", "padding-top: 40px @1200-"]);
  });

  it("a later change replaces the same property's for the same widths, and moves after the others", () => {
    const h = recording();
    h.apply(el, "padding-top", "10px");
    h.apply(el, "padding-top", "40px", undefined, { widths: { min: 1200 } });
    h.apply(el, "padding-top", "12px");
    expect(rendered).toEqual(["padding-top: 40px @1200-", "padding-top: 12px"]);
  });

  it("a shorthand replaces its longhands; clearing to '' leaves nothing", () => {
    const h = recording();
    h.apply(el, "padding-top", "4px");
    h.apply(el, "padding", "10px");
    expect(rendered).toEqual(["padding: 10px"]);
    h.apply(el, "padding", "");
    expect(rendered).toEqual([]);
  });

  it("valueOf and removalOf: what Pilot sets at a given width", () => {
    const h = recording();
    h.apply(el, "padding-top", "10px");
    h.apply(el, "padding-top", "40px", undefined, { widths: { min: 1200 } });
    h.apply(el, "padding-top", "revert", undefined, {
      widths: { max: 767 },
      removal: { from: "8px", source: { kind: "inline" } },
    });
    expect(h.valueOf(el, "padding-top", 1440)).toBe("40px");
    expect(h.valueOf(el, "padding-top", 1000)).toBe("10px");
    expect(h.removalOf(el, "padding-top", 1000)).toBeNull();
    expect(h.removalOf(el, "padding-top", 375)).toEqual({ from: "8px", source: { kind: "inline" } });
    expect(h.valueOf(el, "padding-bottom", 1440)).toBeNull();
  });

  it("valueOf reads a longhand out of a shorthand", () => {
    const h = recording();
    h.apply(el, "padding", "10px 20px");
    expect(h.valueOf(el, "padding-right", 1000)).toBe("20px");
  });

  it("clearing a side after a shorthand: the side falls back to the page's value (revert-layer)", () => {
    const h = recording();
    h.apply(el, "padding", "12px");
    h.apply(el, "padding-top", "");
    expect(rendered).toEqual(["padding: 12px", "padding-top: revert-layer"]);
    expect(h.valueOf(el, "padding-top", 1000)).toBeNull();
    expect(h.valueOf(el, "padding-left", 1000)).toBe("12px");
    expect(h.changes().map((c) => c.property)).toEqual(["padding"]);
  });
});


describe("changes under a condition", () => {
  const open = { words: "it has data-open", selector: "&[data-open]" };
  let shown: Array<{ property: string; value: string; condition?: unknown }>;
  const recording = () =>
    new EditHistory({
      render: (rules) => {
        shown = rules.map((r) => ({ property: r.property, value: r.value, ...(r.condition ? { condition: r.condition } : {}) }));
      },
    });

  it("are their own: they don't replace the element's value, and its value doesn't replace them", () => {
    const h = recording();
    h.apply(el, "color", "red");
    h.apply(el, "color", "blue", undefined, { condition: open });
    h.apply(el, "color", "green");
    expect(h.valueOf(el, "color", "base")).toBe("green");
    expect(h.valueOf(el, "color", "base", undefined, open)).toBe("blue");
    // Another phrasing of the same condition is the same condition.
    expect(h.valueOf(el, "color", "base", undefined, { words: "with data-open", selector: "&[data-open]" })).toBe("blue");
    expect(h.changes().map((c) => [c.value, c.condition?.selector ?? ""])).toEqual([
      ["blue", "&[data-open]"],
      ["green", ""],
    ]);
  });

  it("forced, shown as if it held (the condition left out), the preview only; not forced: as the page says", () => {
    const h = recording();
    h.apply(el, "color", "blue", undefined, { condition: open });
    expect(shown).toEqual([{ property: "color", value: "blue", condition: open }]);
    h.force(open, true);
    // Its CSS left out, still a condition's change (in Pilot's layer, over the project's rules).
    expect(shown).toEqual([{ property: "color", value: "blue", condition: {} }]);
    expect(h.forced(open)).toBe(true);
    h.force(open, false);
    expect(shown).toEqual([{ property: "color", value: "blue", condition: open }]);
    // Never recorded: the change is the same.
    expect(h.changes()[0]?.condition).toEqual(open);
  });

  it("words only (Pilot couldn't read them): recorded, shown only when forced; two of them are two conditions", () => {
    const h = recording();
    const loggedIn = { words: "when the user is logged in" };
    h.apply(el, "color", "red", undefined, { condition: loggedIn });
    h.apply(el, "color", "blue", undefined, { condition: { words: "on sale" } });
    expect(shown).toEqual([]);
    expect(h.valueOf(el, "color", "base", undefined, loggedIn)).toBe("red");
    h.force(loggedIn, true);
    expect(shown).toEqual([{ property: "color", value: "red", condition: {} }]);
  });
});
