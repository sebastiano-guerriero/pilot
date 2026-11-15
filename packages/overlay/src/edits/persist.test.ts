// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inlinePreview } from "../test/inlinePreview.ts";
import { EditHistory } from "./history.ts";
import { persistentHistory, resolveTarget } from "./persist.ts";

let card: HTMLElement;
beforeEach(() => {
  sessionStorage.clear();
  card = document.createElement("div");
  card.id = "card";
  document.body.append(card);
});
afterEach(() => card.remove());

describe("edits survive reloads", () => {
  it("saves after every change; a new page load restores them on the same element", () => {
    const before = persistentHistory();
    before.apply(card, "padding-top", "24px");
    before.apply(card, "gap", "8px", undefined, { widths: { min: 768 } });
    // A reload: the page renders the same element again.
    card.remove();
    card = document.createElement("div");
    card.id = "card";
    document.body.append(card);
    const after = persistentHistory();
    expect(after.valueOf(card, "padding-top", 1000)).toBe("24px");
    expect(after.valueOf(card, "gap", 1000)).toBe("8px");
    expect(after.changes().map((c) => [c.element, c.property])).toEqual([
      [card, "padding-top"],
      [card, "gap"],
    ]);
    // Undo still works after the reload.
    expect(after.undo()).toBe(true);
    expect(after.valueOf(card, "gap", 1000)).toBeNull();
  });

  it("an element that isn't on the page keeps its changes, and finds them again when it's back", () => {
    const history = new EditHistory(inlinePreview());
    history.apply(card, "padding-top", "24px");
    const saved = history.serialize();
    card.remove();
    const restored = new EditHistory(inlinePreview());
    restored.load(saved, resolveTarget);
    const [change] = restored.changes();
    expect(change?.element.isConnected).toBe(false); // a stand-in
    expect(change?.target.selector).toBe("#card"); // still described for the prompt
    document.body.append(card);
    restored.reattach(resolveTarget);
    expect(restored.changes()[0]?.element).toBe(card);
    expect(card.style.paddingTop).toBe("24px");
  });

  it("another page's changes aren't put on this page's elements", () => {
    const history = new EditHistory(inlinePreview());
    history.apply(card, "padding-top", "24px");
    const saved = history.serialize();
    for (const step of saved.done) if (Array.isArray(step)) for (const e of step) e.path = "/other-page";
    const restored = new EditHistory(inlinePreview());
    restored.load(saved, resolveTarget);
    expect(restored.changes()[0]?.element).not.toBe(card);
  });
});

describe("Clear", () => {
  it("clears every change as one undo step; undo brings them back; it survives a reload", () => {
    const history = new EditHistory(inlinePreview());
    history.apply(card, "padding-top", "24px");
    history.apply(card, "gap", "8px");
    history.clear();
    expect(history.changes()).toEqual([]);
    expect(card.style.cssText).toBe("");
    const restored = new EditHistory(inlinePreview());
    restored.load(history.serialize(), resolveTarget);
    expect(restored.changes()).toEqual([]);
    expect(restored.undo()).toBe(true);
    expect(restored.changes().map((c) => c.property)).toEqual(["padding-top", "gap"]);
  });

  it("changes after a Clear start fresh; nothing to clear, no step", () => {
    const history = new EditHistory(inlinePreview());
    history.clear();
    expect(history.undo()).toBe(false);
    history.apply(card, "padding-top", "24px");
    history.clear();
    history.apply(card, "margin-top", "4px");
    expect(history.changes().map((c) => c.property)).toEqual(["margin-top"]);
  });
});

