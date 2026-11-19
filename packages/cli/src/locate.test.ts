import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ElementTarget, Job } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { componentFile, locate, whereSection, withComponentFiles } from "./locate.ts";

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
const target = (patch: Partial<ElementTarget>): ElementTarget => ({
  selector: "a.btn",
  path: "main > a.btn",
  tag: "a",
  classes: [],
  ...patch,
});

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
      "src/Pricing.tsx":
        'export function Pricing() {\n  return (\n    <section\n      id="pricing"\n      className="py-16">\n    </section>\n  );\n}\n',
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

describe("finding a component's file by its name", () => {
  it("its declaration, in any form; a file named after it first, then an exported one; never node_modules", async () => {
    await files({
      "package.json": "{}",
      "node_modules/ui/ProductCard.js": "export function ProductCard() {}",
      "src/utils.ts": "// ProductCard helpers\nconst ProductCard = null;",
      "src/components/ProductCard.tsx": "type Props = {};\n\nexport function ProductCard({}: Props) {\n  return <article />;\n}\n",
      "src/Button.tsx": "import * as React from 'react';\nexport const Button = React.forwardRef(function Button() {});",
      "src/Legacy.jsx": "export default class Legacy extends Component {}",
    });
    expect(componentFile("ProductCard", root)).toEqual({ file: "src/components/ProductCard.tsx", line: 3 });
    expect(componentFile("Button", root)).toEqual({ file: "src/Button.tsx", line: 2 });
    expect(componentFile("Legacy", root)).toEqual({ file: "src/Legacy.jsx", line: 1 });
    expect(componentFile("Missing", root)).toBeNull();
    expect(componentFile("not a name", root)).toBeNull();
  });

  it("fills in a job's components (Turbopack, Server Components), and the line in a file the page named (React 19)", async () => {
    await files({
      "package.json": "{}",
      "app/components/ProductCard.tsx": '\nexport function ProductCard() {\n  return <h3 className="text-lg">x</h3>;\n}\n',
    });
    const named = target({ tag: "h3", classes: ["text-lg"], source: { component: "ProductCard" } });
    const withFile = target({
      tag: "h3",
      classes: ["text-lg"],
      source: { component: "ProductCard", file: "app/components/ProductCard.tsx" },
    });
    const outside = target({ source: { component: "Dialog", file: "/elsewhere/node_modules/ui/Dialog.js" } });
    const job = {
      id: "j",
      origin: "",
      status: "queued",
      createdAt: "",
      updatedAt: "",
      changeSet: {
        id: "j",
        createdAt: "",
        page: { url: "", title: "", viewport: { width: 0, height: 0 } },
        edits: [named, withFile, outside].map((t) => ({ target: t, changes: [] })),
      },
    } as Job;
    const filled = withComponentFiles(job, root).changeSet.edits.map((e) => e.target.source);
    expect(filled).toEqual([
      { component: "ProductCard", file: "app/components/ProductCard.tsx", line: 2 },
      { component: "ProductCard", file: "app/components/ProductCard.tsx", line: 2 },
      { component: "Dialog", file: "/elsewhere/node_modules/ui/Dialog.js" },
    ]);
    // The job the hub keeps is left as it is.
    expect(job.changeSet.edits[0]?.target.source).toEqual({ component: "ProductCard" });
    // And "Where the code probably is" goes straight to the declaration.
    // And "Where the code probably is" goes to the element's own line in it: its classes are enough there.
    expect(whereSection(withComponentFiles(job, root), root)).toContain("→ `app/components/ProductCard.tsx:3`");
  });
});
