import { describe, expect, it } from "vitest";
import { allowOf, isLocalHost, originKey, originOf, propsOf, questionOf, sameOrigin } from "./bridge.ts";

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

describe("isLocalHost: development addresses, never a server's", () => {
  it("this machine, local names, private networks", () => {
    for (const h of ["localhost", "app.localhost", "127.0.0.1", "127.1.2.3", "[::1]", "0.0.0.0", "nucleo", "myapp.local", "shop.test", "api.internal", "10.0.0.5", "172.20.1.1", "192.168.1.55", "fd12:3456::1", "fe80::1"]) {
      expect(isLocalHost(h), h).toBe(true);
    }
  });

  it("anything public isn't", () => {
    for (const h of ["nucleoapp.com", "www.example.org", "staging.example.com", "8.8.8.8", "172.32.0.1", "11.0.0.1", "2001:db8::1", "localhost.evil.com", ""]) {
      expect(isLocalHost(h), h).toBe(false);
    }
  });
});

describe("questionOf", () => {
  it("keeps the element it's about, a number from 1; anything else is left out", () => {
    expect(questionOf({ text: "Every link?", element: 2 })).toEqual({ text: "Every link?", element: 2 });
    expect(questionOf({ text: "Every link?", element: 0 })).toEqual({ text: "Every link?" });
    expect(questionOf({ text: "Every link?", element: "2" })).toEqual({ text: "Every link?" });
    expect(questionOf({ text: "Every link?", element: 1.5 })).toEqual({ text: "Every link?" });
  });
});

describe("allowOf", () => {
  it("one line of plain text, cut; anything else isn't one", () => {
    expect(allowOf("Allow the x MCP server\n in my settings.")).toBe("Allow the x MCP server in my settings.");
    expect(allowOf("a".repeat(600))).toHaveLength(500);
    expect(allowOf(3)).toBeUndefined();
    expect(allowOf("   ")).toBeUndefined();
  });
});
