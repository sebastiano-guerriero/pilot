import { describe, expect, it } from "vitest";
import { keyLabel } from "./keys.ts";

describe("keyLabel", () => {
  it("symbols on a Mac, names joined by + elsewhere", () => {
    expect(keyLabel("alt+c", true)).toBe("⌥C");
    expect(keyLabel("alt+c", false)).toBe("Alt+C");
    expect(keyLabel("ctrl+shift+e", true)).toBe("⌃⇧E");
    expect(keyLabel("ctrl+shift+e", false)).toBe("Ctrl+Shift+E");
  });
});
