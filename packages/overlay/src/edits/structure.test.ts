// @vitest-environment happy-dom
import { formatPrompt } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NEW_ATTRIBUTE } from "../dom/structure.ts";
import { describeElement } from "../dom/target.ts";
import { buildChangeSet } from "./changeSet.ts";
import { EditHistory } from "./history.ts";
import { resolveTarget } from "./persist.ts";
import { addElements, duplicateElements, removeElements } from "./structure.ts";
import { checkJob } from "./verify.ts";

let list: HTMLElement;
let first: HTMLElement;
let second: HTMLElement;
let history: EditHistory;

beforeEach(() => {
  document.body.innerHTML = `<ul class="list"><li id="one" class="item"><b>One</b></li><li class="item">Two</li></ul>`;
  list = document.querySelector("ul") as HTMLElement;
  first = document.querySelector("#one") as HTMLElement;
  second = list.children[1] as HTMLElement;
  history = new EditHistory();
});
afterEach(() => {
  history.clear();
  document.body.innerHTML = "";
});

/** The preview's rules for an element (happy-dom doesn't apply layered `!important` rules to computed styles). */
const previewOf = (element: Element) => {
  const id = element.getAttribute("data-pilot-edit");
  const sheet = document.querySelector("style[data-pilot-preview]")?.textContent ?? "";
  return id ? sheet.split("\n").filter((l) => l.includes(`[data-pilot-edit="${id}"]`)).join("\n") : "";
};

const tags = () => [...list.children].map((c) => (c.hasAttribute(NEW_ATTRIBUTE) ? `new ${c.textContent}` : c.textContent));

describe("Delete", () => {
  it("hides the element, leaving it on the page; undo shows it again", () => {
    removeElements(history, [second]);
    expect(second.isConnected).toBe(true);
    expect(previewOf(second)).toContain("display: none !important");
    expect(history.removed().has(second)).toBe(true);
    history.undo();
    expect(previewOf(second)).toBe("");
  });

  it("is a deletion in the change set, and only that", () => {
    history.apply(second, "padding-top", "4px");
    removeElements(history, [second]);
    const [edit] = buildChangeSet(history).edits;
    expect(edit?.removed).toBe(true);
    expect(edit?.changes).toEqual([]);
    expect(formatPrompt(buildChangeSet(history))).toContain("**Deleted**: remove this element from the code.");
  });

  it("can't delete the body", () => {
    removeElements(history, [document.body]);
    expect(history.changes()).toEqual([]);
  });
});

describe("Duplicate", () => {
  it("adds a copy right after the element, without its id; one undo step takes it back", () => {
    const [copy] = duplicateElements(history, [first]);
    expect(tags()).toEqual(["One", "new One", "Two"]);
    expect(copy?.id).toBe("");
    expect(copy?.className).toBe("item");
    history.undo();
    expect(tags()).toEqual(["One", "Two"]);
  });

  it("carries Pilot's changes to the element and its children over to the copy", () => {
    history.apply(first, "padding-top", "24px");
    history.apply(first.querySelector("b") as HTMLElement, "color", "red");
    const [copy] = duplicateElements(history, [first]) as [HTMLElement];
    expect(history.valueOf(copy, "padding-top")).toBe("24px");
    expect(history.valueOf(copy.querySelector("b") as HTMLElement, "color")).toBe("red");
    // From then on they're apart.
    history.apply(first, "padding-top", "8px");
    expect(history.valueOf(copy, "padding-top")).toBe("24px");
    history.undo();
    history.undo();
    expect(tags()).toEqual(["One", "Two"]);
    expect(history.valueOf(first, "padding-top")).toBe("24px");
  });

  it("leaves out the children deleted in the element", () => {
    removeElements(history, [first.querySelector("b") as HTMLElement]);
    const [copy] = duplicateElements(history, [first]);
    expect(copy?.querySelector("b")).toBeNull();
  });

  it("the change set: an insert on the element, the copy's changes as a new element's", () => {
    const [copy] = duplicateElements(history, [first]) as [HTMLElement];
    history.apply(copy, "margin-top", "2px");
    const set = buildChangeSet(history);
    expect(set.edits.map((e) => [e.target.tag, e.inserts, e.newElement])).toEqual([
      ["li", [{ id: "new-1", place: "after", kind: "copy", tag: "li" }], undefined],
      ["li", undefined, "new-1"],
    ]);
    const prompt = formatPrompt(set);
    expect(prompt).toContain("- Right after this element: a copy of this element as the page shows it (its children too), new element `new-1`");
    expect(prompt).toContain("(in new element `new-1`)");
    // Pilot's own selector for it means nothing in the code.
    expect(prompt).not.toContain(NEW_ATTRIBUTE);
  });

  it("the page's selectors and texts leave the copies out", () => {
    const before = describeElement(second).selector;
    duplicateElements(history, [first]);
    expect(describeElement(second).selector).toBe(before);
    expect(describeElement(list).text).toBe("OneTwo");
    expect(resolveTarget(describeElement(second), location.pathname)).toBe(second);
  });

  it("puts a copy back when the page takes it out (a re-render)", async () => {
    const [copy] = duplicateElements(history, [first]) as [HTMLElement];
    copy.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(tags()).toEqual(["One", "new One", "Two"]);
  });
});

describe("Add child, Add sibling", () => {
  it("adds a new empty div inside the element, or after it", () => {
    const [child] = addElements(history, [list], "inside");
    const [sibling] = addElements(history, [first], "after");
    expect(list.lastElementChild).toBe(child);
    expect(first.nextElementSibling).toBe(sibling);
    expect(child?.outerHTML).toMatch(/^<div data-pilot-new="[^"]+"><\/div>$/);
    expect(buildChangeSet(history).edits.flatMap((e) => e.inserts ?? [])).toEqual([
      { id: "new-1", place: "inside", kind: "new", tag: "div" },
      { id: "new-2", place: "after", kind: "new", tag: "div" },
    ]);
  });

  it("the body can have children, not siblings", () => {
    expect(addElements(history, [document.body], "after")).toEqual([]);
    expect(addElements(history, [document.body], "inside")).toHaveLength(1);
  });

  it("deleting a new element takes it back: it was never in the code", () => {
    const [child] = addElements(history, [list], "inside") as [HTMLElement];
    history.apply(child, "height", "20px");
    removeElements(history, [child]);
    expect(child.isConnected).toBe(false);
    expect(buildChangeSet(history).edits).toEqual([]);
    history.undo();
    expect(child.isConnected).toBe(true);
  });
});

describe("after a reload", () => {
  it("the copies come back where they were, with the changes inside them", () => {
    const [copy] = duplicateElements(history, [first]) as [HTMLElement];
    history.apply(copy.querySelector("b") as HTMLElement, "color", "blue");
    const saved = JSON.parse(JSON.stringify(history.serialize()));
    history.clear();
    expect(tags()).toEqual(["One", "Two"]);
    const restored = new EditHistory();
    restored.load(saved, resolveTarget);
    expect(tags()).toEqual(["One", "new One", "Two"]);
    const again = list.children[1] as HTMLElement;
    expect(restored.valueOf(again.querySelector("b") as HTMLElement, "color")).toBe("blue");
    restored.clear();
  });
});

describe("the check after done", () => {
  it("a deletion lands once the page no longer has the element", () => {
    removeElements(history, [second]);
    history.send("job-1");
    expect(checkJob(history, "job-1").results.map((r) => r.outcome)).toEqual(["differs"]);
    second.remove(); // the agent's edit, after hot reload
    expect(checkJob(history, "job-1").results.map((r) => r.outcome)).toEqual(["landed"]);
  });

  it("a new element lands once its parent has one more of the page's own; the changes on it follow", () => {
    const [copy] = duplicateElements(history, [first]) as [HTMLElement];
    history.apply(copy, "margin-top", "2px");
    history.send("job-1");
    let check = checkJob(history, "job-1");
    expect(check.differs).toHaveLength(2);
    expect(check.results.map((r) => r.outcome)).toEqual(["differs", "unchecked"]);
    list.append(document.createElement("li")); // the agent's copy
    check = checkJob(history, "job-1");
    expect(check.landed).toHaveLength(2);
  });
});
