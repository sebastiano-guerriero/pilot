import { describe, expect, it } from "vitest";
import { propsInText, withPropLine } from "./propLines.ts";

const specs = [
  { name: "tone", type: "options" as const, options: ["light", "dark"] },
  { name: "featured", type: "boolean" as const },
  { name: "count", type: "number" as const },
  { name: "badge", type: "text" as const },
];

describe("props in the comment's words", () => {
  it("a pick adds its line, replaces it when picked again, and takes it out", () => {
    expect(withPropLine("", "tone", "dark")).toBe("tone: dark");
    expect(withPropLine("Calmer", "tone", "dark")).toBe("Calmer\ntone: dark");
    expect(withPropLine("Calmer\ntone: dark\nfeatured: true", "tone", "light")).toBe("Calmer\ntone: light\nfeatured: true");
    expect(withPropLine("Calmer\ntone: dark", "tone", null)).toBe("Calmer");
    expect(withPropLine("Calmer\n", "count", 3)).toBe("Calmer\ncount: 3");
  });

  it("reads the lines that name a listed prop with a value it takes, typed as the prop is", () => {
    expect(propsInText('Calmer\ntone: Dark,\nfeatured: yes\ncount: 4\nbadge: "New"\nsize: lg\nnote: hi', specs)).toEqual({
      tone: "dark",
      featured: true,
      count: 4,
      badge: "New",
    });
    // Not a value the prop takes: just words.
    expect(propsInText("tone: purple\ncount: many", specs)).toEqual({});
  });
});
