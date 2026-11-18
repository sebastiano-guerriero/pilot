import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { MCP_SERVER, writeSkill } from "./setup.ts";

/**
 * `usepilot init`: sets Pilot up in a project, for whatever agent runs it.
 * The user pastes one prompt into their agent ("run `npx usepilot@latest
 * init` and follow what it prints"); this does the mechanical part and
 * prints the rest for the agent:
 * - installs `usepilot` as a dev dependency, with the project's package manager;
 * - registers Pilot's MCP server in the project for the agents that read a
 *   project file (Claude Code, Cursor, VS Code), and adds the /pilot skill
 *   for Claude Code (other agents launch Pilot when asked, from the MCP
 *   server's own instructions);
 * - detects the framework and prints where and how to load Pilot in the
 *   app, in development only: the agent writes it, in the project's way.
 * Run again, it changes nothing that's already there.
 */

export interface InitOptions {
  /** The app's folder (where its package.json is), by default the current one. */
  cwd?: string;
  /** Install the package (default); false only prints the command. */
  install?: boolean;
  /** Runs a command in a folder; true when it succeeded. Injected by tests. */
  run?: (command: string, args: string[], cwd: string) => boolean;
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
};

/** Where an MCP client reads a project's servers, and how it wants Pilot's entry. */
const CLIENTS = [
  { name: "Claude Code", file: ".mcp.json", key: "mcpServers", entry: MCP_SERVER },
  { name: "Cursor", file: join(".cursor", "mcp.json"), key: "mcpServers", entry: MCP_SERVER },
  { name: "VS Code", file: join(".vscode", "mcp.json"), key: "servers", entry: { type: "stdio", ...MCP_SERVER } },
] as const;

const COMMAND = `${MCP_SERVER.command} ${MCP_SERVER.args.join(" ")}`;

export async function init(options: InitOptions = {}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const run = options.run ?? runCommand;
  const pkgFile = join(cwd, "package.json");
  if (!existsSync(pkgFile)) {
    return `# Pilot: not set up

There's no package.json in ${cwd}. Run \`npx usepilot@latest init\` again in the app's folder: the one with the package.json of the web app the user works on.
`;
  }
  const pkg = readJson<PackageJson>(pkgFile) ?? {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const root = projectRoot(cwd);
  const framework = detectFramework(cwd, deps);

  // A monorepo's root, not an app: point at the apps.
  if (framework.kind === "unknown" && isWorkspaceRoot(cwd, pkg)) {
    const apps = workspaceApps(cwd);
    return `# Pilot: not set up yet

${cwd} is a monorepo's root, not an app. Run \`npx usepilot@latest init\` again in the folder of the web app the user works on${
      apps.length ? `, one of:\n\n${apps.map((a) => `- ${a}`).join("\n")}` : "."
    }
`;
  }

  const done: string[] = [];
  const todo: string[] = [];

  // 1. The package.
  const pm = packageManager(cwd, root);
  const installArgs = pm === "npm" ? ["install", "-D", "usepilot"] : pm === "bun" ? ["add", "-d", "usepilot"] : ["add", "-D", "usepilot"];
  const install = `${pm} ${installArgs.join(" ")}`;
  if (deps.usepilot) done.push("`usepilot` was already a dependency.");
  else if (options.install !== false && run(pm, installArgs, cwd))
    done.push(`Installed \`usepilot\` as a dev dependency (\`${install}\`).`);
  else todo.push(`Install Pilot as a dev dependency: run \`${install}\` in ${cwd}.`);

  // 2. The MCP server, for the agents that read a project file; the skill for Claude Code.
  const registered: string[] = [];
  for (const client of CLIENTS) {
    const file = join(root, client.file);
    const result = await addServer(file, client.key, client.entry);
    if (result === "invalid")
      todo.push(
        `\`${relative(root, file)}\` isn't valid JSON, so Pilot wasn't added to it: fix it, and add the \`pilot\` server (\`${COMMAND}\`).`,
      );
    else registered.push(`${client.name} (\`${relative(root, file)}\`)`);
  }
  if (registered.length) done.push(`Registered Pilot's MCP server for ${list(registered)}.`);
  const skill = await writeSkill(join(root, ".claude", "skills", "pilot"));
  done.push(`Added the \`/pilot\` command for Claude Code (\`${relative(root, skill)}\`).`);

  // 3. Loading Pilot in the app: written by the agent.
  if (framework.loads) done.push(`The app already loads Pilot (\`${relative(cwd, framework.loads)}\`).`);
  else todo.push(loadStep(framework, cwd));

  todo.push(
    `**If you aren't Claude Code, Cursor or VS Code**, register Pilot's MCP server with yourself too, named \`pilot\`, running \`${COMMAND}\`. Codex: \`codex mcp add pilot -- ${COMMAND}\`. Others: their MCP settings.`,
    `**Tell the user**, in a few lines: Pilot is set up. To start, open a new chat (agents load MCP servers when a chat starts; some ask once to approve the project's server), then ask to launch Pilot (in Claude Code: \`/pilot\`). The new files (${list(
      [...CLIENTS.map((c) => `\`${c.file}\``), "`.claude/skills/pilot/`"],
    )}) can be committed, so everyone on the project gets it. Without an agent, Option+P (Alt+P) in the app opens Pilot, and Copy prompt hands the changes over.`,
  );

  return `# Pilot: set up

Done:
${done.map((d) => `- ${d}`).join("\n")}

Left for you (the agent), in order:
${todo.map((t, i) => `${i + 1}. ${t}`).join("\n")}
`;
}

// ── Detecting the project ────────────────────────────────────────────────

/** Where the agent works: the repository's root (the closest `.git` up), or the app's folder outside one. */
export function projectRoot(cwd: string): string {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return cwd;
  }
}

/** From the lockfile, here or up to the repository's root (a monorepo keeps one at its root). */
export function packageManager(cwd: string, root: string): "npm" | "pnpm" | "yarn" | "bun" {
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(dir, "yarn.lock"))) return "yarn";
    if (existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb"))) return "bun";
    if (existsSync(join(dir, "package-lock.json"))) return "npm";
    if (dir === root || dirname(dir) === dir) return "npm";
  }
}

export interface Framework {
  kind: "next-app" | "next-pages" | "nuxt" | "sveltekit" | "astro" | "react-router" | "vite" | "webpack" | "unknown";
  /** The file Pilot is loaded from, when one can be told (relative paths are resolved from the app's folder). */
  file?: string;
  /** The file that already loads Pilot, if any. */
  loads?: string;
}

export function detectFramework(cwd: string, deps: Record<string, string>): Framework {
  const has = (name: string) => name in deps;
  const first = (...files: string[]) => files.map((f) => join(cwd, f)).find((f) => existsSync(f));
  const loads = findLoader(cwd);
  const result = (kind: Framework["kind"], file?: string): Framework => ({ kind, file, loads });

  if (has("next")) {
    const app = first("src/app", "app");
    if (app)
      return result(
        "next-app",
        first("src/app/layout.tsx", "src/app/layout.jsx", "src/app/layout.js", "app/layout.tsx", "app/layout.jsx", "app/layout.js"),
      );
    return result(
      "next-pages",
      first("src/pages/_app.tsx", "src/pages/_app.jsx", "src/pages/_app.js", "pages/_app.tsx", "pages/_app.jsx", "pages/_app.js"),
    );
  }
  if (has("nuxt")) return result("nuxt", first("plugins/pilot.client.ts", "app/plugins/pilot.client.ts"));
  if (has("@sveltejs/kit")) return result("sveltekit", first("src/hooks.client.ts", "src/hooks.client.js"));
  if (has("astro")) return result("astro");
  if (has("@react-router/dev") || has("@remix-run/react")) return result("react-router", first("app/root.tsx", "app/root.jsx"));
  if (has("vite") || Object.keys(deps).some((d) => d.startsWith("@vitejs/"))) return result("vite", viteEntry(cwd));
  if (has("react-scripts") || has("webpack")) {
    return result(
      "webpack",
      first("src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js", "src/main.tsx", "src/main.ts", "src/main.js"),
    );
  }
  return { kind: "unknown", loads };
}

/** A Vite app's entry: the module script in its index.html, or the usual names. */
function viteEntry(cwd: string): string | undefined {
  const html = join(cwd, "index.html");
  if (existsSync(html)) {
    const src = /<script[^>]*type=["']module["'][^>]*src=["']\/?([^"']+)["']/i.exec(readFileSync(html, "utf8"))?.[1];
    if (src && existsSync(join(cwd, src))) return join(cwd, src);
  }
  return ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js", "src/index.tsx", "src/index.ts"]
    .map((f) => join(cwd, f))
    .find((f) => existsSync(f));
}

/** The app's source folders, where code that loads Pilot would be. */
const SOURCE_DIRS = ["src", "app", "pages", "plugins", "components", "lib"];
const SOURCE_FILE = /\.(m?[jt]sx?|vue|svelte|astro|html)$/;

/** A file of the app that already imports `usepilot` (looked for in its source folders and index.html), if any. */
function findLoader(cwd: string): string | undefined {
  let budget = 3000;
  const walk = (dir: string, depth: number): string | undefined => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return undefined;
    }
    for (const name of names) {
      if (budget-- <= 0 || name === "node_modules" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (SOURCE_FILE.test(name)) {
        if (/["']usepilot(\/auto)?["']/.test(readText(path))) return path;
      } else if (depth > 0 && !name.includes(".")) {
        const found = walk(path, depth - 1);
        if (found) return found;
      }
    }
    return undefined;
  };
  const html = join(cwd, "index.html");
  if (existsSync(html) && /usepilot/.test(readText(html))) return html;
  for (const dir of SOURCE_DIRS) {
    const found = walk(join(cwd, dir), 6);
    if (found) return found;
  }
  return undefined;
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function isWorkspaceRoot(cwd: string, pkg: PackageJson): boolean {
  return !!pkg.workspaces || existsSync(join(cwd, "pnpm-workspace.yaml"));
}

/** The workspace's folders that look like web apps (a framework among their dependencies). */
function workspaceApps(cwd: string): string[] {
  const found: string[] = [];
  for (const group of ["apps", "packages", "examples", "sites"]) {
    const dir = join(cwd, group);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const pkg = readJson<PackageJson>(join(dir, name, "package.json"));
      if (pkg && detectFramework(join(dir, name), { ...pkg.dependencies, ...pkg.devDependencies }).kind !== "unknown")
        found.push(join(group, name));
    }
  }
  return found;
}

// ── What the agent writes ────────────────────────────────────────────────

/** Where and how to load Pilot in this app: in the browser, in development only. */
function loadStep(framework: Framework, cwd: string): string {
  const at = (file: string | undefined, fallback: string) => `\`${file ? relative(cwd, file) : fallback}\``;
  const code = (lang: string, text: string) => `\n\n   \`\`\`${lang}\n${text.replace(/^(?=.)/gm, "   ")}\n   \`\`\``;
  const intro = "**Load Pilot in the app, in development only** (it must never reach production), the way this project writes code.";
  switch (framework.kind) {
    case "vite":
      return `${intro} It's a Vite app: in its entry, ${at(framework.file, "src/main.ts")}, add:${code("ts", 'if (import.meta.env.DEV) import("usepilot/auto");')}`;
    case "next-app":
      return `${intro} It's Next.js (App Router): add a client component, and render it in the root layout (${at(framework.file, "app/layout.tsx")}), inside \`<body>\`:${code(
        "tsx",
        `"use client";
import { useEffect } from "react";

export function Pilot() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") import("usepilot/auto");
  }, []);
  return null;
}`,
      )}`;
    case "next-pages":
      return `${intro} It's Next.js (Pages Router): in ${at(framework.file, "pages/_app.tsx")}, in the App component:${code(
        "tsx",
        `useEffect(() => {
  if (process.env.NODE_ENV === "development") import("usepilot/auto");
}, []);`,
      )}`;
    case "nuxt":
      return `${intro} It's Nuxt: add a client plugin, \`plugins/pilot.client.ts\` (\`app/plugins/\` in Nuxt 4's layout):${code(
        "ts",
        `export default defineNuxtPlugin(() => {
  if (import.meta.dev) import("usepilot/auto");
});`,
      )}`;
    case "sveltekit":
      return `${intro} It's SvelteKit: in ${at(framework.file, "src/hooks.client.ts")} (create it if there's none), add:${code("ts", 'if (import.meta.env.DEV) import("usepilot/auto");')}`;
    case "astro":
      return `${intro} It's Astro: in the layout every page uses, add:${code("astro", '<script>\n  if (import.meta.env.DEV) import("usepilot/auto");\n</script>')}`;
    case "react-router":
      return `${intro} It's React Router (or Remix): in ${at(framework.file, "app/root.tsx")}, in the root component:${code(
        "tsx",
        `useEffect(() => {
  if (import.meta.env.DEV) import("usepilot/auto");
}, []);`,
      )}`;
    case "webpack":
      return `${intro} In the app's entry, ${at(framework.file, "src/index.js")}, add:${code("js", 'if (process.env.NODE_ENV === "development") import("usepilot/auto");')}`;
    default:
      return `${intro} Import \`usepilot/auto\` from code that runs in the browser, only in development (\`import.meta.env.DEV\` with Vite, \`process.env.NODE_ENV === "development"\` with webpack). It shows the toolbar when the page loads.`;
  }
}

// ── Files ────────────────────────────────────────────────────────────────

/**
 * Adds Pilot under `key` in a client's MCP config, keeping everything else
 * in it. "invalid": the file isn't JSON, and is left as it was.
 */
async function addServer(file: string, key: string, entry: object): Promise<"added" | "updated" | "invalid"> {
  let config: Record<string, unknown> = {};
  if (existsSync(file)) {
    const text = await readFile(file, "utf8");
    try {
      config = text.trim() ? JSON.parse(text) : {};
    } catch {
      return "invalid";
    }
    if (typeof config !== "object" || config === null || Array.isArray(config)) return "invalid";
  }
  const servers = (config[key] ?? {}) as Record<string, unknown>;
  const result = "pilot" in servers ? "updated" : "added";
  config[key] = { ...servers, pilot: entry };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
  return result;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Runs a command, its output going to the terminal (the agent reads it); true when it succeeded. */
function runCommand(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" });
  return result.status === 0;
}
