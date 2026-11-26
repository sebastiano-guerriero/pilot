import { describe, expect, it } from "vitest";
import { stateSelector, takeStates, withState } from "./states.ts";

describe("states", () => {
  it("tokens at the start become states, in Tailwind's order: the scheme first, the pseudo-element last", () => {
    expect(takeStates("before:hover:dark:bg", [])).toEqual({ states: ["dark", "hover", "before"], rest: "bg" });
  });

  it("one color scheme and one pseudo-element at a time", () => {
    expect(withState(["dark", "hover"], "light")).toEqual(["light", "hover"]);
    expect(withState(["before"], "after")).toEqual(["after"]);
    expect(withState(["hover"], "active")).toEqual(["hover", "active"]);
  });

  it("the selector: pseudo-classes, then the pseudo-element; the scheme isn't written here", () => {
    expect(stateSelector(["dark", "hover", "before"])).toBe(":hover::before");
  });
});
