import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Job, StyleChange } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { classFor, factsSection, prefixFor, toPx } from "./facts.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pilot-facts-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function files(tree: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}
const jobOf = (changes: StyleChange[]): Job =>
  ({ id: "j", changeSet: { page: { url: "http://localhost:5173/" }, edits: [{ target: {}, changes }] } }) as unknown as Job;
const change = (property: string, to: string, extra: Partial<StyleChange> = {}): StyleChange => ({ property, from: "", to, ...extra });

const theme = new Map(
  Object.entries({
    spacing: "0.25rem",
    "breakpoint-md": "48rem",
    "breakpoint-xs": "30rem",
    "text-sm": "0.8125rem",
    "text-sm--line-height": "normal",
    "text-base": "1rem",
    "radius-lg": "calc(0.5rem * var(--radius-multiplier, 1))",
    "color-primary": "#7553FD",
    "color-red": "oklch(63.7% 0.237 25.331)",
    "font-weight-medium": "500",
    "font-body": '"Geist", ui-sans-serif, sans-serif',
    "container-2xl": "42rem",
  }),
);

describe("a value's class in the project's theme", () => {
  it("lengths in rem, px and the theme's calc()s", () => {
    expect(toPx("3rem", theme)).toBe(48);
    expect(toPx("12px", theme)).toBe(12);
    expect(toPx("var(--radius-lg)", theme)).toBe(8);
    expect(toPx("calc(0.25rem * 6)", theme)).toBe(24);
    expect(toPx("auto", theme)).toBeNull();
  });

  it("spacing in steps of --spacing, any quarter step; else the exact value", () => {
    expect(classFor("gap", "48px", theme)).toEqual({ exact: "gap-12" });
    expect(classFor("padding-top", "42px", theme)).toEqual({ exact: "pt-10.5" });
    expect(classFor("margin-left", "-8px", theme)).toEqual({ exact: "-ml-2" });
    expect(classFor("padding", "1px", theme)).toEqual({ exact: "p-px" });
    expect(classFor("width", "50%", theme)).toEqual({ exact: "w-1/2" });
    expect(classFor("width", "100%", theme)).toEqual({ exact: "w-full" });
    expect(classFor("max-width", "42rem", theme)).toEqual({ exact: "max-w-2xl" });
    expect(classFor("margin", "auto", theme)).toEqual({ exact: "m-auto" });
  });

  it("named scales: the step, else the exact value and the closest step", () => {
    expect(classFor("font-size", "13px", theme)).toEqual({ exact: "text-sm" });
    expect(classFor("font-size", "14px", theme)).toEqual({ exact: "text-[14px]", closest: { cls: "text-sm", px: 13 } });
    expect(classFor("border-radius", "8px", theme)).toEqual({ exact: "rounded-lg" });
    expect(classFor("border-radius", "9999px", theme)).toEqual({ exact: "rounded-full" });
    expect(classFor("font-weight", "500", theme)).toEqual({ exact: "font-medium" });
    expect(classFor("font-family", "Geist, sans-serif", theme)).toEqual({ exact: "font-body" });
  });

  it("colors: the theme's, with an alpha; its own variable; else the value", () => {
    expect(classFor("color", "#7553fd", theme)).toEqual({ exact: "text-primary" });
    expect(classFor("background-color", "rgba(117, 83, 253, 0.1)", theme)).toEqual({ exact: "bg-primary/10" });
    expect(classFor("border-color", "oklch(63.7% 0.237 25.331)", theme)).toEqual({ exact: "border-red" });
    expect(classFor("background-color", "var(--color-primary)", theme)).toEqual({ exact: "bg-primary" });
    expect(classFor("color", "#123456", theme)).toMatchObject({ exact: "text-[#123456]" });
  });

  it("widths in the theme's breakpoints, then states", () => {
    expect(prefixFor({ widths: { min: 768 }, states: ["hover"] }, theme)).toBe("md:hover:");
    expect(prefixFor({ widths: { max: 479 } }, theme)).toBe("max-xs:");
    expect(prefixFor({ widths: { min: 480, max: 767 } }, theme)).toBe("xs:max-md:");
    expect(prefixFor({ widths: { min: 900 } }, theme)).toBe("min-[900px]:");
    expect(prefixFor({}, theme)).toBe("");
  });
});

describe("the job's project section", () => {
  it("the project's Tailwind, each change's class, and how its CSS is rebuilt", async () => {
    await files({
      "package.json": JSON.stringify({ scripts: { dev: 'concurrently "npm:css" "vite"', css: "tailwindcss -i ./src/input.css -o ./dist/out.css --watch" } }),
      "node_modules/tailwindcss/package.json": JSON.stringify({ version: "4.3.0" }),
      "node_modules/tailwindcss/theme.css": "@theme default {\n  --spacing: 0.25rem;\n  --breakpoint-md: 48rem;\n  --color-red-500: oklch(63.7% 0.237 25.331);\n}\n",
      "src/input.css": '@import "tailwindcss";\n@import "./tokens.css";\n',
      "src/tokens.css": "@theme {\n  --color-*: initial;\n  --color-brand: #ff0066;\n}\n",
    });
    const section = factsSection(jobOf([change("gap", "48px", { widths: { min: 768 } }), change("color", "#FF0066"), change("color", "oklch(63.7% 0.237 25.331)")]), root);
    expect(section).toContain("Tailwind CSS 4.3.0, its theme in `src/input.css`");
    expect(section).toContain("- `gap: 48px` (md) is `md:gap-12`.");
    expect(section).toContain("- `color: #FF0066` is `text-brand`.");
    // The project cleared Tailwind's colors: red-500 isn't one of its own.
    expect(section).toContain("is `text-[oklch(63.7%_0.237_25.331)]` (no color of the theme)");
    expect(section).toContain("rebuilt on save by `npm run dev` (its `css`)");
  });

  it("a comment: the theme's scales to pick from, the project's own colors only; else the page's tokens by scale", async () => {
    await files({
      "package.json": "{}",
      "node_modules/tailwindcss/theme.css": "@theme default {\n  --spacing: 0.25rem;\n  --tracking-tight: -0.025em;\n  --tracking-tighter: -0.05em;\n  --color-red-500: #ef4444;\n}\n",
      "src/input.css": '@import "tailwindcss";\n@theme {\n  --color-brand: #ff0066;\n  --text-lg: 1.1875rem;\n}\n',
    });
    const comment = (tokens?: Job["changeSet"]["tokens"]) =>
      ({
        id: "c",
        changeSet: {
          page: { url: "http://localhost:5173/" },
          edits: [],
          ...(tokens ? { tokens } : {}),
          request: { kind: "comment", thread: [], breakpoints: [], target: { selector: "h2", path: "h2", tag: "h2", classes: [] } },
        },
      }) as unknown as Job;
    const section = factsSection(comment(), root);
    expect(section).toContain("- Its theme's scales (only these exist");
    expect(section).toContain("  - letter spacing (`tracking-`): `tight` -0.025em, `tighter` -0.05em");
    expect(section).toContain("  - font size (`text-`): `lg` 19px");
    expect(section).toContain("  - the project's colors (`text-`, `bg-`…): `brand` #ff0066");
    expect(section).not.toContain("red-500");
    // No Tailwind: the page's tokens, by scale.
    await rm(join(root, "src/input.css"));
    const plain = factsSection(
      comment([
        { name: "--space-sm", value: "1rem", now: "16px" },
        { name: "--space-md", value: "clamp(1.5rem, 1.1rem + 0.8vw, 1.75rem)", now: "26.7px" },
        { name: "--color-primary", value: "#7553fd" },
        { name: "--color-accent", value: "#1cf69e" },
      ]),
      root,
    );
    expect(plain).toContain("  - `--space-*`: sm 16px, md 26.7px");
    expect(plain).toContain("  - `--color-*`: primary #7553fd, accent #1cf69e");
  });

  it("nothing for a project without Tailwind 4", async () => {
    await files({ "package.json": "{}", "src/app.css": ".btn { padding: 8px; }\n" });
    expect(factsSection(jobOf([change("gap", "48px")]), root)).toBe("");
    await files({ "src/input.css": "@tailwind base;\n", "package.json": JSON.stringify({ devDependencies: { tailwindcss: "^3.4.0" } }) });
    expect(factsSection(jobOf([change("gap", "48px")]), root)).toBe("");
  });

  it("the entry nearest the job's code, of several", async () => {
    await files({
      "package.json": "{}",
      "web-2/css/input.css": '@import "tailwindcss";\n@theme { --spacing: 8px; }\n',
      "web-3/css/input.css": '@import "tailwindcss";\n',
    });
    expect(factsSection(jobOf([change("gap", "48px")]), root, ["web-3/modules/header.php"])).toContain("`gap: 48px` is `gap-12`");
    expect(factsSection(jobOf([change("gap", "48px")]), root, ["web-2/modules/header.php"])).toContain("`gap: 48px` is `gap-6`");
  });
});
