// @vitest-environment happy-dom
import { formatPrompt } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildChangeSet } from "./changeSet.ts";
import { clearProperty } from "./clear.ts";
import { EditHistory } from "./history.ts";

let style: HTMLStyleElement;
let card: HTMLElement;
let history: EditHistory;

beforeEach(() => {
  style = document.createElement("style");
  style.textContent = ".card { padding-top: 10px; gap: 16px; }";
  document.head.append(style);
  card = document.createElement("div");
  card.className = "card";
  card.textContent = "Hello";
  document.body.append(card);
  history = new EditHistory(); // the real preview: the element's own style stays the page's
});
afterEach(() => {
  style.remove();
  card.remove();
});

describe("buildChangeSet", () => {
  it("one edit per element: from is the page's own value, with where it's declared", () => {
    history.apply(card, "padding-top", "24px");
    history.apply(card, "margin-top", "8px", undefined, { widths: { min: 768 } });
    const set = buildChangeSet(history);
    expect(set.edits).toHaveLength(1);
    expect(set.edits[0]?.target.selector).toBe("div.card");
    expect(set.edits[0]?.changes).toEqual([
      { property: "padding-top", from: "10px", to: "24px", source: { kind: "rule", selector: ".card", elements: 1 } },
      { property: "margin-top", from: "", to: "8px", widths: { min: 768 } },
    ]);
  });

  it("a removal says so, with the removed value", async () => {
    await Promise.resolve(); // declared values are cached for the task
    clearProperty(history, card, "gap");
    expect(buildChangeSet(history).edits[0]?.changes[0]).toMatchObject({ property: "gap", from: "16px", to: "", removed: true });
  });

  it("undone changes aren't in it; nothing changed, nothing to copy", () => {
    history.apply(card, "padding-top", "24px");
    history.undo();
    expect(buildChangeSet(history).edits).toEqual([]);
  });

  it("formats into the prompt the agent gets", () => {
    history.apply(card, "padding-top", "24px");
    const prompt = formatPrompt(buildChangeSet(history));
    expect(prompt).toContain("| `padding-top` | `10px` | `24px` | base |");
    expect(prompt).toContain("`div.card`");
  });
});

describe("look-alikes and every copy", () => {
  it("plain HTML: some copies changed count the rest; every one changed (Select similar) is every copy, kept to the page", () => {
    const list = document.createElement("section");
    list.innerHTML = ["One", "Two", "Three"].map((t) => `<article><h3>${t}</h3><p>${t} text</p></article>`).join("");
    document.body.append(list);
    const titles = [...list.querySelectorAll("h3")] as HTMLElement[];
    history.apply(titles[0] as HTMLElement, "color", "red");
    const one = buildChangeSet(history)?.edits[0]?.target;
    expect(one?.lookAlikes).toBe(2);
    expect(one?.everyCopy).toBeUndefined();
    for (const t of titles.slice(1)) history.apply(t, "color", "red");
    const all = buildChangeSet(history)?.edits.map((e) => e.target) ?? [];
    expect(all.map((t) => t.everyCopy)).toEqual([{}, {}, {}]);
    expect(all.some((t) => t.lookAlikes)).toBe(false);
    list.remove();
  });
});

describe("a base change's source", () => {
  it("is the base value, where it's declared without a media query, even where a breakpoint wins at this width", () => {
    const media = document.createElement("style");
    media.textContent = "@media (min-width: 1px) { .card { padding-top: 30px; } }";
    document.head.append(media);
    history.apply(card, "padding-top", "24px");
    const change = buildChangeSet(history).edits[0]?.changes[0];
    expect(change?.from).toBe("10px");
    expect(change?.source).toMatchObject({ kind: "rule", selector: ".card" });
    expect(change?.source && "media" in change.source ? change.source.media : undefined).toBeUndefined();
    // For a width: what applies there (the breakpoint's rule).
    history.apply(card, "padding-top", "40px", undefined, { widths: { min: 768 } });
    const forWidth = buildChangeSet(history).edits[0]?.changes.find((c) => c.widths);
    expect(forWidth?.from).toBe("30px");
    media.remove();
  });
});
