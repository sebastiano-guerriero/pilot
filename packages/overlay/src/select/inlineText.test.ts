// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEXT_EDIT_ATTRIBUTE, TEXT_PROPERTY } from "../dom/text.ts";
import { EditHistory } from "../edits/history.ts";
import { inlinePreview } from "../test/inlinePreview.ts";
import { commitText } from "../ui/App.tsx";
import { editText } from "./inlineText.ts";

let heading: HTMLHeadingElement;
let history: EditHistory;

beforeEach(() => {
  document.body.innerHTML = `<h1 class="title">Ship faster</h1>`;
  heading = document.querySelector("h1") as HTMLHeadingElement;
  history = new EditHistory(inlinePreview());
});
afterEach(() => {
  history.clear();
  document.body.innerHTML = "";
});

const key = (k: string) => heading.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("editText", () => {
  it("makes the element editable while it's edited, then puts its attributes back", () => {
    heading.setAttribute("spellcheck", "true");
    const results: Array<string | null> = [];
    editText(heading, null, (t) => results.push(t));
    expect(heading.getAttribute("contenteditable")).toMatch(/plaintext-only|true/);
    expect(heading.hasAttribute(TEXT_EDIT_ATTRIBUTE)).toBe(true);
    expect(document.activeElement).toBe(heading);
    key("Enter");
    expect(results).toEqual(["Ship faster"]);
    expect(heading.hasAttribute("contenteditable")).toBe(false);
    expect(heading.hasAttribute(TEXT_EDIT_ATTRIBUTE)).toBe(false);
    expect(heading.getAttribute("spellcheck")).toBe("true");
  });

  it("Enter is done with what's typed; the element is back as it was, for the preview to show it", () => {
    const node = heading.firstChild as Text;
    let done: string | null = "";
    editText(heading, null, (t) => {
      done = t;
    });
    // Typing replaced the node (deleting everything, then typing again does).
    heading.replaceChildren(document.createTextNode("Ship slower"));
    key("Enter");
    expect(done).toBe("Ship slower");
    expect(heading.firstChild).toBe(node);
    expect(node.data).toBe("Ship faster");
  });

  it("Esc cancels: nothing to record, the text as it was", () => {
    let done: string | null = "";
    editText(heading, null, (t) => {
      done = t;
    });
    (heading.firstChild as Text).data = "Ship";
    key("Escape");
    expect(done).toBeNull();
    expect(heading.textContent).toBe("Ship faster");
  });

  it("keys typed in it don't reach the page's own handlers", () => {
    const heard: string[] = [];
    document.body.addEventListener("keydown", (e) => heard.push(e.key));
    document.body.addEventListener("input", () => heard.push("input"));
    editText(heading, null, () => {});
    key("a");
    heading.dispatchEvent(new Event("input", { bubbles: true }));
    key("Enter");
    expect(heard).toEqual([]);
  });

  it("finish() from outside ends it once (the selection moved)", () => {
    const results: Array<string | null> = [];
    const { finish } = editText(heading, null, (t) => results.push(t));
    finish(true);
    finish(true);
    key("Enter");
    expect(results).toEqual(["Ship faster"]);
  });
});

describe("editing a run inside an element with child elements", () => {
  it("only the run is editable, in a span that goes away afterwards; the rest is untouched", () => {
    document.body.innerHTML = `<p>A sample page, <code>/pilot</code> launches it.</p>`;
    const p = document.querySelector("p") as HTMLParagraphElement;
    const [before, code, after] = [...p.childNodes];
    let done: string | null = "";
    const { host } = editText(p, null, (t) => {
      done = t;
    }, [after as Text]);
    expect(host.localName).toBe("span");
    expect(host.getAttribute("contenteditable")).toMatch(/plaintext-only|true/);
    expect(p.hasAttribute("contenteditable")).toBe(false);
    expect(host.firstChild).toBe(after);
    (after as Text).data = " starts it.";
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(done).toBe(" starts it.");
    expect([...p.childNodes]).toEqual([before, code, after]);
    expect(p.innerHTML).toBe("A sample page, <code>/pilot</code> launches it.");
  });

  it("commitText records it for that run", () => {
    document.body.innerHTML = `<p>A sample page, <code>/pilot</code> launches it.</p>`;
    const p = document.querySelector("p") as HTMLParagraphElement;
    commitText(history, p, " starts it.", 1);
    expect(history.changes()).toMatchObject([{ property: "text:1", value: " starts it.", from: " launches it." }]);
    expect(p.innerHTML).toBe("A sample page, <code>/pilot</code> starts it.");
  });
});

describe("commitText", () => {
  it("records the typed text as a change, the page's own as its from", () => {
    commitText(history, heading, "Ship today");
    expect(history.changes()).toMatchObject([{ property: TEXT_PROPERTY, value: "Ship today", from: "Ship faster" }]);
    expect(heading.textContent).toBe("Ship today");
  });

  it("the page's own text again (whitespace aside) drops Pilot's change", () => {
    commitText(history, heading, "Ship today");
    commitText(history, heading, " Ship  faster ");
    expect(history.changes()).toEqual([]);
    expect(heading.textContent).toBe("Ship faster");
    history.undo();
    expect(heading.textContent).toBe("Ship today");
  });

  it("no change: unchanged text, or emptied", () => {
    commitText(history, heading, "Ship faster");
    commitText(history, heading, "   ");
    expect(history.changes()).toEqual([]);
  });

  it("a no-break space typed at the end is a space", () => {
    commitText(history, heading, "Ship now");
    expect(history.changes()[0]?.value).toBe("Ship now");
  });
});
