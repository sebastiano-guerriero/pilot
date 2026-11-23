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
    // The tag's own line, its attributes on the lines after.
    expect(locate(target({ id: "pricing", tag: "section", classes: ["py-16"] }), root)).toMatchObject({ file: "src/Pricing.tsx", line: 3 });
  });

  it("by classes written by the template (PHP), its texts and its parents", async () => {
    await files({
      ".git/HEAD": "",
      "modules/testimonials.php": [
        "<?php $class = $values['class']; ?>",
        '<section class="container <?php echo $class;?>">',
        '  <p class="text-center text-lg">Trusted by 20,000+ designers and developers</p>',
        '  <ul class="flex flex-wrap justify-center mb-32">',
        "    <li>A</li>",
        "  </ul>",
        "</section>",
      ].join("\n"),
      "modules/other.php": '<section class="container">\n  <p>Something else</p>\n</section>\n',
    });
    const section = target({
      tag: "section",
      classes: ["container", "my-32"],
      text: "Trusted by 20,000+ designers and developers A",
      context: { texts: ["Trusted by 20,000+ designers and developers", "A"] },
    });
    expect(locate(section, root)).toMatchObject({ file: "modules/testimonials.php", line: 2 });
    const list = target({
      tag: "ul",
      classes: ["flex", "flex-wrap", "justify-center", "mb-32"],
      context: { texts: ["A"], parents: [{ tag: "section", classes: ["container", "my-32"] }] },
    });
    expect(locate(list, root)).toMatchObject({ file: "modules/testimonials.php", line: 4 });
  });

  it("JSX: classes in an expression, a component's tag, and its contents on the lines below", async () => {
    await files({
      "package.json": "{}",
      "src/Nav.tsx": [
        "export function Nav({ open }: { open: boolean }) {",
        "  return (",
        '    <nav className={cn("flex gap-4 px-6", open && "bg-surface")}>',
        '      <Link href="/pricing" className="text-sm">',
        "        Pricing",
        "      </Link>",
        "    </nav>",
        "  );",
        "}",
      ].join("\n"),
      "src/Footer.tsx": 'export const Footer = () => <nav className="flex gap-2">Links</nav>;\n',
    });
    const nav = target({ tag: "nav", classes: ["flex", "gap-4", "px-6", "bg-surface"], text: "Pricing", context: { texts: ["Pricing"], attrs: ["/pricing"] } });
    expect(locate(nav, root)).toMatchObject({ file: "src/Nav.tsx", line: 3 });
    const link = target({ tag: "a", classes: ["text-sm"], text: "Pricing", context: { texts: ["Pricing"], attrs: ["/pricing"] } });
    expect(locate(link, root)).toMatchObject({ file: "src/Nav.tsx", line: 4 });
  });

  it("another class list is another element: gap-2 isn't gap-4", async () => {
    await files({
      "package.json": "{}",
      "index.html": '<ul class="flex gap-2 menu-main">\n  <li>Home</li>\n</ul>\n<ul class="flex gap-4 menu-main">\n  <li>Home</li>\n</ul>\n',
    });
    const menu = target({ tag: "ul", classes: ["flex", "gap-4", "menu-main"], text: "Home", context: { texts: ["Home"] } });
    expect(locate(menu, root)).toMatchObject({ file: "index.html", line: 4 });
  });

  it("copies alike: told apart by what's beside them (their style, the heading above), else both said or none", async () => {
    await files({
      "package.json": "{}",
      "index.html": [
        "<h2>Experiment one</h2>",
        '<button class="btn-color" style="--bg: #111111">Copy</button>',
        '<button class="btn-color" style="--bg: #B3B3B3">Copy</button>',
        "<h2>Experiment two</h2>",
        '<a class="link" href="https://example.com">Docs</a>',
        "<h2>Experiment three</h2>",
        '<a class="link" href="https://example.com">Docs</a>',
        '<span class="dot"></span>',
        '<span class="dot"></span>',
      ].join("\n"),
    });
    const button = target({ tag: "button", classes: ["btn-color"], text: "Copy", context: { texts: ["Copy"], attrs: ["--bg: #B3B3B3"] } });
    expect(locate(button, root)).toMatchObject({ line: 3 });
    const docs = (heading: string) =>
      target({ tag: "a", classes: ["link"], text: "Docs", context: { texts: ["Docs"], attrs: ["https://example.com"], heading } });
    expect(locate(docs("Experiment three"), root)).toMatchObject({ line: 7 });
    expect(locate(docs("Experiment two"), root)).toMatchObject({ line: 5 });
    // Nothing tells the two dots apart: one of them, never one said as sure.
    const dot = locate(target({ tag: "span", classes: ["dot"], context: { parents: [] } }), root);
    expect(dot === null || dot.also !== undefined).toBe(true);
  });

  it("an empty element isn't the copy with text in it", async () => {
    await files({
      "package.json": "{}",
      "index.html": '<div class="flex h-full">\n  <div class="col w-[368px] h-full">\n    <p>Bay 1</p>\n  </div>\n  <div class="col w-[368px] h-full">\n  </div>\n</div>\n',
    });
    const empty = target({ tag: "div", classes: ["col", "w-[368px]", "h-full"], context: { parents: [{ tag: "div", classes: ["flex", "h-full"] }] } });
    expect(locate(empty, root)).toMatchObject({ line: 5 });
  });

  it("the page's own site: copies of it in other folders of the project lose", async () => {
    const card = '<div class="card">\n  <h3 class="card-title">Pricing plans</h3>\n</div>\n';
    await files({ ".git/HEAD": "", "web-2/index.php": "", "web-2/routes/pricing.php": card, "web-3/index.php": "", "web-3/routes/pricing.php": card });
    const title = target({ tag: "h3", classes: ["card-title"], text: "Pricing plans", context: { texts: ["Pricing plans"] } });
    expect(locate(title, root, { url: "http://localhost:8888/site/web-3/pricing" })).toMatchObject({ file: "web-3/routes/pricing.php", line: 2 });
    // Without the page's address, both are as likely.
    expect(locate(title, root)).toMatchObject({ also: {} });
  });

  it("says nothing when no line is clearly the element", async () => {
    await files({ "package.json": "{}", "index.html": '<div class="card">One</div>\n<div class="card">Two</div>\n<div class="card">Three</div>\n' });
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
