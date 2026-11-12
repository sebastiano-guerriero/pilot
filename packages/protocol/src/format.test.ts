import { describe, expect, it } from "vitest";
import { formatPrompt } from "./format.ts";
import type { ChangeSet } from "./types.ts";

const changeSet: ChangeSet = {
  id: "cs_1",
  createdAt: "2026-11-10T12:00:00.000Z",
  page: { url: "http://localhost:5173/", title: "Home", viewport: { width: 1440, height: 900 } },
  note: "Softer hero",
  edits: [
    {
      target: {
        selector: "section.hero > h1",
        path: "main > section.hero > h1",
        tag: "h1",
        classes: [],
        text: "Ship faster",
      },
      changes: [
        { property: "opacity", from: "1", to: "0.8" },
        { property: "letter-spacing", from: "normal", to: "-0.02em" },
      ],
    },
  ],
};

describe("formatPrompt", () => {
  it("lists every change with its target", () => {
    const prompt = formatPrompt(changeSet);
    expect(prompt).toContain("`main > section.hero > h1`");
    expect(prompt).toContain("| `opacity` | `1` | `0.8` |");
    expect(prompt).toContain("| `letter-spacing` | `normal` | `-0.02em` |");
    expect(prompt).toContain("Designer note: Softer hero");
    expect(prompt).toContain("Translate them to this project's conventions");
  });

  it("spells out a removal: not a new value, and where the page sets it", () => {
    const prompt = formatPrompt({
      ...changeSet,
      edits: [
        {
          target: changeSet.edits[0]!.target,
          changes: [
            { property: "gap", from: "16px", to: "", removed: true, source: { kind: "rule", selector: ".cards", elements: 3 } },
            { property: "color", from: "red", to: "", removed: true, source: { kind: "inline" } },
          ],
        },
      ],
    });
    expect(prompt).toContain("| `gap` | `16px` | *removed* |");
    expect(prompt).toContain("`gap` is removed: this element shouldn't set it (not `0` or `none`)");
    expect(prompt).toContain("It comes from `.cards`, which matches 3 elements on the page: remove it for this element only");
    expect(prompt).toContain("It's set in the element's own `style` attribute.");
  });
});
