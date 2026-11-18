import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every relative link in the docs, the README and CLAUDE.md must point at a
// file or folder that exists, so the docs can't quietly fall behind the code.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const files = [
  join(root, "README.md"),
  join(root, "CLAUDE.md"),
  ...readdirSync(docs)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(docs, name)),
];

/** The relative link targets in a Markdown file, outside code blocks. */
function linksIn(markdown: string): string[] {
  const prose = markdown.replace(/```[\s\S]*?```/g, "");
  const targets = [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  return targets.filter((target) => !/^(https?:|mailto:|#)/.test(target));
}

describe("doc links", () => {
  for (const file of files) {
    it(relative(root, file), () => {
      const broken = linksIn(readFileSync(file, "utf8")).filter((target) => {
        const path = target.replace(/#.*$/, "").replace(/:\d+$/, "");
        return !existsSync(resolve(dirname(file), path));
      });
      expect(broken).toEqual([]);
    });
  }
});
