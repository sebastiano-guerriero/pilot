// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditHistory } from "../edits/history.ts";
import { usedModifiers } from "./used.ts";

let style: HTMLStyleElement;
let element: HTMLElement;

beforeEach(() => {
  style = document.createElement("style");
  style.textContent = [
    ".btn { padding: 8px; background-color: blue; }",
    ".btn:hover { background-color: navy; }",
    ".btn:hover:active { transform: scale(0.98); }",
    ".btn:focus, .btn:focus-visible { outline: 2px solid red; }",
    "@media (min-width: 768px) { .btn { padding: 12px; } .btn:hover { color: white; } }",
    // Not a modifier of the button's: a reset for every element. An ancestor's state is a condition (listed last).
    "*:focus { outline-offset: 2px; }",
    ".card:hover .btn { color: red; }",
  ].join("\n");
  document.head.append(style);
  element = document.createElement("button");
  element.className = "btn";
  const card = document.createElement("div");
  card.className = "card";
  card.append(element);
  document.body.append(card);
});
afterEach(() => {
  style.remove();
  element.parentElement?.remove();
});

const rows = (history = new EditHistory({ render() {} })) =>
  usedModifiers(element, history).map((m) => `${m.name} | ${m.syntax} | ${m.description}`);

describe("usedModifiers", () => {
  it("each states and width combination something sets, with what it sets: states, then widths, then both", () => {
    expect(rows()).toEqual([
      "Hover | hover: | background",
      "Hover + Active | hover:active: | transform",
      "Focus | focus: | outline",
      "Focus visible | focus-visible: | outline",
      "from 768px | from-768 | padding",
      "Hover, from 768px | hover:from-768 | color",
      ".card:hover & |  | color",
    ]);
  });

  it("the properties in the dialog's own order (layout, appearance, typography…), unknown ones last", () => {
    style.textContent = ".btn:active { color: red; opacity: 0.5; padding: 4px; zoom: 1; }";
    expect(rows()).toEqual(["Active | active: | padding, opacity, color, zoom"]);
  });

  it("Pilot's own changes count too", () => {
    const history = new EditHistory({ render() {} });
    history.apply(element, "opacity", "0.5", undefined, { states: ["active"] });
    expect(rows(history)).toContain("Active | active: | opacity");
  });

  it("Pilot's changes under a condition: a row named by its words, last, picked it sets the condition", () => {
    const history = new EditHistory({ render() {} });
    const selected = { words: "it has data-selected", selector: "&[data-selected]" };
    history.apply(element, "background-color", "red", undefined, { condition: selected });
    // Named by its words until the agent gives it a label, then by the label.
    expect(rows(history).at(-1)).toBe("it has data-selected |  | background");
    expect(usedModifiers(element, history).at(-1)?.used).toEqual({ states: [], condition: selected });
  });

  it("picking one sets exactly its pills", () => {
    const md = usedModifiers(element, new EditHistory({ render() {} })).find((m) => m.syntax === "hover:from-768");
    expect(md?.used).toEqual({ states: ["hover"], widths: { min: 768 } });
  });
});
