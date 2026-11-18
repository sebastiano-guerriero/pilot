import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectFramework, init, packageManager } from "./init.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pilot-init-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Writes files under `dir` (objects as JSON). */
async function files(tree: Record<string, string | object>, base = dir): Promise<void> {
  for (const [path, content] of Object.entries(tree)) {
    const file = join(base, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
}
const json = async (path: string) => JSON.parse(await readFile(join(dir, path), "utf8"));

/** Records the commands init runs; `ok` decides whether they succeed. */
function recorder(ok = true) {
  const calls: string[] = [];
  return { calls, run: (command: string, args: string[]) => (calls.push(`${command} ${args.join(" ")}`), ok) };
}

describe("usepilot init", () => {
  it("a Vite app: installs with its package manager, registers the MCP server for each agent, and says where to load Pilot", async () => {
    await files({
      ".git/HEAD": "ref: refs/heads/main",
      "package.json": { dependencies: { react: "^19" }, devDependencies: { vite: "^7" } },
      "pnpm-lock.yaml": "",
      "index.html": '<script type="module" src="/src/main.tsx"></script>',
      "src/main.tsx": "",
      ".mcp.json": { mcpServers: { other: { command: "other" } } },
    });
    const { calls, run } = recorder();
    const out = await init({ cwd: dir, run });

    expect(calls).toEqual(["pnpm add -D usepilot"]);
    expect(await json(".mcp.json")).toEqual({
      mcpServers: { other: { command: "other" }, pilot: { command: "npx", args: ["-y", "usepilot", "mcp"] } },
    });
    expect((await json(".cursor/mcp.json")).mcpServers.pilot).toEqual({ command: "npx", args: ["-y", "usepilot", "mcp"] });
    expect((await json(".vscode/mcp.json")).servers.pilot).toEqual({ type: "stdio", command: "npx", args: ["-y", "usepilot", "mcp"] });
    expect(existsSync(join(dir, ".claude/skills/pilot/SKILL.md"))).toBe(true);

    expect(out).toContain("It's a Vite app: in its entry, `src/main.tsx`");
    expect(out).toContain('if (import.meta.env.DEV) import("usepilot/auto");');
    expect(out).toContain("codex mcp add pilot -- npx -y usepilot mcp");
    expect(out).toContain("ask to launch Pilot");
  });

  it("run again, it changes nothing, and an app that loads Pilot already gets no loading step", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7", usepilot: "^0.5.0" } },
      "src/main.ts": 'if (import.meta.env.DEV) import("usepilot/auto");\n',
    });
    const first = recorder();
    await init({ cwd: dir, run: first.run });
    const mcp = await readFile(join(dir, ".mcp.json"), "utf8");
    const second = recorder();
    const out = await init({ cwd: dir, run: second.run });

    expect([...first.calls, ...second.calls]).toEqual([]);
    expect(await readFile(join(dir, ".mcp.json"), "utf8")).toBe(mcp);
    expect(out).toContain("`usepilot` was already a dependency.");
    expect(out).toContain("The app already loads Pilot (`src/main.ts`).");
    expect(out).not.toContain("Load Pilot in the app");
  });

  it("when the install fails, it's left to the agent, with the command", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, "yarn.lock": "" });
    const out = await init({ cwd: dir, run: recorder(false).run });
    expect(out).toContain("Install Pilot as a dev dependency: run `yarn add -D usepilot`");
  });

  it("leaves an MCP config that isn't JSON as it was, and says so", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, ".cursor/mcp.json": "{ nope" });
    const out = await init({ cwd: dir, install: false });
    expect(await readFile(join(dir, ".cursor/mcp.json"), "utf8")).toBe("{ nope");
    expect(out).toContain("`.cursor/mcp.json` isn't valid JSON");
    expect(out).toContain("Install Pilot as a dev dependency: run `npm install -D usepilot`");
  });

  it("Next.js: a client component in the App Router's layout, or the Pages Router's _app", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/layout.tsx": "" });
    const app = await init({ cwd: dir, install: false });
    expect(app).toContain("It's Next.js (App Router)");
    expect(app).toContain("`app/layout.tsx`");
    expect(app).toContain('"use client";');

    const pages = await mkdtemp(join(tmpdir(), "pilot-init-"));
    await files({ "package.json": { dependencies: { next: "^14" } }, "pages/_app.tsx": "" }, pages);
    expect(await init({ cwd: pages, install: false })).toContain("It's Next.js (Pages Router): in `pages/_app.tsx`");
    await rm(pages, { recursive: true, force: true });
  });

  it("finds a loader in its own file (a Next.js component), not only in the entry", async () => {
    await files({
      "package.json": { dependencies: { next: "^16", usepilot: "^0.5.0" } },
      "app/layout.tsx": 'import { Pilot } from "../components/pilot";',
      "components/pilot.tsx": 'useEffect(() => { import("usepilot/auto"); }, []);',
    });
    expect(await init({ cwd: dir, install: false })).toContain("The app already loads Pilot (`components/pilot.tsx`).");
  });

  it("a monorepo's root: points at its apps instead", async () => {
    await files({
      "package.json": { workspaces: ["apps/*"] },
      "apps/web/package.json": { devDependencies: { vite: "^7" } },
      "apps/docs/package.json": { dependencies: { astro: "^5" } },
      "apps/tools/package.json": { dependencies: { lodash: "^4" } },
    });
    const out = await init({ cwd: dir, install: false });
    expect(out).toContain("monorepo's root");
    expect(out).toContain("- apps/docs");
    expect(out).toContain("- apps/web");
    expect(out).not.toContain("apps/tools");
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
  });

  it("no package.json: says where to run it", async () => {
    expect(await init({ cwd: dir, install: false })).toContain("There's no package.json");
  });

  it("frameworks and package managers", async () => {
    await files({ "bun.lock": "" });
    expect(packageManager(dir, dir)).toBe("bun");
    expect(detectFramework(dir, { nuxt: "4" }).kind).toBe("nuxt");
    expect(detectFramework(dir, { "@sveltejs/kit": "2" }).kind).toBe("sveltekit");
    expect(detectFramework(dir, { "@react-router/dev": "7", vite: "7" }).kind).toBe("react-router");
    expect(detectFramework(dir, { "react-scripts": "5" }).kind).toBe("webpack");
    expect(detectFramework(dir, { express: "5" }).kind).toBe("unknown");
  });
});
