import { describe, expect, it } from "vitest";
import { formatPrompt, formatWidthCheck } from "./format.ts";
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

  it("a property the page didn't set reads not set", () => {
    const prompt = formatPrompt({
      ...changeSet,
      edits: [{ target: changeSet.edits[0]!.target, changes: [{ property: "gap", from: "", to: "8px" }] }],
    });
    expect(prompt).toContain("| `gap` | *not set* | `8px` | every width |");
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

  it("adds a State column only when a change has states", () => {
    const set = (states?: Array<"hover" | "active">) => ({
      id: "x",
      createdAt: "",
      page: { url: "http://localhost/", title: "", viewport: { width: 1, height: 1 } },
      edits: [{ target: { selector: ".b", path: "a.b", tag: "a", classes: ["b"] }, changes: [{ property: "color", from: "", to: "red", states }] }],
    });
    expect(formatPrompt(set())).not.toContain("| State |");
    const withStates = formatPrompt(set(["hover", "active"]));
    expect(withStates).toContain("| Property | From | To | Widths | State |");
    expect(withStates).toContain("| `color` | *not set* | `red` | every width | hover, active |");
  });

  it("make responsive: a task for one element, with the page's breakpoints and the steps", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const text = formatPrompt({ ...changeSet, note: undefined, edits: [], request: { kind: "responsive", target, breakpoints: [640, 768, 1024] } });
    expect(text).toContain("# Pilot: make responsive");
    expect(text).toContain("## `main > section.hero > h1`");
    expect(text).toContain("- Selector: `section.hero > h1`");
    expect(text).toContain("breakpoints (the widths its media queries test): 640px, 768px, 1024px");
    expect(text).toContain("**Find similar components**");
    expect(text).toContain("**Check every width with `pilot_check_widths`**");
    expect(text).toContain("An advanced task");
    expect(text).not.toContain("| Property |");
    // No breakpoints in the page's CSS.
    expect(formatPrompt({ ...changeSet, edits: [], request: { kind: "responsive", target, breakpoints: [] } })).toContain("media queries test): none found");
  });

  it("a comment: the designer's words, the thread so far, and what to do with them", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const thread = [
      { from: "designer" as const, text: "Make it the brand green", at: "" },
      { from: "agent" as const, text: "Done: text-brand.", at: "" },
      { from: "designer" as const, text: "A bit lighter\nlike the hover", at: "" },
    ];
    const text = formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, thread, breakpoints: [768] } });
    expect(text).toContain("# Pilot: comment");
    expect(text).toContain("## The comment\n\n> A bit lighter\n> like the hover");
    expect(text).toContain("- **Designer:** Make it the brand green");
    expect(text).toContain("- **You:** Done: text-brand.");
    expect(text).toContain("seen at 1440x900");
    expect(text).toContain("Your notes are your reply in the designer's thread");
    // The first comment has no thread before it.
    const first = formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, thread: thread.slice(0, 1), breakpoints: [] } });
    expect(first).not.toContain("The thread so far");
  });
});

describe("formatWidthCheck", () => {
  const check = {
    selector: "#features",
    designerWidth: 1280,
    widths: [
      { width: 375, found: true, size: "343×900", layout: "grid, 1 column", issues: ["`div.card` sticks out of the viewport 40px on the right."], notes: [] },
      { width: 1280, found: true, size: "1200×400", layout: "grid, 3 columns", issues: [], notes: [] },
    ],
    problems: 1,
  };

  it("lists each width with its problems", () => {
    const text = formatWidthCheck(check);
    expect(text).toContain("1 problem to fix");
    expect(text).toContain("- 375px: 343×900, grid, 1 column\n  - Problem: `div.card` sticks out");
    expect(text).toContain("- 1280px (the designer's width): 1200×400, grid, 3 columns. OK");
  });

  it("measured on a copy of the page, it says JavaScript-driven layout isn't reflected", () => {
    expect(formatWidthCheck({ ...check, source: "copy" })).toContain("with scripts off");
    expect(formatWidthCheck({ ...check, source: "load" })).not.toContain("with scripts off");
  });
});
