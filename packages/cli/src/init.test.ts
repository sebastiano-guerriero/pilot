import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FoundAgent } from "./agents.ts";
import { savedAgent } from "./config.ts";
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

/** No agent installed: init never runs the real ones' sign-in checks in tests. */
const none = async (): Promise<FoundAgent[]> => [];
const found = (...agents: FoundAgent[]) => async () => agents;

/** Records the commands init runs; `ok` decides whether they succeed. */
function recorder(ok = true) {
  const calls: string[] = [];
  return { calls, run: (command: string, args: string[]) => (calls.push(`${command} ${args.join(" ")}`), ok) };
}

describe("usepilot init", () => {
  it("says which agent Pilot will run, or what to install or sign in to; ends with npx usepilot", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const ready = await init({ detect: found({ kind: "claude", bin: "/bin/claude", signedIn: true }), home, cwd: dir, install: false });
    expect(ready).toContain("Pilot will run Claude Code, signed in here, for each job.");
    expect(ready).toContain(`run \`npx usepilot\` in ${dir}`);
    const both = await init({ detect: found({ kind: "claude", bin: "c", signedIn: true }, { kind: "codex", bin: "x", signedIn: true }), home, cwd: dir, install: false });
    expect(both).toContain("Found Claude Code and Codex signed in");
    const out = await init({ detect: found({ kind: "cursor", bin: "/bin/cursor-agent", signedIn: false }), home, cwd: dir, install: false });
    expect(out).toContain("sign in to Cursor (`cursor-agent login`)");
    const nothing = await init({ detect: none, home, cwd: dir, install: false });
    expect(nothing).toContain("none is installed here");
    expect(nothing).toContain("`claude auth login`");
  });

  it("--agent: saves the agent for the project when it's ready", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const configFile = join(home, "projects.json");
    const out = await init({ detect: found({ kind: "codex", bin: "x", signedIn: true }), agent: "codex", configFile, home, cwd: dir, install: false });
    expect(out).toContain("Pilot will run Codex for this project");
    expect(savedAgent(dir, configFile)).toBe("codex");
    const missing = await init({ detect: none, agent: "claude-code", configFile: join(home, "other.json"), home, cwd: dir, install: false });
    expect(missing).toContain("install Claude Code's command-line tool");
  });

  it("removes Pilot's old chat setup (its MCP server and /pilot skill), and only Pilot's", async () => {
    await files({
      ".git/HEAD": "ref: refs/heads/main",
      "package.json": { devDependencies: { vite: "^7" } },
      ".mcp.json": { mcpServers: { pilot: { command: "npx", args: ["-y", "usepilot@latest", "mcp"] }, other: { command: "x" } } },
      ".claude/skills/pilot/SKILL.md": "---\nname: pilot\n---\n",
      ".agents/skills/pilot/SKILL.md": "---\nname: someone-else\n---\n",
    });
    await files({ ".cursor/mcp.json": { mcpServers: { pilot: { command: "npx", args: ["-y", "usepilot", "mcp"] } } }, ".claude.json": { mcpServers: { pilot: { command: "npx", args: ["-y", "usepilot@latest", "mcp"] } } } }, home);
    const { calls, run } = recorder();
    const out = await init({ detect: none, home, cwd: dir, run, install: false });
    expect(await json(".mcp.json")).toEqual({ mcpServers: { other: { command: "x" } } });
    expect(await json2(home, ".cursor/mcp.json")).toEqual({ mcpServers: {} });
    expect(existsSync(join(dir, ".claude/skills/pilot"))).toBe(false);
    expect(existsSync(join(dir, ".agents/skills/pilot"))).toBe(true);
    expect(calls).toContain("claude mcp remove --scope user pilot");
    expect(out).toContain("Removed Pilot's old chat setup");
  });

  it("a site with no bundler (PHP): one tag in the shared layout, printed only when Pilot's file is there and the project says it's local, never from the request", async () => {
    await files({ ".git/HEAD": "ref: refs/heads/main", "package.json": { devDependencies: { gulp: "^4" } }, "composer.json": "{}" });
    const out = await init({ detect: none, home, cwd: dir, install: false, agent: "cursor" });
    expect(out).toContain("It must never be output on a server, whatever a request says.");
    expect(out).toContain("is_file(__DIR__ . '/node_modules/usepilot/dist/pilot-auto.js') && getenv('APP_ENV') === 'local'");
    expect(out).toContain("Never decide from the request (the Host header, the client's IP)");
    expect(out).toContain("Pilot works on every page");
  });

  it("run again: it changes nothing, and an app that loads Pilot already gets no loading step", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7", usepilot: "^0.5.0" } },
      "src/main.ts": 'if (import.meta.env.DEV) import("usepilot/auto");\n',
    });
    const first = recorder();
    await init({ detect: none, home, cwd: dir, run: first.run });
    const second = recorder();
    const out = await init({ detect: none, home, cwd: dir, run: second.run });
    expect([...first.calls, ...second.calls]).toEqual([]);
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
    const out = await init({ detect: none, home, cwd: dir, install: false });
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
    expect(await init({ detect: none, home, cwd: dir, install: false })).toContain("The app already loads Pilot (`vite.config.js`).");
  });

  it("a module script with its attributes in any order is the entry", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7" } },
      "index.html": '<script src="/src/app.ts?v=1" defer type="module"></script>',
      "src/app.ts": "",
    });
    expect(await init({ detect: none, home, cwd: dir, install: false })).toContain("in its entry module, `src/app.ts`");
  });

  it("names no file it didn't find: Next.js with no layout gets what to look for", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/page.tsx": "" });
    const out = await init({ detect: none, home, cwd: dir, install: false });
    expect(out).toContain("render it in the root layout, inside");
    expect(out).not.toContain("`app/layout.tsx`");
  });

  it("when the install fails, it's left to the agent, with the command", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, "yarn.lock": "" });
    const out = await init({ detect: none, home, cwd: dir, run: recorder(false).run });
    expect(out).toContain("Install Pilot as a dev dependency: run `yarn add -D usepilot`");
  });

  it("Next.js: a client component in the App Router's layout, or the Pages Router's _app", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/layout.tsx": "" });
    const app = await init({ detect: none, home, cwd: dir, install: false });
    expect(app).toContain("It's Next.js (App Router)");
    expect(app).toContain("render it in `app/layout.tsx`, inside");
    expect(app).toContain('"use client";');

    const pages = await mkdtemp(join(tmpdir(), "pilot-init-"));
    await files({ "package.json": { dependencies: { next: "^14" } }, "pages/_app.tsx": "" }, pages);
    expect(await init({ detect: none, home, cwd: pages, install: false })).toContain("It's Next.js (Pages Router): in `pages/_app.tsx`");
    await rm(pages, { recursive: true, force: true });
  });

  it("finds a loader in its own file (a Next.js component), not only in the entry", async () => {
    await files({
      "package.json": { dependencies: { next: "^16", usepilot: "^0.5.0" } },
      "app/layout.tsx": 'import { Pilot } from "../components/pilot";',
      "components/pilot.tsx": 'useEffect(() => { import("usepilot/auto"); }, []);',
    });
    expect(await init({ detect: none, home, cwd: dir, install: false })).toContain("The app already loads Pilot (`components/pilot.tsx`).");
  });

  it("a monorepo's root: points at its apps instead", async () => {
    await files({
      "package.json": { workspaces: ["apps/*"] },
      "apps/web/package.json": { devDependencies: { vite: "^7" } },
      "apps/docs/package.json": { dependencies: { astro: "^5" } },
      "apps/tools/package.json": { dependencies: { lodash: "^4" } },
    });
    const out = await init({ detect: none, home, cwd: dir, install: false });
    expect(out).toContain("monorepo's root");
    expect(out).toContain("- apps/docs");
    expect(out).toContain("- apps/web");
    expect(out).not.toContain("apps/tools");
  });

  it("no package.json: says where to run it", async () => {
    expect(await init({ detect: none, home, cwd: dir, install: false })).toContain("There's no package.json");
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
