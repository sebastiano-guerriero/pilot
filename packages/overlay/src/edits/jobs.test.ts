// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inlinePreview } from "../test/inlinePreview.ts";
import { EditHistory } from "./history.ts";
import { PREVIEW_ATTRIBUTE } from "../dom/preview.ts";
import { checkJob, isPageMutation, watchJob } from "./verify.ts";

// The page's own CSS, as a stylesheet the "agent" edits.
let sheet: HTMLStyleElement;
let el: HTMLElement;
let history: EditHistory;
const pageCss = (css: string) => {
  sheet.textContent = css;
};

beforeEach(() => {
  sheet = document.createElement("style");
  document.head.append(sheet);
  el = document.createElement("div");
  el.className = "card";
  document.body.append(el);
  pageCss(".card { padding-top: 10px; border-radius: 4px; }");
  history = new EditHistory(inlinePreview());
});
afterEach(() => {
  sheet.remove();
  el.remove();
  vi.useRealTimers();
});

describe("jobs in the history", () => {
  it("send takes the changes not sent yet; new changes go in the next job", () => {
    history.apply(el, "padding-top", "20px");
    expect(history.send("j1")).toBe(1);
    expect(history.changes({ unsent: true })).toEqual([]);
    history.apply(el, "border-radius", "12px");
    expect(history.changes({ unsent: true }).map((c) => c.property)).toEqual(["border-radius"]);
    expect(history.send("j2")).toBe(1);
    expect(history.changes({ job: "j1" }).map((c) => c.property)).toEqual(["padding-top"]);
    // Sent changes stay on the page.
    expect(el.style.paddingTop).toBe("20px");
  });

  it("settle removes a job's changes for good; the ones kept stay on the page", () => {
    history.apply(el, "padding-top", "20px");
    history.apply(el, "border-radius", "12px");
    history.send("j1");
    history.settle("j1", (c) => c.property === "border-radius");
    expect(history.changes().map((c) => c.property)).toEqual(["border-radius"]);
    expect(el.style.paddingTop).toBe("");
    // Not an undo step: undo can't bring a settled change back.
    history.undo();
    history.undo();
    expect(history.changes()).toEqual([]);
    expect(history.redo()).toBe(true);
    expect(history.changes().map((c) => c.property)).toEqual(["border-radius"]);
  });

  it("unsend: a cancelled job's changes can be sent again", () => {
    history.apply(el, "padding-top", "20px");
    history.send("j1");
    history.unsend("j1");
    expect(history.changes({ unsent: true }).length).toBe(1);
  });

  it("a sent job survives a reload (the job tag is saved)", () => {
    history.apply(el, "padding-top", "20px");
    history.send("j1");
    const restored = new EditHistory(inlinePreview());
    restored.load(JSON.parse(JSON.stringify(history.serialize())), () => el);
    expect(restored.changes({ job: "j1" }).length).toBe(1);
  });
});

describe("checking a done job", () => {
  it("not in the code yet: differs, with what the page gives", () => {
    history.apply(el, "padding-top", "20px");
    history.send("j1");
    const check = checkJob(history, "j1");
    expect(check.results).toEqual([{ selector: expect.any(String), property: "padding-top", expected: "20px", outcome: "differs", actual: "10px" }]);
    // The preview is back after measuring.
    expect(el.style.paddingTop).toBe("20px");
  });

  it("landed when the page's CSS now gives the same value, however it's written", () => {
    history.apply(el, "padding-top", "20px");
    history.send("j1");
    pageCss(".card { padding-top: 1.25rem; border-radius: 4px; }"); // the agent's edit: 1.25rem = 20px
    expect(checkJob(history, "j1").results[0]?.outcome).toBe("landed");
  });

  it("a change for other widths than the window's can't be checked now", () => {
    history.apply(el, "padding-top", "20px", undefined, { widths: { min: 5000 } });
    history.send("j1");
    expect(checkJob(history, "j1").results[0]?.outcome).toBe("unchecked");
  });

  it("watching: what landed is settled as the CSS arrives; what still differs at the end stays", async () => {
    vi.useFakeTimers();
    history.apply(el, "padding-top", "20px");
    history.apply(el, "border-radius", "12px");
    history.send("j1");
    let results: unknown = null;
    watchJob(history, "j1", (r) => (results = r), { settleTime: 2000, interval: 100 });
    expect(history.changes().length).toBe(2);
    // Hot reload brings the agent's CSS: padding as asked, radius different.
    pageCss(".card { padding-top: 20px; border-radius: 8px; }");
    await vi.advanceTimersByTimeAsync(200);
    expect(history.changes().map((c) => c.property)).toEqual(["border-radius"]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(results).toEqual([
      expect.objectContaining({ property: "padding-top", outcome: "landed" }),
      expect.objectContaining({ property: "border-radius", outcome: "differs", actual: "8px" }),
    ]);
    // The different one stays on the page, still the job's.
    expect(history.changes({ job: "j1" }).map((c) => c.property)).toEqual(["border-radius"]);
  });

  it("only the page's own stylesheet changes trigger a check, not Pilot's preview sheet", () => {
    const preview = document.createElement("style");
    preview.setAttribute(PREVIEW_ATTRIBUTE, "");
    preview.textContent = "x";
    document.head.append(preview);
    const text = preview.firstChild as Node;
    const none = [] as unknown as NodeList;
    const nodes = (...n: Node[]) => n as unknown as NodeList;
    const record = (type: MutationRecordType, target: Node, added = none, removed = none) => ({ type, target, addedNodes: added, removedNodes: removed });
    // Pilot rewriting its sheet: ignored.
    expect(isPageMutation(record("characterData", text))).toBe(false);
    expect(isPageMutation(record("childList", preview, nodes(text)))).toBe(false);
    expect(isPageMutation(record("childList", document.head, nodes(preview)))).toBe(false);
    // The page's: a <style> changing, a <link> added or its href swapped.
    expect(isPageMutation(record("characterData", sheet.firstChild as Node))).toBe(true);
    expect(isPageMutation(record("childList", document.head, nodes(document.createElement("link"))))).toBe(true);
    expect(isPageMutation(record("attributes", document.createElement("link")))).toBe(true);
    preview.remove();
  });

  it("watching ends early once everything landed", async () => {
    vi.useFakeTimers();
    history.apply(el, "padding-top", "20px");
    history.send("j1");
    pageCss(".card { padding-top: 20px; }");
    const results: string[] = [];
    watchJob(history, "j1", (r) => results.push(...r.map((x) => x.outcome)));
    expect(results).toEqual(["landed"]);
    expect(history.changes()).toEqual([]);
  });
});
