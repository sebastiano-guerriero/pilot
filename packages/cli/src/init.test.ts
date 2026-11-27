import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FoundAgent } from "./agents.ts";
import { configFile, isSetUp, savedAgent } from "./config.ts";
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
  it("says which agent Pilot will run; signing in is left for the page, not a step before Pilot works", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const ready = await init({ env: {}, detect: found({ kind: "claude", bin: "/bin/claude", signedIn: true }), home, cwd: dir, install: false });
    expect(ready).toContain("Pilot will run Claude Code, signed in here, for each job.");
    const both = await init({ env: {}, detect: found({ kind: "claude", bin: "c", signedIn: true }, { kind: "codex", bin: "x", signedIn: true }), home, cwd: dir, install: false });
    expect(both).toContain("Found Claude Code and Codex signed in");
    // Installed, not signed in: Pilot runs it, and the user signs in when Pilot asks (on the page).
    const out = await init({ env: {}, detect: found({ kind: "cursor", bin: "/bin/cursor-agent", signedIn: false }), home, cwd: dir, install: false });
    expect(out).toContain("Pilot will run Cursor for this project.");
    expect(out).toContain("They sign in to Cursor once, when Pilot asks");
    expect(out).toContain("`cursor-agent login`");
    const nothing = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(nothing).toContain("**Ask the user which coding agent Pilot should run**");
    expect(nothing).toContain("`claude auth login`");
  });

  it("marks Pilot as set up for the project on this computer, in the home folder's settings: its dev server starts it (a teammate's doesn't)", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const settings = configFile({}, "darwin", home);
    expect(isSetUp(dir, settings)).toBe(false);
    await init({ detect: none, env: {}, home, cwd: dir, install: false, platform: "darwin" });
    expect(isSetUp(dir, settings)).toBe(true);
    // An agent saved for it (npx usepilot, init --agent) counts too: set up before this marker existed.
    expect(isSetUp(join(dir, "other"), settings)).toBe(false);
  });

  it("the install commands are the platform's: PowerShell's on Windows, where curl | bash doesn't run", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const mac = await init({ detect: none, env: {}, agent: "claude", home, cwd: dir, install: false, platform: "darwin", configFile: join(home, "a.json") });
    expect(mac).toContain("`curl -fsSL https://claude.ai/install.sh | bash`");
    const win = await init({ detect: none, env: {}, agent: "claude", home, cwd: dir, install: false, platform: "win32", configFile: join(home, "b.json") });
    expect(win).toContain("`irm https://claude.ai/install.ps1 | iex` in PowerShell");
    expect(win).not.toContain("install.sh");
    // Codex installs with npm everywhere.
    const codex = await init({ detect: none, env: {}, agent: "codex", home, cwd: dir, install: false, platform: "win32", configFile: join(home, "c.json") });
    expect(codex).toContain("`npm install -g @openai/codex`");
  });

  it("every loader names the project (its package.json name), so npx usepilot runs for its own pages only", async () => {
    await files({ "package.json": { name: "shop", devDependencies: { vite: "^7" } }, "index.html": '<script type="module" src="/src/main.ts"></script>', "src/main.ts": "" });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain('if (import.meta.env.DEV) import("usepilot").then((p) => p.mountPilot({ project: "shop" }));');
    expect(out).not.toContain("usepilot/auto");
    // A site without a bundler: a module calling mountPilot from Pilot's file.
    await files({ "package.json": { name: "site", devDependencies: { gulp: "^4" } } });
    const php = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(php).toContain('import { mountPilot } from "/node_modules/usepilot/dist/pilot.js"; mountPilot({ project: "site" });');
  });

  it("a loader from before (no project name) gets the step that names it", async () => {
    await files({
      "package.json": { name: "shop", devDependencies: { vite: "^7", usepilot: "^0.14.0" } },
      "src/main.ts": 'if (import.meta.env.DEV) import("usepilot/auto");\n',
    });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain("**Name this project in Pilot's loader** (`src/main.ts`)");
    expect(out).toContain('`import("usepilot").then((p) => p.mountPilot({ project: "shop" }))`');
    expect(out).not.toContain("The app already loads Pilot");
  });

  it("saves the agent whose chat runs it (its environment), so npx usepilot doesn't ask", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const configFile = join(home, "projects.json");
    const both = found({ kind: "claude", bin: "c", signedIn: true }, { kind: "cursor", bin: "x", signedIn: true });
    const out = await init({ detect: both, env: { CURSOR_TRACE_ID: "1" }, configFile, home, cwd: dir, install: false });
    expect(out).toContain("Pilot will run Cursor for this project");
    expect(savedAgent(dir, configFile)).toBe("cursor");
    // Run in Cursor's editor without its command-line tool: the agent installs it (asking first), and it's saved already,
    // so Pilot waits for that one.
    const other = join(home, "o.json");
    const missing = await init({ detect: found({ kind: "claude", bin: "c", signedIn: true }), env: { CURSOR_TRACE_ID: "1" }, configFile: other, home, cwd: dir, install: false });
    expect(missing).toContain("**Install Cursor's command-line tool**");
    expect(missing).toContain("Ask the user first");
    expect(savedAgent(dir, other)).toBe("cursor");
  });

  it("--agent: saves the agent for the project, ready or not", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } } });
    const configFile = join(home, "projects.json");
    const out = await init({ env: {}, detect: found({ kind: "codex", bin: "x", signedIn: true }), agent: "codex", configFile, home, cwd: dir, install: false });
    expect(out).toContain("Pilot will run Codex for this project");
    expect(savedAgent(dir, configFile)).toBe("codex");
    const other = join(home, "other.json");
    const missing = await init({ detect: none, env: {}, agent: "claude-code", configFile: other, home, cwd: dir, install: false });
    expect(missing).toContain("**Install Claude Code's command-line tool**");
    expect(savedAgent(dir, other)).toBe("claude");
  });

  it("starts Pilot with the dev server: Vite's plugin, Next.js's withPilot, else the dev script through usepilot dev", async () => {
    // Vite (and the frameworks on it): the plugin, in its config.
    await files({ "package.json": { devDependencies: { vite: "^7" } }, "vite.config.ts": "export default {}", "src/main.ts": "" });
    const vite = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(vite).toContain("**Start Pilot with the app's dev server**");
    expect(vite).toContain("in `vite.config.ts`, add Pilot's Vite plugin");
    expect(vite).toContain('import { pilot } from "usepilot/vite";');
    expect(vite).toContain("restart it (if it's running)");
    expect(vite).not.toContain("run `npx usepilot`");
    // Already there: said done, nothing to do.
    await files({ "vite.config.ts": 'import { pilot } from "usepilot/vite";\nexport default { plugins: [pilot()] }' });
    const again = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(again).toContain("Pilot starts with the dev server (`usepilot/vite` in `vite.config.ts`).");
    expect(again).not.toContain("**Start Pilot with the app's dev server**");
    // The plugin's import isn't Pilot's loader: the page's loader is still looked for (and its step given).
    expect(again).not.toContain("loader** (`vite.config.ts`)");
    expect(again).toContain("**Load Pilot in the app, in development only**");
    // Astro: under its config's `vite.plugins`.
    await files({ "package.json": { devDependencies: { astro: "^5" } }, "astro.config.mjs": "export default {}" });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain("in `astro.config.mjs`, add Pilot's Vite plugin to its `vite.plugins`");
  });

  it("Next.js: wraps its config in withPilot, which starts Pilot in next dev only", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/layout.tsx": "", "next.config.ts": "export default {}" });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain("in `next.config.ts`, wrap the exported config with `withPilot`");
    expect(out).toContain("export default withPilot(nextConfig);");
    expect(out).toContain("Pilot starts only in `next dev`");
  });

  it("other dev servers: the dev script through usepilot dev; never a script that may serve production", async () => {
    await files({ "package.json": { dependencies: { "@angular/core": "^20" }, scripts: { start: "ng serve", build: "ng build" } }, "src/main.ts": "" });
    const angular = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(angular).toContain('`"start": "usepilot dev -- ng serve"`');
    // Several commands: in quotes, whole (usepilot dev runs it through a shell).
    await files({ "package.json": { devDependencies: { webpack: "^5" }, scripts: { dev: "tsc -w & webpack serve" } } });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain('`"dev": "usepilot dev -- \\"tsc -w & webpack serve\\""`');
    // A start script that runs a server, not a dev server: left alone, and the user runs npx usepilot.
    await files({ "package.json": { devDependencies: { webpack: "^5" }, scripts: { start: "node server.js" } } });
    const server = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(server).not.toContain("usepilot dev");
    expect(server).toContain(`run \`npx usepilot\` in ${dir}`);
    // Already through usepilot dev.
    await files({ "package.json": { devDependencies: { webpack: "^5" }, scripts: { dev: "usepilot dev -- webpack serve" } } });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain("Pilot starts with the dev server (`dev` runs through `usepilot dev`).");
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
    const out = await init({ detect: none, env: {}, home, cwd: dir, run, install: false });
    expect(await json(".mcp.json")).toEqual({ mcpServers: { other: { command: "x" } } });
    expect(await json2(home, ".cursor/mcp.json")).toEqual({ mcpServers: {} });
    expect(existsSync(join(dir, ".claude/skills/pilot"))).toBe(false);
    expect(existsSync(join(dir, ".agents/skills/pilot"))).toBe(true);
    expect(calls).toContain("claude mcp remove --scope user pilot");
    expect(out).toContain("Removed Pilot's old chat setup");
  });

  it("a site with no bundler (PHP): one tag in the shared layout, printed only when Pilot's file is there and the project says it's local, never from the request", async () => {
    await files({ ".git/HEAD": "ref: refs/heads/main", "package.json": { devDependencies: { gulp: "^4" } }, "composer.json": "{}" });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false, agent: "cursor" });
    expect(out).toContain("It must never be output on a server, whatever a request says.");
    expect(out).toContain("is_file(__DIR__ . '/node_modules/usepilot/dist/pilot-auto.js') && getenv('APP_ENV') === 'local'");
    expect(out).toContain("Never decide from the request (the Host header, the client's IP)");
    expect(out).toContain("Pilot works on every page");
  });

  it("run again: it changes nothing, and an app that loads Pilot already gets no loading step", async () => {
    await files({
      "package.json": { name: "app", devDependencies: { vite: "^7", usepilot: "^0.5.0" } },
      "src/main.ts": 'if (import.meta.env.DEV) import("usepilot").then((p) => p.mountPilot({ project: "app" }));\n',
    });
    const first = recorder();
    await init({ detect: none, env: {}, home, cwd: dir, run: first.run });
    const second = recorder();
    const out = await init({ detect: none, env: {}, home, cwd: dir, run: second.run });
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
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain("whose pages load no module of their own");
    expect(out).toContain("don't edit the HTML");
    expect(out).toContain("its Vite config (create `vite.config.js` if there's none)");
    expect(out).toContain('apply: "serve"');
    expect(out).toContain('order: "pre"');
    expect(out).not.toContain("src/main.ts");
  });

  it("a Vite config that injects Pilot counts as loading it", async () => {
    await files({
      "package.json": { name: "app", devDependencies: { vite: "^7", usepilot: "^0.6.0" } },
      "index.html": '<script src="/main.js"></script>',
      "vite.config.js": 'export default { plugins: [{ name: "pilot", apply: "serve", transformIndexHtml: () => [{ children: \'import("usepilot").then((p) => p.mountPilot({ project: "app" }));\' }] }] };',
    });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain("The app already loads Pilot (`vite.config.js`).");
  });

  it("a module script with its attributes in any order is the entry", async () => {
    await files({
      "package.json": { devDependencies: { vite: "^7" } },
      "index.html": '<script src="/src/app.ts?v=1" defer type="module"></script>',
      "src/app.ts": "",
    });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain("in its entry module, `src/app.ts`");
  });

  it("names no file it didn't find: Next.js with no layout gets what to look for", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/page.tsx": "" });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain("render it in the root layout, inside");
    expect(out).not.toContain("`app/layout.tsx`");
  });

  it("when the install fails, it's left to the agent, with the command", async () => {
    await files({ "package.json": { devDependencies: { vite: "^7" } }, "yarn.lock": "" });
    const out = await init({ detect: none, env: {}, home, cwd: dir, run: recorder(false).run });
    expect(out).toContain("Install Pilot as a dev dependency: run `yarn add -D usepilot`");
  });

  it("Next.js: a client component in the App Router's layout, or the Pages Router's _app", async () => {
    await files({ "package.json": { dependencies: { next: "^16" } }, "app/layout.tsx": "" });
    const app = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(app).toContain("It's Next.js (App Router)");
    expect(app).toContain("render it in `app/layout.tsx`, inside");
    expect(app).toContain('"use client";');

    const pages = await mkdtemp(join(tmpdir(), "pilot-init-"));
    await files({ "package.json": { dependencies: { next: "^14" } }, "pages/_app.tsx": "" }, pages);
    expect(await init({ detect: none, env: {}, home, cwd: pages, install: false })).toContain("It's Next.js (Pages Router): in `pages/_app.tsx`");
    await rm(pages, { recursive: true, force: true });
  });

  it("finds a loader in its own file (a Next.js component), not only in the entry", async () => {
    await files({
      "package.json": { name: "app", dependencies: { next: "^16", usepilot: "^0.5.0" } },
      "app/layout.tsx": 'import { Pilot } from "../components/pilot";',
      "components/pilot.tsx": 'useEffect(() => { import("usepilot").then((p) => p.mountPilot({ project: "app" })); }, []);',
    });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain("The app already loads Pilot (`components/pilot.tsx`).");
  });

  it("a monorepo's root: points at its apps instead", async () => {
    await files({
      "package.json": { workspaces: ["apps/*"] },
      "apps/web/package.json": { devDependencies: { vite: "^7" } },
      "apps/docs/package.json": { dependencies: { astro: "^5" } },
      "apps/tools/package.json": { dependencies: { lodash: "^4" } },
    });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain("monorepo's root");
    expect(out).toContain("- apps/docs");
    expect(out).toContain("- apps/web");
    expect(out).not.toContain("apps/tools");
  });

  it("no package.json: says where to run it", async () => {
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).toContain("There's no package.json");
  });

  it("frameworks and package managers", async () => {
    await files({ "bun.lock": "" });
    expect(packageManager(dir, dir)).toBe("bun");
    expect(detectFramework(dir, { nuxt: "4" }).kind).toBe("nuxt");
    expect(detectFramework(dir, { "@sveltejs/kit": "2" }).kind).toBe("sveltekit");
    expect(detectFramework(dir, { "@react-router/dev": "7", vite: "7" }).kind).toBe("react-router");
    expect(detectFramework(dir, { "react-scripts": "5" }).kind).toBe("webpack");
    expect(detectFramework(dir, { express: "5" }).kind).toBe("unknown");
    // Tools built on webpack or its API, which don't list webpack.
    expect(detectFramework(dir, { "@vue/cli-service": "5" }).kind).toBe("webpack");
    expect(detectFramework(dir, { "@rspack/cli": "1", "@rspack/core": "1" }).kind).toBe("webpack");
    expect(detectFramework(dir, { "@rsbuild/core": "1" }).kind).toBe("rsbuild");
    expect(detectFramework(dir, { parcel: "2" }).kind).toBe("parcel");
    // Gatsby before webpack, Angular before Vite (its builder uses Vite and esbuild).
    expect(detectFramework(dir, { gatsby: "5", webpack: "5" }).kind).toBe("gatsby");
    expect(detectFramework(dir, { "@angular/core": "22", vite: "7" }).kind).toBe("angular");
  });

  it("Angular: ngDevMode, not isDevMode() (a production build would keep Pilot's files)", async () => {
    await files({ "package.json": { name: "shop", dependencies: { "@angular/core": "^22" } }, "src/main.ts": "" });
    const out = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(out).toContain("It's Angular: in `src/main.ts`");
    expect(out).toContain('if (typeof ngDevMode === "undefined" || ngDevMode) import("usepilot").then((p) => p.mountPilot({ project: "shop" }))');
    expect(out).toContain("not `isDevMode()`");
  });

  it("Gatsby: onClientEntry in gatsby-browser, and a loader there counts as loading Pilot", async () => {
    await files({ "package.json": { name: "blog", dependencies: { gatsby: "^5" } } });
    const fresh = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(fresh).toContain("It's Gatsby: in `gatsby-browser.js` at the app's root (create it if there's none)");
    expect(fresh).toContain('if (process.env.NODE_ENV === "development") import("usepilot").then((p) => p.mountPilot({ project: "blog" }));');
    await files({ "gatsby-browser.js": 'export const onClientEntry = () => { if (process.env.NODE_ENV === "development") import("usepilot").then((p) => p.mountPilot({ project: "blog" })); };' });
    expect(await init({ detect: none, env: {}, home, cwd: dir, install: false })).not.toContain("It's Gatsby");
  });

  it("Parcel: the script its page loads; Rsbuild: its entry, with import.meta.env.DEV", async () => {
    await files({
      "package.json": { name: "site", source: "src/index.html", devDependencies: { parcel: "^2" } },
      "src/index.html": '<html><body><script src="./app.js"></script></body></html>',
      "src/app.js": "",
    });
    const parcel = await init({ detect: none, env: {}, home, cwd: dir, install: false });
    expect(parcel).toContain("It's Parcel: in the script its HTML page loads, `src/app.js`");
    expect(parcel).toContain('if (process.env.NODE_ENV === "development") import("usepilot")');

    const rsbuild = await mkdtemp(join(tmpdir(), "pilot-init-"));
    await files({ "package.json": { name: "app", devDependencies: { "@rsbuild/core": "^1" } }, "src/index.tsx": "" }, rsbuild);
    const out = await init({ detect: none, env: {}, home, cwd: rsbuild, install: false });
    expect(out).toContain("It's Rsbuild: in its entry module, `src/index.tsx`");
    expect(out).toContain('if (import.meta.env.DEV) import("usepilot")');
    await rm(rsbuild, { recursive: true, force: true });
  });
});
