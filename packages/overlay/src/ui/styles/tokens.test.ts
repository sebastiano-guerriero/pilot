import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `var(--plt-…)` used in Pilot's CSS must be defined in tokens.css.
 * An undefined token doesn't error; the property just silently gets no
 * value. So this check is the only thing that catches it.
 */

// All of the overlay source: ui/ and editors/ both have CSS.
const srcDir = join(import.meta.dirname, "../..");
const tokensFile = join(import.meta.dirname, "tokens.css");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

describe("design tokens", () => {
  it("only uses tokens defined in tokens.css", () => {
    const defined = new Set(
      [...stripComments(readFileSync(tokensFile, "utf8")).matchAll(/(--plt-[\w-]+)\s*:/g)].map((m) => m[1]),
    );

    const undefinedUses: string[] = [];
    for (const file of cssFiles(srcDir)) {
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, i) => {
        for (const [, token] of line.matchAll(/var\(\s*(--plt-[\w-]+)/g)) {
          if (!defined.has(token as string)) undefinedUses.push(`${relative(srcDir, file)}:${i + 1} ${token}`);
        }
      });
    }

    expect(undefinedUses, "Undefined tokens. Use one from tokens.css or a raw value").toEqual([]);
  });
});
