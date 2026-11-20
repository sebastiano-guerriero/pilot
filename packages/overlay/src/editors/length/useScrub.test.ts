// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { describe, expect, it } from "vitest";
import { useScrub } from "./useScrub.ts";

describe("useScrub: how far past the limit", () => {
  it("0 above the minimum; past it, the steps since it got there; turning back ends it", () => {
    let scrub!: ReturnType<typeof useScrub>;
    const written: string[] = [];
    function Probe() {
      scrub = useScrub({ onChange: (_p, v) => written.push(v), onRevert: () => {} });
      return null;
    }
    const container = document.createElement("div");
    act(() => render(h(Probe, null), container));
    const target = { property: "padding-top", base: () => "4px" };
    const gesture = {};
    expect(scrub(target, -2, "4px", gesture)).toBe(0); // 2px
    expect(scrub(target, -6, "4px", gesture)).toBe(-2); // 0, 2 steps past
    expect(scrub(target, -10, "4px", gesture)).toBe(-6);
    expect(scrub(target, -9, "4px", gesture)).toBe(0); // turning back: 1px at once
    expect(written).toEqual(["2px", "0px", "0px", "1px"]);
    render(null, container);
  });
});
