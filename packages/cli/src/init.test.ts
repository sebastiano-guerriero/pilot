import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectFramework, init, packageManager } from "./init.ts";

let dir: string;
/** The user's home folder, for each test its own: init never touches the real one. */
let home: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pilot-init-"));
  home = await mkdtemp(join(tmpdir(), "pilot-home-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
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
const json2 = async (base: string, path: string) => JSON.parse(await readFile(join(base, path), "utf8"));

/** Records the commands init runs; `ok` decides whether they succeed. */
function recorder(ok = true) {
  const calls: string[] = [];
  return { calls, run: (command: string, args: string[]) => (calls.push(`${command} ${args.join(" ")}`), ok) };
}

describe("usepilot init", () => {
  it("--project, a Vite app in Cursor: installs, connects only Cursor, keeps an agent the project already uses, says where to load Pilot", async () => {
    await files({
      ".git/HEAD": "ref: refs/heads/main",
      "package.json": { dependencies: { react: "^19" }, devDependencies: { vite: "^7" } },
      "pnpm-lock.yaml": "",
      "index.html": '<script type="module" src="/src/main.tsx"></script>',
      "src/main.tsx": "",
      ".mcp.json": { mcpServers: { other: { command: "other" } } }, // a teammate uses Claude Code
    });
    const { calls, run } = recorder();
    const out = await init({ env: {}, home, cwd: dir, run, agent: "cursor", scope: "project" });

    expect(calls).toEqual(["pnpm add -D usepilot"]);
    expect((await json(".cursor/mcp.json")).mcpServers.pilot).toEqual({ command: "npx", args: ["-y", "usepilot", "mcp"] });
    expect(existsSync(join(dir, ".cursor/skills/pilot/SKILL.md"))).toBe(true);
    // Claude Code was there already: it gets Pilot too, its other servers kept.
    expect(await json(".mcp.json")).toEqual({
      mcpServers: { other: { command: "other" }, pilot: { command: "npx", args: ["-y", "usepilot", "mcp"] } },
    });
    expect(existsSync(join(dir, ".claude/skills/pilot/SKILL.md"))).toBe(true);
    // Nothing for agents the project doesn't use.
    for (const path of [".vscode", ".github", ".agents"]) expect(existsSync(join(dir, path))).toBe(false);

    expect(out).toContain("Set Pilot up for Cursor in this project: its MCP server (`.cursor/mcp.json`) and the `pilot` skill (`.cursor/skills/pilot/`).");
    // In the repo, Cursor leaves the server off until it's switched on.
    expect(out).toContain("**turn Pilot on first**");
    expect(out).toContain("It's a Vite app: in its entry module, `src/main.tsx`");
    expect(out).toContain("works from a **new chat**, not this one");
    expect(out).toContain("ask to launch Pilot, or run `/pilot`");
    expect(out).not.toContain("codex mcp add");
  });

  it("by default, connects the agent once for the machine: its own config, nothing in the repo", async () => {
    await files({ ".git/HEAD": "ref: refs/heads/main", "package.json": { devDependencies: { vite: "^7" } }, "src/main.ts": "" });
    await files({ ".cursor/mcp.json": { mcpServers: { figma: { url: "https://figma" } } } }, home);
    const out = await init({ env: {}, home, cwd: dir, install: false, agent: "cursor" });
    expect((await json2(home, ".cursor/mcp.json")).mcpServers).toEqual({
      figma: { url: "https://figma" },
      pilot: { command: "npx", args: ["-y", "usepilot", "mcp"] },
    });
    expect(existsSync(join(home, ".cursor/skills/pilot/SKILL.md"))).toBe(true);
    expect((await readdir(dir)).filter((name) => name.startsWith(".") && name !== ".git")).toEqual([]);
    expect(out).toContain("Connected Cursor to Pilot, once for every project on this machine");
    expect(out).toContain("Nothing was added to the repo.");
    // A server in the agent's own config isn't switched off: no step for it.
    expect(out).not.toContain("turn Pilot on first");
  });

  it("by default, an agent that keeps its own MCP config gets its CLI command, once", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const { calls, run } = recorder();
    const out = await init({ env: {}, home, cwd: dir, install: false, agent: "claude-code", run });
    expect(calls).toEqual(["claude mcp add --scope user pilot -- npx -y usepilot mcp"]);
    expect(existsSync(join(home, ".claude/skills/pilot/SKILL.md"))).toBe(true);
    expect(out).toContain("its MCP server (`claude mcp add --scope user pilot -- npx -y usepilot mcp`)");
    // Registered already: not again.
    await files({ ".claude.json": { mcpServers: { pilot: {} } } }, home);
    const again = recorder();
    expect(await init({ env: {}, home, cwd: dir, install: false, agent: "claude-code", run: again.run })).toContain("registered already");
    expect(again.calls).toEqual([]);
    // Codex, its CLI missing: the command is left to it.
    const out2 = await init({ env: {}, home, cwd: dir, install: false, agent: "codex", run: recorder(false).run });
    expect(out2).toContain("**Register Pilot's MCP server with yourself**: run `codex mcp add pilot -- npx -y usepilot mcp`.");
    expect(existsSync(join(home, ".agents/skills/pilot/SKILL.md"))).toBe(true);
  });

  it("VS Code's user config is per OS", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    await init({ env: {}, home, cwd: dir, install: false, agent: "vscode", platform: "darwin" });
    expect((await json2(home, "Library/Application Support/Code/User/mcp.json")).servers.pilot).toMatchObject({ type: "stdio" });
    await init({ env: {}, home, cwd: dir, install: false, agent: "vscode", platform: "linux" });
    expect(existsSync(join(home, ".config/Code/User/mcp.json"))).toBe(true);
    expect(existsSync(join(home, ".copilot/skills/pilot/SKILL.md"))).toBe(true);
  });

  it("--project: a fresh project gets only the running agent's folder", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, "src/main.ts": "" });
    await init({ env: {}, home, cwd: dir, install: false, agent: "cursor", scope: "project" });
    const added = (await readdir(dir)).filter((name) => name.startsWith("."));
    expect(added).toEqual([".cursor"]);
  });

  it("--project, Codex: the shared skills folder, and the command to register the server with itself", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const out = await init({ env: {}, home, cwd: dir, install: false, agent: "codex", scope: "project" });
    expect(existsSync(join(dir, ".agents/skills/pilot/SKILL.md"))).toBe(true);
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
    expect(out).toContain("**Register Pilot's MCP server with yourself**: `codex mcp add pilot -- npx -y usepilot mcp`.");
    expect(out).toContain("or run `$pilot`");
  });

  it("tells the agent from its shell; with none to go by, writes no agent files and asks it to say which it is", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    // A stand-in runner: a test never runs a real agent CLI.
    expect(await init({ env: { CLAUDECODE: "1" }, home, cwd: dir, install: false, run: recorder().run })).toContain("Connected Claude Code to Pilot");
    const other = await mkdtemp(join(tmpdir(), "pilot-init-"));
    await files({ "package.json": { devDependencies: { vite: "^7" } } }, other);
    const out = await init({ env: {}, home, cwd: other, install: false });
    expect((await readdir(other)).filter((name) => name.startsWith("."))).toEqual([]);
    expect(out).toContain("**Connect yourself:** run `npx usepilot@latest init --agent <you>`");
    await rm(other, { recursive: true, force: true });
  });

  it("--project, run again: it changes nothing, and an app that loads Pilot already gets no loading step", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7", usepilot: "^0.5.0" } },
      "src/main.ts": 'if (import.meta.env.DEV) import("usepilot/auto");\n',
    });
    const first = recorder();
    await init({ env: {}, home, cwd: dir, run: first.run, agent: "claude-code", scope: "project" });
    const mcp = await readFile(join(dir, ".mcp.json"), "utf8");
    const second = recorder();
    const out = await init({ env: {}, home, cwd: dir, run: second.run, agent: "claude-code", scope: "project" });

    expect([...first.calls, ...second.calls]).toEqual([]);
    expect(await readFile(join(dir, ".mcp.json"), "utf8")).toBe(mcp);
    expect(out).toContain("`usepilot` was already a dependency.");
    expect(out).toContain("The app already loads Pilot (`src/main.ts`).");
    expect(out).not.toContain("Load Pilot in the app");
  });

  it("a Vite page with only classic scripts: Pilot injected from the Vite config while serving, not a guessed entry", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7" } },
      "index.html": '<body><script src="/assets/js/main.js"></script></body>',
      "assets/js/main.js": "",
      "src/main.ts": "", // not loaded by the page: not the entry
    });
    const out = await init({ env: {}, home, cwd: dir, install: false });
    expect(out).toContain("whose pages load no module of their own");
    expect(out).toContain("don't edit the HTML");
    expect(out).toContain("its Vite config (create `vite.config.js` if there's none)");
    expect(out).toContain('apply: "serve"');
    expect(out).toContain('order: "pre"');
    expect(out).not.toContain("src/main.ts");
  });

  it("a Vite config that injects Pilot counts as loading it", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7", usepilot: "^0.6.0" } },
      "index.html": '<script src="/main.js"></script>',
      "vite.config.js": 'export default { plugins: [{ name: "pilot", apply: "serve", transformIndexHtml: () => [{ children: \'import("usepilot/auto");\' }] }] };',
    });
    expect(await init({ env: {}, home, cwd: dir, install: false })).toContain("The app already loads Pilot (`vite.config.js`).");
  });

  it("a module script with its attributes in any order is the entry", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7" } },
      "index.html": '<script src="/src/app.ts?v=1" defer type="module"></script>',
      "src/app.ts": "",
    });
    expect(await init({ env: {}, home, cwd: dir, install: false })).toContain("in its entry module, `src/app.ts`");
  });

  it("names no file it didn't find: Next.js with no layout gets what to look for", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/page.tsx": "" });
    const out = await init({ env: {}, home, cwd: dir, install: false });
    expect(out).toContain("render it in the root layout, inside");
    expect(out).not.toContain("`app/layout.tsx`");
  });

  it("when the install fails, it's left to the agent, with the command", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, "yarn.lock": "" });
    const out = await init({ env: {}, home, cwd: dir, run: recorder(false).run });
    expect(out).toContain("Install Pilot as a dev dependency: run `yarn add -D usepilot`");
  });

  it("leaves an MCP config that isn't JSON as it was, and says so", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, ".cursor/mcp.json": "{ nope" });
    const out = await init({ env: {}, home, cwd: dir, install: false, agent: "cursor", scope: "project" });
    expect(await readFile(join(dir, ".cursor/mcp.json"), "utf8")).toBe("{ nope");
    expect(out).toContain("`.cursor/mcp.json` isn't valid JSON");
    expect(out).toContain("Install Pilot as a dev dependency: run `npm install -D usepilot`");
  });

  it("Next.js: a client component in the App Router's layout, or the Pages Router's _app", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/layout.tsx": "" });
    const app = await init({ env: {}, home, cwd: dir, install: false });
    expect(app).toContain("It's Next.js (App Router)");
    expect(app).toContain("render it in `app/layout.tsx`, inside");
    expect(app).toContain('"use client";');

    const pages = await mkdtemp(join(tmpdir(), "pilot-init-"));
    await files({ "package.json": { dependencies: { next: "^14" } }, "pages/_app.tsx": "" }, pages);
    expect(await init({ env: {}, home, cwd: pages, install: false })).toContain("It's Next.js (Pages Router): in `pages/_app.tsx`");
    await rm(pages, { recursive: true, force: true });
  });

  it("finds a loader in its own file (a Next.js component), not only in the entry", async () => {
    await files({
      "package.json": { dependencies: { next: "^16", usepilot: "^0.5.0" } },
      "app/layout.tsx": 'import { Pilot } from "../components/pilot";',
      "components/pilot.tsx": 'useEffect(() => { import("usepilot/auto"); }, []);',
    });
    expect(await init({ env: {}, home, cwd: dir, install: false })).toContain("The app already loads Pilot (`components/pilot.tsx`).");
  });

  it("a monorepo's root: points at its apps instead", async () => {
    await files({
      "package.json": { workspaces: ["apps/*"] },
      "apps/web/package.json": { devDependencies: { vite: "^7" } },
      "apps/docs/package.json": { dependencies: { astro: "^5" } },
      "apps/tools/package.json": { dependencies: { lodash: "^4" } },
    });
    const out = await init({ env: {}, home, cwd: dir, install: false });
    expect(out).toContain("monorepo's root");
    expect(out).toContain("- apps/docs");
    expect(out).toContain("- apps/web");
    expect(out).not.toContain("apps/tools");
    expect(existsSync(join(dir, ".mcp.json"))).toBe(false);
  });

  it("no package.json: says where to run it", async () => {
    expect(await init({ env: {}, home, cwd: dir, install: false })).toContain("There's no package.json");
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
