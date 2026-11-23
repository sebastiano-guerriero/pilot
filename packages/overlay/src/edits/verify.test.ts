import { describe, expect, it } from "vitest";
import { sameLook } from "./verify.ts";

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
});
