// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearProperty } from "./clear.ts";
import { EditHistory } from "./history.ts";

let style: HTMLStyleElement;
let element: HTMLElement;
let history: EditHistory;

beforeEach(() => {
  style = document.createElement("style");
  document.head.append(style);
  element = document.createElement("div");
  element.className = "card";
  document.body.append(element);
  history = new EditHistory();
});
afterEach(() => {
  style.remove();
  element.remove();
});

// Matched rules are cached until the end of the task (see declared.ts).
const nextTask = () => Promise.resolve();

describe("clearProperty", () => {
  it("only Pilot set it: Pilot's value is dropped, nothing to remove", () => {
    history.apply(element, "gap", "10px");
    clearProperty(history, element, "gap");
    expect(element.style.gap).toBe("");
    expect(history.removalOf(element, "gap")).toBeNull();
  });

  it("a stylesheet sets it: a removal, previewed with revert when no other rule declares it", () => {
    style.textContent = ".card { gap: 16px; }";
    clearProperty(history, element, "gap");
    expect(element.style.gap).toBe("revert");
    expect(history.removalOf(element, "gap")).toEqual({
      from: "16px",
      source: { kind: "rule", selector: ".card", elements: 1 },
    });
  });

  it("previews the next rule in the cascade when there is one", async () => {
    style.textContent = "div { gap: 8px; } .card { gap: 16px; }";
    await nextTask();
    clearProperty(history, element, "gap");
    expect(element.style.gap).toBe("8px");
    expect(history.removalOf(element, "gap")?.from).toBe("16px");
  });

  it("over an !important rule, the preview is !important too", async () => {
    style.textContent = ".card { gap: 16px !important; }";
    await nextTask();
    clearProperty(history, element, "gap");
    expect(element.style.getPropertyPriority("gap")).toBe("important");
  });

  it("the app's own style attribute: removed from it, the stylesheet's value shows", async () => {
    style.textContent = ".card { gap: 4px; }";
    element.style.gap = "16px";
    await nextTask();
    clearProperty(history, element, "gap");
    expect(element.style.gap).toBe("");
    expect(history.removalOf(element, "gap")).toEqual({ from: "16px", source: { kind: "inline" } });
  });

  it("after Pilot changed it, the removed value is still the page's own", async () => {
    style.textContent = ".card { gap: 16px; }";
    await nextTask();
    history.apply(element, "gap", "20px");
    clearProperty(history, element, "gap");
    expect(history.removalOf(element, "gap")?.from).toBe("16px");
  });

  it("is undoable, and a new value replaces the removal", async () => {
    style.textContent = ".card { gap: 16px; }";
    await nextTask();
    clearProperty(history, element, "gap");
    history.undo();
    expect(element.style.gap).toBe("");
    expect(history.removalOf(element, "gap")).toBeNull();
    history.redo();
    expect(history.removalOf(element, "gap")).not.toBeNull();
    history.apply(element, "gap", "revert"); // even the same text as the preview
    expect(history.removalOf(element, "gap")).toBeNull();
  });

  // happy-dom expands padding (not gap, unlike browsers): a shorthand case.
  it("a shorthand: removed, and the page's own value read back from its longhands", async () => {
    style.textContent = ".card { padding: 16px; }";
    await nextTask();
    history.apply(element, "padding", "20px");
    clearProperty(history, element, "padding");
    expect(history.removalOf(element, "padding")?.from).toBe("16px");
    expect(element.style.paddingTop).toBe("revert");
  });

  it("a shorthand set in the app's own style attribute is the page's, not Pilot's", () => {
    element.style.padding = "4px";
    history.apply(element, "padding", "20px");
    expect(history.originalInline(element, "padding")).toEqual({ value: "4px", important: false });
  });

  it("a removal records the rule's media query and the widths it's for", () => {
    style.textContent = "@media (min-width: 1px) { .card { gap: 16px; } }";
    clearProperty(history, element, "gap", undefined, { min: 1200 });
    expect(history.removalOf(element, "gap")?.source).toEqual({
      kind: "rule",
      selector: ".card",
      elements: 1,
      media: "(min-width: 1px)",
    });
    expect(history.changes()[0]?.widths).toEqual({ min: 1200 });
  });
});
