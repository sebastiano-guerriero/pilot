// @vitest-environment happy-dom
import { formatPrompt } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildChangeSet } from "../edits/changeSet.ts";
import { EditHistory } from "../edits/history.ts";
import { checkJob } from "../edits/verify.ts";
import { inlinePreview } from "../test/inlinePreview.ts";
import { describeElement } from "./target.ts";
import { TEXT_PROPERTY, holdText, isTextOnly, normalizeText, pageTextContent } from "./text.ts";

let button: HTMLButtonElement;
let label: Text;
let history: EditHistory;

beforeEach(() => {
  document.body.innerHTML = `<div class="card"><button class="cta">
    Get started
  </button></div>`;
  button = document.querySelector("button") as HTMLButtonElement;
  label = button.firstChild as Text;
  history = new EditHistory(inlinePreview());
});
afterEach(() => {
  history.clear();
  document.body.innerHTML = "";
});

/** What the page's own code does on a re-render: writes into the node it holds. */
const pageWrites = (node: Text, data: string) => {
  node.data = data;
};

describe("isTextOnly", () => {
  it("elements whose content is text only, some of it visible", () => {
    expect(isTextOnly(button)).toBe(true);
    const p = document.createElement("p");
    p.innerHTML = "Hello <strong>world</strong>";
    expect(isTextOnly(p)).toBe(false);
    expect(isTextOnly(p.querySelector("strong") as Element)).toBe(true);
    p.innerHTML = "One<br>Two";
    expect(isTextOnly(p)).toBe(false);
    p.innerHTML = "  \n ";
    expect(isTextOnly(p)).toBe(false);
    p.innerHTML = "Hi<!-- a comment -->";
    expect(isTextOnly(p)).toBe(true);
    const area = document.createElement("textarea");
    area.textContent = "typed";
    expect(isTextOnly(area)).toBe(false);
  });
});

describe("the text preview", () => {
  it("writes the text into the element's own text node (the node stays), and undo puts the page's back", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    expect(button.textContent).toBe("Start free trial");
    expect(button.firstChild).toBe(label);
    expect(pageTextContent(button)).toContain("Get started");
    history.undo();
    expect(button.textContent).toBe("\n    Get started\n  ");
    expect(button.firstChild).toBe(label);
    history.redo();
    expect(button.textContent).toBe("Start free trial");
  });

  it("several text nodes (a framework's `{a} {b}`): the first gets the text, the others are emptied", () => {
    button.replaceChildren("Get", " ", "started");
    const nodes = [...button.childNodes];
    history.apply(button, TEXT_PROPERTY, "Go");
    expect(nodes.map((n) => (n as Text).data)).toEqual(["Go", "", ""]);
    expect(pageTextContent(button)).toBe("Get started");
    history.undo();
    expect(nodes.map((n) => (n as Text).data)).toEqual(["Get", " ", "started"]);
  });

  it("what the page writes is its own text now (hot reload), and Pilot's is shown over it", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    pageWrites(label, "Start now");
    expect(history.pageText(button)).toBe("Start now");
    expect(button.textContent).toBe("Start free trial");
    history.undo();
    expect(button.textContent).toBe("Start now");
  });

  it("the page replacing the text node: the new one is taken in", async () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    button.replaceChildren(document.createTextNode("Sign up"));
    expect(history.pageText(button)).toBe("Sign up");
    expect(button.textContent).toBe("Start free trial");
  });

  it("an ancestor's description uses the page's text, so the agent greps for what's in the source", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    expect(describeElement(button.parentElement as Element).text).toBe("Get started");
  });

  it("leaves an element being edited inline alone: typing there isn't the page", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    const release = holdText(button);
    label.data = "Start free tr"; // the designer deleting
    label.data = "Start free trial"; // and putting it back
    release();
    expect(history.pageText(button)).toBe("\n    Get started\n  ");
  });
});

describe("a text change in the history, the change set and the check", () => {
  it("one undo step, saved and restored after a reload", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial", undefined, { from: label.data });
    const saved = JSON.parse(JSON.stringify(history.serialize()));
    history.clear();
    expect(button.textContent?.trim()).toBe("Get started");
    const restored = new EditHistory(inlinePreview());
    restored.load(saved, () => button);
    expect(button.textContent).toBe("Start free trial");
    restored.clear();
  });

  it("the edit carries its text, from the page's own; no CSS change is listed for it", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    history.apply(button, "padding-top", "12px");
    const [edit] = buildChangeSet(history).edits;
    expect(edit?.text).toEqual({ from: "Get started", to: "Start free trial" });
    expect(edit?.target.text).toBe("Get started");
    expect(edit?.changes.map((c) => c.property)).toEqual(["padding-top"]);
  });

  it("the prompt says it: from and to, quoted", () => {
    history.apply(button, TEXT_PROPERTY, 'Say "hi"');
    const prompt = formatPrompt(buildChangeSet(history));
    expect(prompt).toContain('- From: "Get started"');
    expect(prompt).toContain('- To: "Say \\"hi\\""');
    expect(prompt).not.toContain("| Property |"); // no CSS changes, no table
  });

  it("an element not on the page keeps the text it had when changed", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial", undefined, { from: "Get started" });
    const saved = JSON.parse(JSON.stringify(history.serialize()));
    const elsewhere = new EditHistory(inlinePreview());
    elsewhere.load(saved, () => document.createElement("button"));
    expect(buildChangeSet(elsewhere).edits[0]?.text).toEqual({ from: "Get started", to: "Start free trial" });
  });

  it("checked by the page's own text: differs until the page has the new text, whitespace aside", () => {
    history.apply(button, TEXT_PROPERTY, "Start free trial");
    history.send("j1");
    expect(checkJob(history, "j1").results).toEqual([
      { selector: expect.any(String), property: "text", expected: "Start free trial", outcome: "differs", actual: "Get started" },
    ]);
    pageWrites(label, "\n    Start free trial\n  "); // the agent changed the source; hot reload re-rendered it
    expect(checkJob(history, "j1").results[0]?.outcome).toBe("landed");
  });
});

describe("normalizeText", () => {
  it("whitespace runs as one space, trimmed, no-break spaces as spaces", () => {
    expect(normalizeText("\n  Get  started \n")).toBe("Get started");
  });
});
