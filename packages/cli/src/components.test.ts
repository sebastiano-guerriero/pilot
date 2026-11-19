import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Job } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileComponentName, projectComponents, workspaceRoot } from "./components.ts";
import { withComponentFiles } from "./locate.ts";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pilot-components-"));
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
const names = (folder = root) => projectComponents([folder]).map((c) => `${c.name} ${c.file}:${c.line}`);

describe("the project's components", () => {
  it("exported React components (functions, arrows, forwardRef, memo), Vue and Svelte files; not helpers, hooks, constants, routes, tests", async () => {
    await files({
      "package.json": "{}",
      "src/components/ProductCard.tsx": [
        "import { memo, forwardRef } from 'react';",
        "export function ProductCard() { return <article />; }",
        "function Badge() { return <span />; }",
        "export const PriceTag = ({ value }: { value: number }) => <span>{value}</span>;",
        "export const Button = forwardRef<HTMLButtonElement>((props, ref) => <button ref={ref} {...props} />);",
        "const Rating = memo(() => <div />);",
        "export { Rating };",
        "export const API_URL = 'x';",
        "export const Sizes = { sm: 1 };",
        "export function useCart() { return null; }",
      ].join("\n"),
      "src/components/user-card.vue": "<template><div /></template>",
      "src/lib/Avatar.svelte": "<img />",
      "src/app/page.tsx": "export default function Page() { return <main />; }",
      "src/components/ProductCard.test.tsx": "export function Fixture() { return <div />; }",
      "node_modules/ui/Dialog.tsx": "export function Dialog() { return <dialog />; }",
      "src/util.ts": "export function Format() { return ''; }",
    });
    expect(names()).toEqual([
      "ProductCard src/components/ProductCard.tsx:2",
      "PriceTag src/components/ProductCard.tsx:4",
      "Button src/components/ProductCard.tsx:5",
      "Rating src/components/ProductCard.tsx:6",
      "UserCard src/components/user-card.vue:1",
      "Avatar src/lib/Avatar.svelte:1",
    ]);
  });

  it("kept current: a component added, changed or deleted shows the next time", async () => {
    await files({ "package.json": "{}", "src/A.tsx": "export function Alpha() { return <a />; }" });
    expect(names()).toEqual(["Alpha src/A.tsx:1"]);
    await files({ "src/B.tsx": "export function Beta() { return <b />; }" });
    await writeFile(join(root, "src/A.tsx"), "export function Gamma() { return <a />; }");
    // A later save time, as an editor's save would give it.
    const later = new Date(Date.now() + 5000);
    await utimes(join(root, "src/A.tsx"), later, later);
    expect(names()).toEqual(["Gamma src/A.tsx:1", "Beta src/B.tsx:1"]);
    await rm(join(root, "src/B.tsx"));
    expect(names()).toEqual(["Gamma src/A.tsx:1"]);
  });

  it("from the workspace's root in a monorepo, so a ui package's components are there for its app", async () => {
    await files({
      ".git/HEAD": "",
      "package.json": JSON.stringify({ workspaces: ["apps/*", "packages/*"] }),
      "apps/web/package.json": "{}",
      "apps/web/src/Hero.tsx": "export function Hero() { return <h1 />; }",
      "packages/ui/src/Card.tsx": "export function Card() { return <div />; }",
    });
    const app = join(root, "apps/web");
    expect(workspaceRoot(app)).toBe(root);
    expect(names(app)).toEqual(["Hero apps/web/src/Hero.tsx:1", "Card packages/ui/src/Card.tsx:1"]);
  });

  it("never above the repository: a project on its own is its own root", async () => {
    await files({ "app/.git/HEAD": "", "app/package.json": "{}", "package.json": JSON.stringify({ workspaces: ["*"] }) });
    expect(workspaceRoot(join(root, "app"))).toBe(join(root, "app"));
  });

  it("names a Vue or Svelte file's component in PascalCase", () => {
    expect(fileComponentName("/x/user-card.vue")).toBe("UserCard");
    expect(fileComponentName("/x/Avatar.svelte")).toBe("Avatar");
  });

  it("the agent's job: a mentioned project component's file relative to its folder; a typed name looked for by its declaration", async () => {
    await files({
      ".git/HEAD": "",
      "pnpm-workspace.yaml": "packages: ['apps/*', 'packages/*']",
      "apps/web/package.json": "{}",
      "packages/ui/src/Card.tsx": "export function Card() { return <div />; }",
      "packages/ui/src/Footer.tsx": "\nexport const Footer = () => <footer />;",
    });
    const app = join(root, "apps/web");
    const target = { selector: "h1", path: "h1", tag: "h1", classes: [] };
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
        edits: [],
        request: {
          kind: "comment",
          target,
          breakpoints: [],
          thread: [
            {
              from: "designer",
              text: "like @Card and @Footer, not @Nope",
              at: "",
              references: [
                { kind: "component", name: "Card", source: { file: "packages/ui/src/Card.tsx", line: 1 } },
                { kind: "unlisted", name: "Footer" },
                { kind: "unlisted", name: "Nope" },
              ],
            },
          ],
        },
      },
    } as Job;
    const request = withComponentFiles(job, app).changeSet.request;
    expect(request?.kind === "comment" && request.thread[0]?.references).toEqual([
      { kind: "component", name: "Card", source: { file: "../../packages/ui/src/Card.tsx", line: 1 } },
      { kind: "component", name: "Footer", source: { file: "../../packages/ui/src/Footer.tsx", line: 2 } },
      { kind: "unlisted", name: "Nope" },
    ]);
  });
});
