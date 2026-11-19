import { describe, expect, it } from "vitest";
import { originKey, originOf, propsOf, sameOrigin } from "./bridge.ts";

describe("origins", () => {
  it("takes the origin of a URL, with or without a scheme", () => {
    expect(originOf("http://localhost:5173/about?x=1")).toBe("http://localhost:5173");
    expect(originOf("localhost:5173")).toBe("http://localhost:5173");
    expect(originOf("https://app.test")).toBe("https://app.test");
    expect(originOf("ftp://x")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });

  it("localhost, 127.0.0.1 and [::1] are the same page", () => {
    expect(sameOrigin("http://127.0.0.1:5173", "http://localhost:5173")).toBe(true);
    expect(sameOrigin("http://[::1]:5173", "http://localhost:5173")).toBe(true);
    expect(sameOrigin("http://localhost:5173", "http://localhost:5174")).toBe(false);
    expect(originKey("http://127.0.0.1:5180/")).toBe("http://localhost:5180");
  });
});

describe("the hub's port", () => {
  it("is one per bridge version, never the 4747 every Pilot before 0.7.0 used", async () => {
    const { BRIDGE_VERSION, DEFAULT_BRIDGE_PORT } = await import("./bridge.ts");
    expect(DEFAULT_BRIDGE_PORT).toBe(4747 + BRIDGE_VERSION);
    expect(DEFAULT_BRIDGE_PORT).not.toBe(4747);
  });
});

describe("propsOf", () => {
  it("keeps well-formed props, capped and trimmed; an options prop needs its options", () => {
    expect(
      propsOf([
        { name: " tone ", type: "options", options: ["light", "dark", "light", 3], default: "light", description: "Its colors" },
        { name: "featured", type: "boolean" },
        { name: "size", type: "options" },
        { name: "", type: "text" },
        { name: "onClick", type: "function" },
      ]),
    ).toEqual([
      { name: "tone", type: "options", options: ["light", "dark", "3"], default: "light", description: "Its colors" },
      { name: "featured", type: "boolean" },
    ]);
    expect(propsOf("no")).toBeUndefined();
    expect(propsOf([])).toBeUndefined();
  });
});
