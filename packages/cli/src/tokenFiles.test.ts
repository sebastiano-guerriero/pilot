import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileTokens, jsonTokens, sassTokens } from "./tokenFiles.ts";

describe("token files", () => {
  it("JSON: the W3C format and Style Dictionary's, nested into dotted names, aliases followed", () => {
    const w3c = JSON.stringify(
      {
        color: { brand: { primary: { $value: "#1cf69e", $type: "color" } }, link: { $value: "{color.brand.primary}" } },
        space: { 4: { $value: "16px" } },
      },
      null,
      2,
    );
    expect(jsonTokens(w3c, "tokens.json").map((t) => [t.name, t.value])).toEqual([
      ["color.brand.primary", "#1cf69e"],
      ["color.link", "#1cf69e"],
      ["space.4", "16px"],
    ]);
    const sd = JSON.stringify({
      size: { radius: { md: { value: "8px" } } },
      font: { body: { value: "{font.base}" }, base: { value: "Inter, sans-serif" } },
    });
    expect(jsonTokens(sd, "t.json").map((t) => [t.name, t.value])).toEqual([
      ["size.radius.md", "8px"],
      ["font.body", "Inter, sans-serif"],
      ["font.base", "Inter, sans-serif"],
    ]);
    // A broken alias, or a composite (an object) value: left out.
    expect(jsonTokens(JSON.stringify({ a: { $value: "{nope}" }, shadow: { $value: { x: 1 } } }), "t.json")).toEqual([]);
  });

  it("Sass: $variables with their line, references followed; computed ones left out", () => {
    const scss = [
      "$brand: #1cf69e;",
      "$link: $brand !default;",
      "$space-4: 16px;",
      "$dark: darken($brand, 10%);",
      "  .a { color: red; }",
    ].join("\n");
    expect(sassTokens(scss, "_variables.scss")).toEqual([
      { name: "$brand", value: "#1cf69e", file: "_variables.scss", line: 1 },
      { name: "$link", value: "#1cf69e", file: "_variables.scss", line: 2 },
      { name: "$space-4", value: "16px", file: "_variables.scss", line: 3 },
    ]);
  });

  describe("in a project", () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), "pilot-tokens-"));
    });
    afterEach(async () => rm(root, { recursive: true, force: true }));
    const files = async (tree: Record<string, string>) => {
      for (const [path, content] of Object.entries(tree)) {
        await mkdir(dirname(join(root, path)), { recursive: true });
        await writeFile(join(root, path), content);
      }
    };

    it("finds the token files by their names (and a tokens/ folder), not every JSON or Sass file", async () => {
      await files({
        "package.json": JSON.stringify({ name: "app", version: "1.0.0" }),
        "tokens/colors.json": JSON.stringify({ brand: { $value: "#1cf69e" } }),
        "src/styles/_variables.scss": "$radius: 8px;",
        "src/styles/button.scss": "$local: 2px;",
        "src/data.json": JSON.stringify({ a: { value: "x" } }),
      });
      expect(fileTokens([root]).map((t) => `${t.name} ${t.file}`)).toEqual([
        "$radius src/styles/_variables.scss",
        "brand tokens/colors.json",
      ]);
    });
  });
});
