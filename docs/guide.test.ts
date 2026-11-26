import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The user guide ships with the package and must match each release
// (docs/development.md, "The user guide"). Bumping the version fails here
// until the guide says the same version, so a release can't skip checking it.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "packages/usepilot");
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { version: string; files: string[] };
const guide = readFileSync(join(pkgDir, "GUIDE.md"), "utf8");

describe("user guide", () => {
  it("says the package's version", () => {
    expect(guide.match(/This guide is for \*\*usepilot (\d+\.\d+\.\d+)\*\*/)?.[1]).toBe(pkg.version);
  });

  it("ships in the package", () => {
    expect(pkg.files).toContain("GUIDE.md");
  });

  it("is named by both READMEs", () => {
    for (const readme of [join(root, "README.md"), join(pkgDir, "README.md")]) {
      expect(readFileSync(readme, "utf8")).toContain("npx usepilot guide");
    }
  });

  it("links only to its own sections", () => {
    const anchors = new Set(
      [...guide.matchAll(/^#{2,3} (.+)$/gm)].map((m) =>
        m[1]
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s/g, "-"),
      ),
    );
    const links = [...guide.replace(/```[\s\S]*?```/g, "").matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    expect(links.filter((l) => !l.startsWith("#") || !anchors.has(l.slice(1)))).toEqual([]);
  });
});
