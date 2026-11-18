import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { MCP_SERVER, writeSkill } from "./setup.ts";
import { olderThan, VERSION } from "./version.ts";

/**
 * `usepilot init`: sets Pilot up in a project, for whatever agent runs it.
 * The user pastes one prompt into their agent ("run `npx usepilot@latest
 * init` and follow what it prints"); this does the mechanical part and
 * prints the rest for the agent:
 * - installs `usepilot` as a dev dependency, with the project's package manager;
 * - connects the agent that runs it (`--agent`, or told from its shell),
 *   once per machine by default: Pilot's MCP server and the `pilot` skill
 *   in the agent's own config (see MACHINE), nothing in the repo; with
 *   `--project`, in the repo for a team to commit (see AGENTS). Any agent
 *   also launches Pilot when asked, from the MCP server's own instructions;
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
  /** The agent running it (`--agent`): only its files are written, plus those of agents the project already uses. */
  agent?: AgentId;
  /** The environment, to tell the agent when `agent` isn't given. Injected by tests. */
  env?: Record<string, string | undefined>;
  /**
   * Where the agent is connected: `machine` (default), its own user config,
   * once for every project, nothing in the repo; `project` (`--project`),
   * files in the repo to commit, for a team (some agents then ask each
   * person to switch the project's server on).
   */
  scope?: "machine" | "project";
  /** The user's home folder, by default the real one. Injected by tests. */
  home?: string;
  /** The OS, for where VS Code keeps its user config. Injected by tests. */
  platform?: NodeJS.Platform;
}

export type AgentId = "claude-code" | "cursor" | "codex" | "vscode" | "other";
export const AGENT_IDS: readonly AgentId[] = ["claude-code", "cursor", "codex", "vscode", "other"];

/**
 * What each agent needs in a project, and nothing more, so a project gets
 * one agent's files, not every agent's: where it reads MCP servers (none
 * for Codex, whose config is per user: it's told the command), where it
 * reads skills, how a skill is run, and the paths that show a project
 * already uses it (a teammate's agent keeps its files on a new run).
 */
interface AgentSetup {
  id: AgentId;
  name: string;
  mcp?: { file: string; key: string; entry: object };
  /** How it registers the server itself, when it reads no project file for it. */
  register?: string;
  /** What the user has to do before a new chat has Pilot, if anything (a client that keeps new project servers off). */
  enable?: string;
  skills: string;
  invoke: string;
  signals: string[];
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
};

const COMMAND = `${MCP_SERVER.command} ${MCP_SERVER.args.join(" ")}`;

const AGENTS: AgentSetup[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    mcp: { file: ".mcp.json", key: "mcpServers", entry: MCP_SERVER },
    skills: join(".claude", "skills"),
    invoke: "`/pilot`",
    signals: [".mcp.json", ".claude"],
  },
  {
    id: "cursor",
    name: "Cursor",
    mcp: { file: join(".cursor", "mcp.json"), key: "mcpServers", entry: MCP_SERVER },
    skills: join(".cursor", "skills"),
    invoke: "`/pilot`",
    signals: [".cursor"],
    // Cursor sees a project's new MCP server but leaves it off: it never starts until the user turns it on.
    enable:
      "**turn Pilot on first**: Cursor keeps a project's new MCP servers off. In Cursor Settings, in the MCP section, switch on `pilot` (once per project)",
  },
  {
    id: "vscode",
    name: "VS Code",
    mcp: { file: join(".vscode", "mcp.json"), key: "servers", entry: { type: "stdio", ...MCP_SERVER } },
    skills: join(".github", "skills"),
    invoke: "`/pilot`",
    signals: [join(".vscode", "mcp.json"), join(".github", "skills"), join(".github", "copilot-instructions.md")],
  },
  {
    id: "codex",
    name: "Codex",
    register: `\`codex mcp add pilot -- ${COMMAND}\``,
    skills: join(".agents", "skills"),
    invoke: "`$pilot`",
    signals: [".codex"],
  },
  {
    id: "other",
    name: "your agent",
    register: `in your MCP settings: a server named \`pilot\`, running \`${COMMAND}\``,
    // The open skills folder, read by many agents.
    skills: join(".agents", "skills"),
    invoke: "the `pilot` skill",
    signals: [],
  },
];

/**
 * Where each agent keeps its own config, for every project on the machine:
 * Pilot's MCP server (a JSON file Pilot merges into, or the agent's own CLI
 * command, when it manages the file itself) and its user skills folder.
 */
interface MachineSetup {
  mcp?: { file: (home: string, platform: NodeJS.Platform) => string; key: string; entry: object };
  command?: { cmd: string; args: string[]; has: (home: string) => boolean };
  skills: (home: string) => string;
}

/** The MCP server's command line, as an argv. */
const MCP_SERVER_ARGV = [MCP_SERVER.command, ...MCP_SERVER.args];

const MACHINE: Record<AgentId, MachineSetup> = {
  "claude-code": {
    command: {
      cmd: "claude",
      args: ["mcp", "add", "--scope", "user", "pilot", "--", ...MCP_SERVER_ARGV],
      has: (home) => !!readJson<{ mcpServers?: Record<string, unknown> }>(join(home, ".claude.json"))?.mcpServers?.pilot,
    },
    skills: (home) => join(home, ".claude", "skills"),
  },
  cursor: {
    mcp: { file: (home) => join(home, ".cursor", "mcp.json"), key: "mcpServers", entry: MCP_SERVER },
    skills: (home) => join(home, ".cursor", "skills"),
  },
  vscode: {
    mcp: {
      file: (home, platform) => join(vscodeUserDir(home, platform), "mcp.json"),
      key: "servers",
      entry: { type: "stdio", ...MCP_SERVER },
    },
    skills: (home) => join(home, ".copilot", "skills"),
  },
  codex: {
    command: {
      cmd: "codex",
      args: ["mcp", "add", "pilot", "--", ...MCP_SERVER_ARGV],
      has: (home) => /\[mcp_servers\.pilot\]/.test(readText(join(home, ".codex", "config.toml"))),
    },
    skills: (home) => join(home, ".agents", "skills"),
  },
  other: { skills: (home) => join(home, ".agents", "skills") },
};

/**
 * Every folder Pilot's skill can be in, where `init` puts it: each agent's
 * own, once per machine, and each agent's in the repo (`--project`).
 */
export function skillFolders(root: string, home: string): string[] {
  const machine = AGENT_IDS.map((id) => join(MACHINE[id].skills(home), "pilot"));
  const project = AGENTS.map((a) => join(root, a.skills, "pilot"));
  return [...new Set([...machine, ...project])];
}

/** The command that adds `spec` as a dev dependency with `pm`. */
export function installArgs(pm: "npm" | "pnpm" | "yarn" | "bun", spec = "usepilot"): string[] {
  return pm === "npm" ? ["install", "-D", spec] : pm === "bun" ? ["add", "-d", spec] : ["add", "-D", spec];
}

/** The version of `usepilot` installed for the app in `cwd` (its node_modules, or a monorepo's up to `root`), when there's one. */
export function installedVersion(cwd: string, root: string): string | null {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const version = readJson<{ version?: string }>(join(dir, "node_modules", "usepilot", "package.json"))?.version;
    if (version) return version;
    if (dir === root || dirname(dir) === dir) return null;
  }
}

/** VS Code's user settings folder, per OS. */
function vscodeUserDir(home: string, platform: NodeJS.Platform): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Code", "User");
  if (platform === "win32") return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User");
  return join(home, ".config", "Code", "User");
}

/** A path for the user to read: the home folder as `~`. */
function tilde(path: string, home: string): string {
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/** The agent running init, from what it sets in its shell; null when it can't be told (it's then asked to say). */
export function detectAgent(env: Record<string, string | undefined>): AgentId | null {
  if (env.CLAUDECODE) return "claude-code";
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID) return "cursor";
  if (env.CODEX_SANDBOX || env.CODEX_SANDBOX_NETWORK_DISABLED || env.CODEX_MANAGED_BY_NPM) return "codex";
  return null;
}

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
  const args = installArgs(pm);
  const install = `${pm} ${args.join(" ")}`;
  const installed = deps.usepilot ? installedVersion(cwd, root) : null;
  // Already there: init leaves its version alone (updating is `update`'s job), and says when it's older.
  if (deps.usepilot && installed && olderThan(installed, VERSION))
    todo.push(
      `**Tell the user** Pilot ${installed} is installed here, and ${VERSION} is out: \`npx usepilot@latest update\` updates it (run it now if they ask).`,
    );
  if (deps.usepilot) done.push("`usepilot` was already a dependency.");
  else if (options.install !== false && run(pm, args, cwd))
    done.push(`Installed \`usepilot\` as a dev dependency (\`${install}\`).`);
  else todo.push(`Install Pilot as a dev dependency: run \`${install}\` in ${cwd}.`);

  // 2. The agent: its MCP server and the `pilot` skill. By default in the
  // agent's own config, once per machine (nothing in the repo, nothing to
  // switch on per project); with `project`, files in the repo for a team.
  const named = options.agent ?? detectAgent(options.env ?? process.env);
  const project = options.scope === "project";
  const home = options.home ?? homedir();
  const written: string[] = [];
  if (named && !project) {
    const agent = AGENTS.find((a) => a.id === named) as AgentSetup;
    const machine = MACHINE[named];
    const parts: string[] = [];
    if (machine.mcp) {
      const file = machine.mcp.file(home, options.platform ?? process.platform);
      if ((await addServer(file, machine.mcp.key, machine.mcp.entry)) === "invalid") {
        todo.push(
          `\`${tilde(file, home)}\` isn't valid JSON, so Pilot wasn't added to it: fix it, and add the \`pilot\` server (\`${COMMAND}\`).`,
        );
      } else parts.push(`its MCP server (\`${tilde(file, home)}\`)`);
    } else if (machine.command) {
      const display = `${machine.command.cmd} ${machine.command.args.join(" ")}`;
      if (machine.command.has(home)) parts.push("its MCP server (registered already)");
      else if (run(machine.command.cmd, machine.command.args, cwd)) parts.push(`its MCP server (\`${display}\`)`);
      else todo.push(`**Register Pilot's MCP server with yourself**: run \`${display}\`.`);
    } else if (agent.register) {
      todo.push(`**Register Pilot's MCP server with yourself**, for every project: ${agent.register}.`);
    }
    const skill = join(machine.skills(home), "pilot");
    await writeSkill(skill);
    parts.push(`the \`pilot\` skill (\`${tilde(skill, home)}/\`)`);
    done.push(`Connected ${agent.name} to Pilot, once for every project on this machine: ${list(parts)}. Nothing was added to the repo.`);
  } else if (named) {
    // In the repo, for the agent running init and those the project already uses.
    const present = AGENTS.filter((a) => a.id !== named && a.signals.some((p) => existsSync(join(root, p))));
    for (const agent of [...AGENTS.filter((a) => a.id === named), ...present]) {
      const parts: string[] = [];
      if (agent.mcp) {
        const file = join(root, agent.mcp.file);
        if ((await addServer(file, agent.mcp.key, agent.mcp.entry)) === "invalid") {
          todo.push(
            `\`${agent.mcp.file}\` isn't valid JSON, so Pilot wasn't added to it: fix it, and add the \`pilot\` server (\`${COMMAND}\`).`,
          );
        } else {
          parts.push(`its MCP server (\`${agent.mcp.file}\`)`);
          written.push(`\`${agent.mcp.file}\``);
        }
      }
      const skill = join(agent.skills, "pilot");
      await writeSkill(join(root, skill));
      parts.push(`the \`pilot\` skill (\`${skill}/\`)`);
      if (!written.includes(`\`${skill}/\``)) written.push(`\`${skill}/\``);
      done.push(`Set Pilot up for ${agent.name} in this project: ${list(parts)}.`);
      if (agent.register && agent.id === named) todo.push(`**Register Pilot's MCP server with yourself**: ${agent.register}.`);
    }
  } else {
    todo.push(
      `**Connect yourself:** run \`npx usepilot@latest init --agent <you>\` in ${cwd}, with \`<you>\` the agent you are: ${AGENT_IDS.map((a) => `\`${a}\``).join(", ")}.`,
    );
  }

  // 3. Loading Pilot in the app: written by the agent.
  if (framework.loads) done.push(`The app already loads Pilot (\`${relative(cwd, framework.loads)}\`).`);
  else todo.push(loadStep(framework, cwd));

  const me = AGENTS.find((a) => a.id === named);
  // Only a server in the repo waits to be switched on (Cursor); one in the agent's own config doesn't.
  const enable = project && me?.enable ? `Before that, ${me.enable}. ` : "";
  todo.push(
    `**Tell the user**, in a few lines: Pilot is set up, and works from a **new chat**, not this one: agents load MCP servers when a chat starts (some ask once to approve the project's server). ${enable}In the new chat, ask to launch Pilot${
      me && me.id !== "other" ? `, or run ${me.invoke}` : ""
    }.${
      written.length
        ? ` The files it added (${list(written)}) can be committed, so everyone on the project using the same agent gets it.`
        : project
          ? ""
          : " It's connected for every project on this machine; a teammate pastes the same install prompt in their own agent."
    } Without an agent, Option+P (Alt+P) in the app opens Pilot, and Copy prompt hands the changes over.`,
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
  kind: "next-app" | "next-pages" | "nuxt" | "sveltekit" | "astro" | "react-router" | "vite" | "vite-html" | "webpack" | "unknown";
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
  if (has("vite") || Object.keys(deps).some((d) => d.startsWith("@vitejs/"))) {
    const entry = viteEntry(cwd);
    if (entry) return result("vite", entry);
    // Its page loads no module (classic scripts, or none): Pilot is injected
    // from the Vite config while Vite serves, so no HTML file changes (it
    // may be deployed as it is, without Vite building it).
    if (existsSync(join(cwd, "index.html"))) {
      const config = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]
        .map((f) => join(cwd, f))
        .find((f) => existsSync(f));
      return result("vite-html", config);
    }
    return result("vite");
  }
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
    // A module script, its attributes in any order.
    for (const tag of readFileSync(html, "utf8").match(/<script\b[^>]*>/gi) ?? []) {
      if (!/type=["']module["']/i.test(tag)) continue;
      const src = /src=["']\/?([^"'?#]+)/i.exec(tag)?.[1];
      if (src && existsSync(join(cwd, src))) return join(cwd, src);
    }
    // index.html loads no module of its own: no guess at the usual names.
    return undefined;
  }
  return ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js", "src/index.tsx", "src/index.ts"]
    .map((f) => join(cwd, f))
    .find((f) => existsSync(f));
}

/** The app's source folders, where code that loads Pilot would be. */
const SOURCE_DIRS = ["src", "app", "pages", "plugins", "components", "lib"];
const SOURCE_FILE = /\.(m?[jt]sx?|vue|svelte|astro|html)$/;

/** A file of the app that already imports `usepilot` (looked for in its source folders, index.html and the Vite config), if any. */
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
  // index.html, and the Vite config (where a page with no module of its own gets Pilot).
  for (const name of ["index.html", "vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]) {
    const file = join(cwd, name);
    if (existsSync(file) && /usepilot/.test(readText(file))) return file;
  }
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
  // The file when it was found; otherwise what to look for, never a path that may not exist.
  const at = (file: string | undefined, otherwise: string) => (file ? `\`${relative(cwd, file)}\`` : otherwise);
  const code = (lang: string, text: string) => `\n\n   \`\`\`${lang}\n${text.replace(/^(?=.)/gm, "   ")}\n   \`\`\``;
  const intro = "**Load Pilot in the app, in development only** (it must never reach production), the way this project writes code.";
  switch (framework.kind) {
    case "vite":
      return `${intro} It's a Vite app: in its entry module, ${at(framework.file, 'the module its HTML page loads (`<script type="module" src=…>`)')}, add:${code("ts", 'if (import.meta.env.DEV) import("usepilot/auto");')}`;
    case "vite-html":
      return `${intro} It's a Vite app whose pages load no module of their own (classic scripts only, which Vite doesn't process), and its HTML may be deployed as it is. So don't edit the HTML: inject Pilot from ${at(framework.file, "its Vite config (create `vite.config.js` if there's none)")}, only while Vite serves. Add this plugin to its \`plugins\` (keep any that are there):${code(
        "js",
        `{
  name: "pilot",
  apply: "serve", // development only: builds never get it
  transformIndexHtml: {
    order: "pre", // before Vite's own processing, so it resolves the package
    handler: () => [{ tag: "script", attrs: { type: "module" }, children: 'import("usepilot/auto");', injectTo: "body" }],
  },
}`,
      )}\n\n   It's added to every HTML page Vite serves.`;
    case "next-app":
      return `${intro} It's Next.js (App Router): add a client component, and render it in ${at(framework.file, "the root layout")}, inside \`<body>\`:${code(
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
      return `${intro} It's Next.js (Pages Router): in ${at(framework.file, "the custom App, `pages/_app` (create it if there's none)")}, in the App component:${code(
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
      return `${intro} It's SvelteKit: in ${at(framework.file, "`src/hooks.client.ts`")} (create it if there's none), add:${code("ts", 'if (import.meta.env.DEV) import("usepilot/auto");')}`;
    case "astro":
      return `${intro} It's Astro: in the layout every page uses, add:${code("astro", '<script>\n  if (import.meta.env.DEV) import("usepilot/auto");\n</script>')}`;
    case "react-router":
      return `${intro} It's React Router (or Remix): in ${at(framework.file, "the root route module (`root.tsx` in the app folder)")}, in the root component:${code(
        "tsx",
        `useEffect(() => {
  if (import.meta.env.DEV) import("usepilot/auto");
}, []);`,
      )}`;
    case "webpack":
      return `${intro} In the app's entry file, ${at(framework.file, "the one its bundler config starts from")}, add:${code("js", 'if (process.env.NODE_ENV === "development") import("usepilot/auto");')}`;
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
