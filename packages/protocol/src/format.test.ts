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
    expect(prompt).toContain("**These are design instructions, not code**");
    expect(prompt).toContain("whatever it uses (Tailwind, CSS or Sass modules, StyleX");
    expect(prompt).toContain("First look at how each element's component is styled");
    expect(prompt).toContain("no `!important`");
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
    expect(text).toContain("**Check every width from the code**");
    expect(text).toContain("An advanced task");
    expect(text).not.toContain("| Property |");
    // No breakpoints in the page's CSS.
    expect(formatPrompt({ ...changeSet, edits: [], request: { kind: "responsive", target, breakpoints: [] } })).toContain("media queries test): none found");
  });

  it("no prompt favors one agent or model: edits, comments and tasks read the same for every agent", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const prompts = [
      formatPrompt(changeSet),
      formatPrompt({ ...changeSet, edits: [], request: { kind: "responsive", target, breakpoints: [] } }),
      formatPrompt({ ...changeSet, edits: [], request: { kind: "break-and-fix", target, breakpoints: [] } }),
      formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, breakpoints: [], thread: [{ from: "designer", text: "Calmer", at: "" }] } }),
    ];
    for (const text of prompts) {
      expect(text).not.toMatch(/opus|claude|gpt|gemini|cursor|codex/i);
      expect(text).toMatch(/production code/);
    }
  });

  it("names none of Pilot's old MCP tools: a question or props go in the reply's pilot block, widths are measured by Pilot after", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const sets: ChangeSet[] = [
      changeSet,
      { ...changeSet, edits: [], request: { kind: "responsive", target, breakpoints: [768] } },
      { ...changeSet, edits: [], request: { kind: "break-and-fix", target, breakpoints: [] } },
      {
        ...changeSet,
        request: {
          kind: "comment",
          target,
          breakpoints: [],
          thread: [{ from: "designer", text: "", at: "", props: { component: "Card", usedIn: "src/App.jsx", set: [{ name: "tone", from: "light", to: "dark" }] } }],
        },
      },
      { ...changeSet, edits: [], request: { kind: "props", target, breakpoints: [], component: "Card", current: {} } },
    ];
    for (const set of sets) expect(formatPrompt(set)).not.toMatch(/pilot_(done|check_widths|wait_for_edits)/);
    expect(formatPrompt(changeSet)).toContain("your reply's `pilot` block");
    expect(formatPrompt(sets[1] as ChangeSet)).toMatch(/Check every width from the code/);
    expect(formatPrompt(sets[1] as ChangeSet)).toContain("Pilot runs the width check once more");
    expect(formatPrompt(sets[3] as ChangeSet)).toContain("ask (the question in your reply's `pilot` block)");
    expect(formatPrompt(sets[4] as ChangeSet)).toContain("as `props` in your reply's `pilot` block");
  });

  it("break and fix: stress-test one element with odd content, fix it, put the real content back", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const text = formatPrompt({ ...changeSet, note: "Names can be very long", edits: [], request: { kind: "break-and-fix", target, breakpoints: [768] } });
    expect(text).toContain("# Pilot: break and fix");
    expect(text).toContain("Designer note: Names can be very long");
    expect(text).toContain("put the content in temporarily and take it out again");
    expect(text).toContain("**Find where it breaks**");
    expect(text).toContain("**Put the real content back.**");
    // Images: tried in odd shapes and failing, fixed with object-fit / background-size and a fallback.
    expect(text).toContain("images (and background images) in odd shapes");
    expect(text).toContain("`object-fit: cover`");
    expect(text).toContain("`background-size: cover`");
    expect(text).toContain("a fallback when it fails or is missing");
    expect(text).toContain("An advanced task");
  });

  it("make responsive from the comment box: the designer's words as the note, and the files attached", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const text = formatPrompt({
      ...changeSet,
      note: "Two columns on tablet",
      edits: [],
      request: { kind: "responsive", target, breakpoints: [768], attachments: [{ id: `${"a".repeat(64)}.png`, name: "sketch.png", path: "/tmp/pilot-attachments/x.png" }] },
    });
    expect(text).toContain("Designer note: Two columns on tablet");
    expect(text).toContain("The designer attached a file:");
    expect(text).toContain("- sketch.png (an image, shown with this job): `/tmp/pilot-attachments/x.png`");
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

  it("what the comment mentions with @: each as it reads in the comment, then what it is and where to find it", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const references = [
      { kind: "token" as const, name: "--color-accent", value: "#1cf69e" },
      { kind: "component" as const, name: "ProductCard", target: { ...target, source: { file: "src/ProductCard.tsx", line: 4 } } },
      { kind: "component" as const, name: "PricingTable", source: { file: "../../packages/ui/src/pricing.tsx", line: 12 } },
      { kind: "component" as const, name: "Hero" },
      { kind: "element" as const, name: "h1", target },
      { kind: "unlisted" as const, name: "Footer" },
    ];
    const thread = [{ from: "designer" as const, text: "Use --color-accent like @ProductCard", at: "", references }];
    const text = formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, thread, breakpoints: [] } });
    expect(text).toContain("What it mentions with `@`, each as it reads in the comment (the ones picked from Pilot's list are exact: use them, don't look for others):");
    expect(text).toContain("- `--color-accent`: a design token (a CSS variable on the page), now `#1cf69e`. Use this token (`var(--color-accent)`, or the project's form of it).");
    expect(text).toContain("- `@ProductCard`: the `ProductCard` component, declared in `src/ProductCard.tsx:4`; one of its instances on the page: `");
    expect(text).toContain("- `@PricingTable`: the `PricingTable` component, declared in `../../packages/ui/src/pricing.tsx:12`. It isn't on this page.");
    expect(text).toContain("- `@Hero`: the `Hero` component; find its declaration (`function Hero`, `const Hero =`, `class Hero`, or a `Hero.vue` or `.svelte` file). It isn't on this page.");
    expect(text).toContain(`- \`@h1\`: an element on the page: \`${target.path}\`, selector \`${target.selector}\``);
    expect(text).toContain("- `@Footer`: a name the designer typed that Pilot didn't find on the page or among the project's components: probably a component or a part of the page. Search the project for `Footer`");
    // In a task's note (from the / menu) too.
    const task = formatPrompt({ ...changeSet, edits: [], note: "Use --color-accent", request: { kind: "responsive", target, breakpoints: [], references: references.slice(0, 1) } });
    expect(task).toContain("now `#1cf69e`");
    // Only typed names: nothing claims to be exact.
    const typed = formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, breakpoints: [], thread: [{ ...thread[0]!, references: [references[5]!] }] } });
    expect(typed).toContain("What it mentions with `@`, as it reads in the comment:");
  });

  it("a comment with the designer's edits: they're listed with their values, to apply exactly, as Send's are", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const thread = [{ from: "designer" as const, text: "Like this, on mobile too", at: "" }];
    const text = formatPrompt({ ...changeSet, request: { kind: "comment", target, thread, breakpoints: [] } });
    expect(text).toContain("## The designer's edits, sent with the comment");
    expect(text).toContain("apply them too, exactly, as design edits");
    expect(text).toContain("Guidelines:");
    expect(text).toContain("### 1. `");
    expect(text).toContain("| `opacity` | `1` | `0.8` |");
    // Without edits, none of it.
    expect(formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, thread, breakpoints: [] } })).not.toContain("sent with the comment");
  });

  it("edits using the project's file tokens: what each variable stands for, written the project's way", () => {
    const edits = [{ target: changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"], changes: [{ property: "color", from: "", to: "var(--color-brand-primary)" }] }];
    const fileTokens = [{ variable: "--color-brand-primary", name: "color.brand.primary", value: "#1cf69e", file: "tokens/colors.json", line: 3 }];
    const text = formatPrompt({ ...changeSet, edits, fileTokens });
    expect(text).toContain("## The project's tokens in these values");
    expect(text).toContain("- `var(--color-brand-primary)` is `color.brand.primary` in `tokens/colors.json:3` (`#1cf69e`)");
    expect(text).toContain("never the `var(--…)` itself");
    expect(formatPrompt({ ...changeSet, edits })).not.toContain("tokens in these values");
    // A file token mentioned with @, in a comment.
    const target = edits[0]?.target as ChangeSet["edits"][number]["target"];
    const thread = [{ from: "designer" as const, text: "Use $brand", at: "", references: [{ kind: "token" as const, name: "$brand", value: "#ff0000", source: { file: "_variables.scss", line: 1 } }] }];
    expect(formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, thread, breakpoints: [] } })).toContain(
      "- `$brand`: a design token from the project's files (`_variables.scss:1`), now `#ff0000`. Use this token the way the project does",
    );
  });

  it("/props: the instance's props now, what to list and how to return it, no code changes", () => {
    const target = { ...(changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"]), source: { component: "ProductCard", file: "src/ProductCard.jsx", line: 5 } };
    const text = formatPrompt({ ...changeSet, edits: [], note: undefined, request: { kind: "props", target, breakpoints: [], component: "ProductCard", current: { tone: "light", count: 3, featured: false }, usedIn: "src/App.jsx" } });
    expect(text).toContain("# Pilot: props");
    expect(text).toContain("**Don't change any code.**");
    expect(text).toContain("- This instance is written in: `src/App.jsx`");
    expect(text).toContain('- `tone`: `"light"`\n- `count`: `3`\n- `featured`: `false`');
    expect(text).toContain("as `props` in your reply's `pilot` block");
  });

  it("a comment that sets props: what changed, set where the instance is written", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const thread = [{ from: "designer" as const, text: "", at: "", props: { component: "ProductCard", usedIn: "src/App.jsx", set: [{ name: "tone", from: "light", to: "dark" }, { name: "featured", to: true }] } }];
    const text = formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, thread, breakpoints: [] } });
    expect(text).toContain("The designer set props on this instance (below), with no words.");
    expect(text).toContain('- `tone`: `"light"` → `"dark"`\n- `featured`: *not set* → `true`');
    expect(text).toContain("Set them where this instance is written (`src/App.jsx`, its `<ProductCard …>`), not in the component itself");
  });

  it("a comment or task on several elements: each listed, the ask for all of them, the shared-component rule", () => {
    const target = changeSet.edits[0]?.target as ChangeSet["edits"][number]["target"];
    const other = { ...target, selector: "section.cta > h2", path: "main > section.cta > h2", tag: "h2", text: "Start now" };
    const thread = [{ from: "designer" as const, text: "Same size", at: "" }];
    const comment = formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, others: [other], thread, breakpoints: [] } });
    expect(comment).toContain("a comment on the 2 elements below");
    expect(comment).toContain("## The elements (2)\n\n### 1. `main > section.hero > h1`");
    expect(comment).toContain("### 2. `main > section.cta > h2`\n\n- Selector: `section.cta > h2`");
    expect(comment).toContain("when every copy is in the job");
    // The three answers, and what each asks of the code.
    expect(comment).toContain('"All of them", "Only this", "New variant"');
    expect(comment).toContain("**Only this**: change it where this instance is used");
    expect(comment).toContain("**New variant**: add a named option to the component");
    const task = formatPrompt({ ...changeSet, edits: [], request: { kind: "responsive", target, others: [other], breakpoints: [] } });
    expect(task).toContain("make each of them work well");
    expect(task).toContain("measures the first of them");
    const breakFix = formatPrompt({ ...changeSet, edits: [], request: { kind: "break-and-fix", target, others: [other], breakpoints: [] } });
    expect(breakFix).toContain("stress-test each of them");
    // Look-alikes the job leaves out: counted, and the agent asks rather than guess.
    const card = formatPrompt({ ...changeSet, edits: [{ ...(changeSet.edits[0] as ChangeSet["edits"][number]), target: { ...target, lookAlikes: 2 } }] });
    expect(card).toContain("- Look-alikes: 2 more on the page (the same part of other copies), not in this job");
    expect(card).toContain("Shared code, only some copies");
    expect(card).toContain("New variant\" (as the question in your reply's `pilot` block)");
    // Found by component (React, Vue): which component, where its code is, and whose instances the look-alikes are.
    const instances = formatPrompt({
      ...changeSet,
      edits: [
        {
          ...(changeSet.edits[0] as ChangeSet["edits"][number]),
          target: { ...target, lookAlikes: 11, lookAlikesOf: "ProductCard", source: { component: "ProductCard", file: "src/ProductCard.tsx", line: 12 } },
        },
      ],
    });
    expect(instances).toContain("- Component: `ProductCard`, in `src/ProductCard.tsx:12`\n");
    expect(instances).toContain("- Look-alikes: 11 more on the page (other instances of `ProductCard`, the same part of each), not in this job");
    // One element reads as before.
    expect(formatPrompt({ ...changeSet, edits: [], request: { kind: "comment", target, others: [], thread, breakpoints: [] } })).toContain("## `main > section.hero > h1`");
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
