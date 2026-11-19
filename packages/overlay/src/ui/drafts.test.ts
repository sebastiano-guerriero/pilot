// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { draftFor, keepDraft, resetDrafts } from "./drafts.ts";

describe("comment drafts", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetDrafts();
    document.body.innerHTML = `<article class="card">Desk lamp</article><article class="card">Office chair</article>`;
  });

  it("kept per element, for the tab: after a reload too; cleared when sent (empty)", () => {
    const [a, b] = [...document.querySelectorAll("article")];
    keepDraft(a as Element, "Calmer");
    keepDraft(b as Element, "Bolder");
    expect(draftFor(a as Element)).toBe("Calmer");
    resetDrafts(); // a reload: read again from the tab's storage
    expect(draftFor(b as Element)).toBe("Bolder");
    keepDraft(a as Element, "");
    expect(draftFor(a as Element)).toBeUndefined();
    expect(draftFor(b as Element)).toBe("Bolder");
  });
});
