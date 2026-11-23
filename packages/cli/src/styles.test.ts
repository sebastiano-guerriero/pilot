import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { moduleClass, normalSelector, parseStylesheet, ruleSource } from "./styles.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pilot-styles-"));
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

describe("reading a stylesheet", () => {
  it("Sass nesting resolved, comments and templates left out, lines kept", () => {
    const rules = parseStylesheet(
      [
        "// a comment { not a rule }",
        "@mixin pad { .ghost { padding: 0; } }",
        ".btn {",
        "  padding: var(--space-xs) var(--space-sm); /* inline */",
        "  &--primary { background: var(--color-primary); }",
        "  &:hover, &:focus { color: red; }",
        "  > .icon { width: 1em; }",
        "  @media (min-width: 64rem) { padding: 8px; }",
        "  .label-#{$x} { color: blue; }",
        "}",
        '.form-control[aria-invalid="true"] { box-shadow: none; }',
        "a { background: url(http://example.com/x.png); }",
      ].join("\n"),
      "buttons.scss",
    );
    const at = (selector: string) => rules.find((r) => r.selectors.includes(selector));
    expect(at(".btn")).toMatchObject({ line: 3, declarations: [{ property: "padding", value: "var(--space-xs) var(--space-sm)", line: 4 }] });
    expect(at(".btn--primary")?.declarations[0]).toMatchObject({ property: "background", line: 5 });
    expect(at(".btn:hover")?.selectors).toEqual([".btn:hover", ".btn:focus"]);
    expect(at(".btn>.icon")?.declarations[0]?.line).toBe(7);
    expect(at(".ghost")).toBeUndefined();
    expect(at(".form-control[aria-invalid=true]")).toBeDefined();
    expect(at("a")?.declarations[0]?.value).toBe("url(http://example.com/x.png)");
    // The @media's declaration is the rule's, in its media.
    expect(rules.find((r) => r.media === "(min-width: 64rem)")?.selectors).toEqual([".btn"]);
  });

  it("selectors compared as compilers write them", () => {
    expect(normalSelector('.a  >  .b[type="text"]')).toBe(".a>.b[type=text]");
  });

  it("a CSS module's class as written, from the page's", () => {
    expect(moduleClass("Button_primary__a1B2c")).toEqual({ file: "Button", local: "primary" });
    expect(moduleClass("_primary_x7k2p_12")).toEqual({ local: "primary" });
    expect(moduleClass("btn--primary")).toBeNull();
  });
});

describe("where a value's rule is written", () => {
  it("in the Sass source, not the CSS compiled from it", async () => {
    await files({
      "package.json": "{}",
      "scss/buttons.scss": ".btn {\n  padding: 8px;\n}\n",
      "css/buttons.css": ".btn {\n  padding: 8px;\n}\n",
      "css/plain.css": ".card {\n  margin: 0;\n}\n",
    });
    expect(ruleSource(".btn", "padding", root)).toMatchObject({ rule: { file: "scss/buttons.scss" }, declaration: { line: 2 } });
    // A plain stylesheet with no source of its own is the source.
    expect(ruleSource(".card", "margin-top", root)).toMatchObject({ rule: { file: "css/plain.css" }, declaration: { property: "margin" } });
    expect(ruleSource(".missing", "padding", root)).toBeNull();
  });

  it("a CSS module's rule, from the page's hashed class", async () => {
    await files({
      "package.json": "{}",
      "src/Button.module.css": ".primary {\n  color: white;\n}\n",
      "src/Card.module.css": ".primary {\n  color: black;\n}\n",
      "src/global.css": ".primary { color: red; }\n",
    });
    expect(ruleSource(".Button_primary__a1B2c", "color", root)).toMatchObject({ rule: { file: "src/Button.module.css", line: 1 } });
  });

  it("a Vue file's <style>, at its line in the file", async () => {
    await files({
      "package.json": "{}",
      "src/Card.vue": '<template>\n  <div class="card">x</div>\n</template>\n\n<style scoped lang="scss">\n.card {\n  padding: 16px;\n}\n</style>\n',
    });
    expect(ruleSource(".card", "padding", root)).toMatchObject({ rule: { file: "src/Card.vue", line: 6 }, declaration: { line: 7 } });
  });

  it("in the element's own site: a copy in another site is never said", async () => {
    await files({
      "package.json": "{}",
      "demo/a/index.html": '<div class="hero"></div>',
      "demo/a/scss/style.scss": "@include hero-styles;\n",
      "demo/b/index.html": '<div class="hero"></div>',
      "demo/b/scss/style.scss": ".hero {\n  padding: 8px;\n}\n",
    });
    expect(ruleSource(".hero", "padding", root, ["demo/a/index.html"])).toBeNull();
    expect(ruleSource(".hero", "padding", root, ["demo/b/index.html"])).toMatchObject({ rule: { file: "demo/b/scss/style.scss" } });
  });
});
