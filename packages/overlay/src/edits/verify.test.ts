// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { inlinePreview } from "../test/inlinePreview.ts";
import { EditHistory } from "./history.ts";
import { checkJob, sameLook } from "./verify.ts";

describe("a change landed when it looks the same", () => {
  it("shadows: the layers that draw nothing don't count (Tailwind's empty ones)", () => {
    const tailwind =
      "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px";
    expect(sameLook("box-shadow", tailwind, "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px, rgba(0, 0, 0, 0.1) 0px 2px 4px -2px")).toBe(true);
    // Every layer empty is no shadow.
    expect(sameLook("box-shadow", "rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgb(0, 0, 0) 0px 0px 0px 0px", "none")).toBe(true);
  });

  it("a shadow that draws something still counts: opaque black, another value, another property", () => {
    expect(sameLook("box-shadow", "rgb(0, 0, 0) 0px 4px 6px 0px", "none")).toBe(false);
    expect(sameLook("box-shadow", "rgba(0, 0, 0, 0.1) 0px 4px 6px -1px", "rgba(0, 0, 0, 0.1) 0px 2px 4px -2px")).toBe(false);
    expect(sameLook("padding-top", "0px", "0px")).toBe(true);
    expect(sameLook("padding-top", "0px", "4px")).toBe(false);
  });

  it("lengths a pixel or two off count (the project's scale, as the prompt allows), not shadows, nor more", () => {
    expect(sameLook("padding-right", "68px", "67px")).toBe(true);
    expect(sameLook("max-width", "596px", "595px")).toBe(true);
    expect(sameLook("padding", "24px 68px", "24px 66px")).toBe(true);
    expect(sameLook("padding-right", "70px", "67px")).toBe(false);
    // Small values: a quarter of it at most (1px isn't 2px).
    expect(sameLook("border-top-width", "2px", "1px")).toBe(false);
    expect(sameLook("gap", "6px", "4px")).toBe(false);
    // Only the lengths may differ.
    expect(sameLook("transform", "matrix(1, 0, 0, 1, 0, 0)", "matrix(1, 0, 0, 1, 1, 0)")).toBe(false);
    expect(sameLook("color", "rgb(0, 0, 1)", "rgb(0, 0, 0)")).toBe(false);
    expect(sameLook("display", "block", "flex")).toBe(false);
  });
});

describe("a change under a condition", () => {
  it("is checked only while the condition holds on the page, as it is; else settled on the agent's word", () => {
    const el = document.createElement("div");
    document.body.append(el);
    const history = new EditHistory(inlinePreview());
    const open = { words: "it has data-open", selector: "&[data-open]" };
    history.apply(el, "opacity", "0.5", undefined, { condition: open });
    history.send("job-1");
    // Without data-open: the condition doesn't hold, nothing to compare.
    expect(checkJob(history, "job-1").results.map((r) => r.outcome)).toEqual(["unchecked"]);
    // Shown as if true: still not the page as it is.
    el.setAttribute("data-open", "");
    history.simulate(open, "true");
    expect(checkJob(history, "job-1").results.map((r) => r.outcome)).toEqual(["unchecked"]);
    history.simulate(open, null);
    expect(checkJob(history, "job-1").results.map((r) => r.outcome)).not.toEqual(["unchecked"]);
    el.remove();
  });
});
