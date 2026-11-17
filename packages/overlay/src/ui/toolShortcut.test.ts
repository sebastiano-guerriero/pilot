import { describe, expect, it } from "vitest";
import { toolShortcut } from "./App.tsx";

describe("toolShortcut", () => {
  it("Option+C is Comment, Option+V is Select, by key code (Option changes the character)", () => {
    expect(toolShortcut("KeyC")).toBe("comment");
    expect(toolShortcut("KeyV")).toBe("select");
    expect(toolShortcut("KeyD")).toBeNull();
  });
});
