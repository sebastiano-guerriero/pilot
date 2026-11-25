import { describe, expect, it } from "vitest";
import { propsInText } from "./propLines.ts";

const specs = [
  { name: "tone", type: "options" as const, options: ["light", "dark"] },
  { name: "featured", type: "boolean" as const },
  { name: "count", type: "number" as const },
  { name: "badge", type: "text" as const },
];

describe("props in the comment's words", () => {
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
