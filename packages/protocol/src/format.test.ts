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
    expect(prompt).toContain("| `opacity` | `1` | `0.8` | every width |");
    expect(prompt).toContain("| `letter-spacing` | `normal` | `-0.02em` | every width |");
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
    expect(prompt).toContain("| `gap` | `16px` | *removed* | every width |");
    expect(prompt).toContain("`gap` is removed: this element shouldn't set it (not `0` or `none`)");
    expect(prompt).toContain("It comes from `.cards`, which matches 3 elements on the page: remove it for this element only");
    expect(prompt).toContain("It's set in the element's own `style` attribute.");
  });

  it("says which widths each change is for", () => {
    const prompt = formatPrompt({
      ...changeSet,
      edits: [
        {
          target: changeSet.edits[0]!.target,
          changes: [
            { property: "font-size", from: "48px", to: "40px", widths: { min: 1200 } },
            { property: "margin-top", from: "24px", to: "16px", widths: { max: 767 } },
            { property: "gap", from: "16px", to: "8px", widths: { min: 768, max: 1199 } },
            { property: "opacity", from: "1", to: "0.5", widths: { min: 1108, max: 1108 } },
            {
              property: "padding-top",
              from: "32px",
              to: "",
              removed: true,
              source: { kind: "rule", selector: ".hero", elements: 1, media: "(min-width: 768px)" },
            },
          ],
        },
      ],
    });
    expect(prompt).toContain("| `font-size` | `48px` | `40px` | from 1200px |");
    expect(prompt).toContain("| `margin-top` | `24px` | `16px` | to 767px |");
    expect(prompt).toContain("| `gap` | `16px` | `8px` | 768–1199px |");
    expect(prompt).toContain("| `opacity` | `1` | `0.5` | 1108px only |");
    expect(prompt).toContain("| `padding-top` | `32px` | *removed* | every width |");
    expect(prompt).toContain(
      "`padding-top` is set inside `@media (min-width: 768px)` today. The change is for every width, so that media query shouldn't override it.",
    );
    expect(prompt).toContain("Widths are viewport widths in CSS px, both ends included.");
  });
});
