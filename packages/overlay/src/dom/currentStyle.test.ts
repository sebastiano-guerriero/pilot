// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { currentStyle } from "./currentStyle.ts";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("an element's style now, for a comment or a task", () => {
  it("what its CSS declares, where it's set, its typography when inherited; resets and repeats left out", () => {
    document.head.innerHTML = `<style>
      * { margin: 0; padding: 0; }
      h2 { font-size: inherit; }
      .card { font-family: Geist, sans-serif; font-weight: 500; }
      .title { letter-spacing: -0.025em; color: #0a0a0b; padding: 8px; }
      .row { gap: 16px; }
    </style>`;
    document.body.innerHTML = `<div class="card"><h2 class="title" style="margin-top: 4px">Hi</h2><ul class="row"></ul></div>`;
    const style = currentStyle(document.querySelector("h2") as Element);
    const by = (p: string) => style.find((s) => s.property === p);
    expect(by("font-family")).toMatchObject({ source: { kind: "inherited" } });
    expect(by("font-family")?.value).toContain("Geist");
    // A heading's `font-size: inherit` (a reset) isn't its own.
    expect(by("font-size")?.source).toEqual({ kind: "inherited" });
    expect(by("letter-spacing")).toMatchObject({ value: "-0.025em", source: { kind: "rule", selector: ".title" } });
    expect(by("padding")).toMatchObject({ value: "8px", source: { kind: "rule", selector: ".title" } });
    expect(by("margin-top")).toMatchObject({ value: "4px", source: { kind: "inline" } });
    expect(by("margin-bottom")).toBeUndefined();
    const row = currentStyle(document.querySelector("ul") as Element).map((s) => s.property);
    expect(row).toContain("gap");
    expect(row).not.toContain("row-gap");
  });
});
