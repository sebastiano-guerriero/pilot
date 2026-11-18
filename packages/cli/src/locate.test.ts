import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ElementTarget, Job } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locate, whereSection } from "./locate.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pilot-locate-"));
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
const target = (patch: Partial<ElementTarget>): ElementTarget => ({ selector: "a.btn", path: "main > a.btn", tag: "a", classes: [], ...patch });

describe("finding an element's code", () => {
  it("by its text and classes, with the lines around it", async () => {
    await files({
      "package.json": "{}",
      "index.html": `<html>\n<head><title>Hire Me</title></head>\n<body>\n  <header>\n    <a class="btn btn-primary" href="#contact">Hire Me</a>\n  </header>\n</body>\n</html>\n`,
    });
    const at = locate(target({ classes: ["btn", "btn-primary"], text: "Hire Me" }), root);
    // The link, not the <title> with the same words.
    expect(at).toMatchObject({ file: "index.html", line: 5 });
    expect(at?.snippet).toContain('<a class="btn btn-primary" href="#contact">Hire Me</a>');
  });

  it("by its id, across the project's components, never in node_modules", async () => {
    await files({
      "package.json": "{}",
      "node_modules/lib/index.js": 'const a = <div id="pricing">x</div>;',
      "src/Pricing.tsx": 'export function Pricing() {\n  return (\n    <section\n      id="pricing"\n      className="py-16">\n    </section>\n  );\n}\n',
    });
    expect(locate(target({ id: "pricing", tag: "section", classes: ["py-16"] }), root)).toMatchObject({ file: "src/Pricing.tsx", line: 4 });
  });

  it("says nothing when no line is clearly the element", async () => {
    await files({ "package.json": "{}", "index.html": '<div class="card">One</div>\n<div class="card">Two</div>\n' });
    expect(locate(target({ tag: "div", classes: ["card"] }), root)).toBeNull();
  });

  it("a job's section lists what it found, and nothing outside a project", async () => {
    await files({ "package.json": "{}", "index.html": '<a class="btn" href="#">Hire Me</a>\n' });
    const job = {
      id: "j",
      changeSet: { edits: [{ target: target({ classes: ["btn"], text: "Hire Me" }), changes: [] }] },
    } as unknown as Job;
    const section = whereSection(job, root);
    expect(section).toContain("## Where the code probably is");
    expect(section).toContain("`main > a.btn` → `index.html:1`");
    const bare = await mkdtemp(join(tmpdir(), "pilot-bare-"));
    expect(whereSection(job, bare)).toBe("");
    await rm(bare, { recursive: true, force: true });
  });
});
