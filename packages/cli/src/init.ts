import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { AGENTS as AGENT_CLIS, type AgentKind, agentFromEnv, detectAgents, type FoundAgent, isAgentKind } from "./agents.ts";
import { projectName, saveAgent } from "./config.ts";
import { removeOldSetup } from "./legacy.ts";
import { olderThan, VERSION } from "./version.ts";

/**
 * `usepilot init`: sets Pilot up in a project. The user pastes one prompt
 * into their agent ("run `npx usepilot@latest init` and follow what it
 * prints"); this does the mechanical part and prints the rest for the agent:
 * - installs `usepilot` as a dev dependency, with the project's package manager;
 * - checks the agents' command-line tools Pilot runs for each job (`npx
 *   usepilot`, run.ts): installed, signed in, and says what's missing; the
 *   agent whose chat runs it (told from its environment) is saved for the
 *   project, so `npx usepilot` doesn't ask;
 * - removes Pilot's old setup (its MCP server and `/pilot` skill, from
 *   before agent runs: legacy.ts);
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
  /** The agent Pilot should run for this project (`--agent`), else the one running init (its environment): saved when it's ready. */
  agent?: string;
  /** The environment, to tell which agent runs init. Injected by tests. */
  env?: NodeJS.ProcessEnv;
  /** The user's home folder, by default the real one. Injected by tests. */
  home?: string;
  /** The OS, for where VS Code keeps its user config (the old setup). Injected by tests. */
  platform?: NodeJS.Platform;
  /** The agents found on this machine. Injected by tests. */
  detect?: () => Promise<FoundAgent[]>;
  /** Where the agent picked is saved. Injected by tests. */
  configFile?: string;
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
};

/** `--agent`'s value as an agent Pilot runs: `claude-code` (init's old name for it) is `claude`. */
export function agentKindOf(value: string | undefined): AgentKind | undefined {
  const v = value?.toLowerCase().replace(/^claude-code$/, "claude");
  return isAgentKind(v) ? v : undefined;
}

/** Each agent Pilot runs, with how to install it and sign in, for the designer. */
export function agentsToInstall(): string {
  return Object.values(AGENT_CLIS)
    .map((cli) => `${cli.label}: \`${cli.install}\`, then \`${cli.signIn}\``)
    .join("; ");
}

/** The version of `usepilot` installed for the app in `cwd` (its node_modules, or a monorepo's up to `root`), when there's one. */
export function installedVersion(cwd: string, root: string): string | null {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const version = readJson<{ version?: string }>(join(dir, "node_modules", "usepilot", "package.json"))?.version;
    if (version) return version;
    if (dir === root || dirname(dir) === dir) return null;
  }
}

/** The command that adds `spec` as a dev dependency with `pm`. */
export function installArgs(pm: "npm" | "pnpm" | "yarn" | "bun", spec = "usepilot"): string[] {
  return pm === "npm" ? ["install", "-D", spec] : pm === "bun" ? ["add", "-d", spec] : ["add", "-D", spec];
}

/**
 * The agents' state, for the designer: which one Pilot will run, or what
 * to install or sign in to. `done` and `todo` lines, as init prints them.
 */
export function agentLines(found: FoundAgent[], wanted: AgentKind | undefined): { done: string[]; todo: string[] } {
  const ready = found.filter((a) => a.signedIn);
  const label = (kind: AgentKind) => AGENT_CLIS[kind].label;
  if (wanted) {
    const it = found.find((a) => a.kind === wanted);
    const cli = AGENT_CLIS[wanted];
    if (it?.signedIn) return { done: [`Pilot will run ${cli.label} for this project (signed in).`], todo: [] };
    return {
      done: [],
      todo: [
        it
          ? `**Tell the user** to sign in to ${cli.label}'s command-line tool: \`${cli.signIn}\` in a terminal.`
          : `**Tell the user** to install ${cli.label}'s command-line tool and sign in: \`${cli.install}\`, then \`${cli.signIn}\`.`,
      ],
    };
  }
  if (ready.length === 1) return { done: [`Pilot will run ${label((ready[0] as FoundAgent).kind)}, signed in here, for each job.`], todo: [] };
  if (ready.length > 1)
    return { done: [`Found ${ready.map((a) => label(a.kind)).join(" and ")} signed in: \`npx usepilot\` asks which to run, the first time.`], todo: [] };
  const installed = found.map((a) => `${label(a.kind)} (\`${AGENT_CLIS[a.kind].signIn}\`)`);
  return {
    done: [],
    todo: [
      installed.length
        ? `**Tell the user** Pilot runs their coding agent's command-line tool for each job, and it isn't signed in: sign in to ${installed.join(" or ")} in a terminal.`
        : `**Tell the user** Pilot runs their coding agent's command-line tool for each job, and none is installed here. One of: ${agentsToInstall()}.`,
    ],
  };
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

  // 2. The agent Pilot runs for each job: its command-line tool, installed and signed in.
  // The agent: given, else the one whose chat runs this (the setup prompt), so `npx usepilot` needn't ask.
  const wanted = agentKindOf(options.agent) ?? agentFromEnv(options.env ?? process.env) ?? undefined;
  const found = await (options.detect ?? detectAgents)();
  const agents = agentLines(found, wanted);
  done.push(...agents.done);
  todo.push(...agents.todo);
  if (wanted && found.some((a) => a.kind === wanted && a.signedIn)) saveAgent(cwd, wanted, options.configFile);

  // 3. Pilot's old setup (an agent's chat running it): removed, so no chat starts an old Pilot.
  const home = options.home ?? homedir();
  const removed = await removeOldSetup(root, home, options.platform ?? process.platform, run);
  if (removed.length) done.push(`Removed Pilot's old chat setup (its MCP server and \`/pilot\` skill): ${removed.map((r) => `\`${r}\``).join(", ")}. Pilot runs the agent itself now.`);

  // 4. Loading Pilot in the app: written by the agent.
  if (framework.loads) {
    const naming = namingStep(framework.loads, cwd);
    if (naming) todo.push(naming);
    else done.push(`The app already loads Pilot (\`${relative(cwd, framework.loads)}\`).`);
  } else todo.push(loadStep(framework, cwd));

  todo.push(
    `**Tell the user**, in a few lines: Pilot is set up. To use it, run \`npx usepilot\` in ${cwd}, in a terminal beside the app's dev server, and open the app: Pilot opens on every page. They design and press Send (or comment on an element), Pilot runs their agent for each job, and the terminal shows what it does. No chat needs to stay open; without \`npx usepilot\` running, the toolbar says so.`,
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
  kind:
    | "next-app"
    | "next-pages"
    | "nuxt"
    | "sveltekit"
    | "astro"
    | "react-router"
    | "angular"
    | "gatsby"
    | "vite"
    | "vite-html"
    | "rsbuild"
    | "parcel"
    | "webpack"
    | "unknown";
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
  // Before Vite: Angular's builder runs on Vite and esbuild, without listing them.
  if (has("@angular/core")) return result("angular", first("src/main.ts"));
  // Before webpack: Gatsby builds with it without listing it.
  if (has("gatsby")) return result("gatsby", first(...GATSBY_BROWSER));
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
  if (has("@rsbuild/core")) return result("rsbuild", first(...JS_ENTRIES));
  if (has("parcel")) return result("parcel", parcelEntry(cwd));
  // Webpack, and the tools built on it or on its API (Create React App, Vue CLI, Rspack): `process.env.NODE_ENV` is replaced at build time.
  if (has("react-scripts") || has("webpack") || has("@vue/cli-service") || has("@rspack/core") || has("@rspack/cli")) {
    return result(
      "webpack",
      first("src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js", "src/main.tsx", "src/main.ts", "src/main.js"),
    );
  }
  return { kind: "unknown", loads };
}

/** Gatsby's browser hooks file, at the app's root: where code that runs in the browser goes. */
const GATSBY_BROWSER = ["gatsby-browser.tsx", "gatsby-browser.ts", "gatsby-browser.jsx", "gatsby-browser.js"];
/** The usual names of an app's entry module. */
const JS_ENTRIES = ["src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js", "src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js"];

/**
 * A Parcel app's entry: the script its HTML page loads (the page is the
 * package.json's `source`, or `index.html`), else the usual names. Parcel
 * bundles classic scripts too, so any `<script src>` counts.
 */
function parcelEntry(cwd: string): string | undefined {
  const source = readJson<{ source?: unknown }>(join(cwd, "package.json"))?.source;
  const page = [...(typeof source === "string" ? [source] : Array.isArray(source) ? source.filter((s): s is string => typeof s === "string") : []), "index.html", "src/index.html"]
    .map((f) => join(cwd, f))
    .find((f) => f.endsWith(".html") && existsSync(f));
  if (page) {
    for (const tag of readFileSync(page, "utf8").match(/<script\b[^>]*>/gi) ?? []) {
      const src = /src=["']([^"'?#]+)/i.exec(tag)?.[1];
      const file = src && !/^[a-z]+:|^\/\//i.test(src) ? join(src.startsWith("/") ? cwd : dirname(page), src) : undefined;
      if (file && existsSync(file)) return file;
    }
  }
  if (typeof source === "string" && /\.[mc]?[jt]sx?$/.test(source) && existsSync(join(cwd, source))) return join(cwd, source);
  return JS_ENTRIES.map((f) => join(cwd, f)).find((f) => existsSync(f));
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
  // index.html, the Vite config (where a page with no module of its own gets Pilot), and Gatsby's browser hooks.
  for (const name of ["index.html", "vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", ...GATSBY_BROWSER]) {
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
function baseLoadStep(framework: Framework, cwd: string): string {
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
    case "angular":
      // Not isDevMode(): it's decided in the browser, so a production build still carries Pilot's files (checked with
      // Angular 22). Angular's build sets ngDevMode to false for production, and the bundler drops the import.
      return `${intro} It's Angular: in ${at(framework.file, "the file that bootstraps the app (`src/main.ts`)")}, after the bootstrap, add:${code("ts", 'if (typeof ngDevMode === "undefined" || ngDevMode) import("usepilot/auto");')}\n\n   Use \`ngDevMode\`, not \`isDevMode()\`: Angular's production build sets \`ngDevMode\` to false and drops Pilot from the bundle, while \`isDevMode()\` is decided in the browser and leaves Pilot's files in the build.`;
    case "gatsby":
      return `${intro} It's Gatsby: in ${at(framework.file, "`gatsby-browser.js` at the app's root (create it if there's none)")}, in its \`onClientEntry\` (add the export if there's none, keep the others):${code(
        "js",
        `export const onClientEntry = () => {
  if (process.env.NODE_ENV === "development") import("usepilot/auto");
};`,
      )}`;
    case "rsbuild":
      return `${intro} It's Rsbuild: in its entry module, ${at(framework.file, "the one `source.entry` in its config names (`src/index` by default)")}, add:${code("ts", 'if (import.meta.env.DEV) import("usepilot/auto");')}`;
    case "parcel":
      return `${intro} It's Parcel: in the script its HTML page loads, ${at(framework.file, "the `<script src>` of the page Parcel builds")}, add:${code("js", 'if (process.env.NODE_ENV === "development") import("usepilot/auto");')}`;
    case "webpack":
      return `${intro} It's webpack, or a tool built on it (Create React App, Vue CLI, Rspack): in the app's entry file, ${at(framework.file, "the one its bundler config starts from")}, add:${code("js", 'if (process.env.NODE_ENV === "development") import("usepilot/auto");')}`;
    default:
      return `${intro} With no bundler Pilot knows (a server-rendered site: PHP, Rails, Django, plain HTML), add it to the layout every page shares (Pilot works on every page), as one tag pointing at Pilot's file where the dev server serves it: \`<script type="module" src="…/node_modules/usepilot/dist/pilot-auto.js"></script>\`. **It must never be output on a server, whatever a request says.** Print it only when both hold: Pilot's own file is on disk (\`node_modules/usepilot/dist/pilot-auto.js\`: a dev dependency, never on a server, as long as the deploy leaves \`node_modules\` out or installs without dev dependencies: check the project's deploy rules, and ask the user if you can't tell), and the project's own development setting says so (an environment variable like \`APP_ENV=local\`, or the local config file that isn't deployed; ask the user if there's none). Never decide from the request (the Host header, the client's IP): a proxy or a client can make them say anything. For example, in PHP:${code(
        "php",
        `<?php if (is_file(__DIR__ . '/node_modules/usepilot/dist/pilot-auto.js') && getenv('APP_ENV') === 'local') { ?>
  <script type="module" src="/node_modules/usepilot/dist/pilot-auto.js"></script>
<?php } ?>`,
      )}
   With a bundler, import \`usepilot/auto\` from the browser code, only in development (\`import.meta.env.DEV\` with Vite, \`process.env.NODE_ENV === "development"\` with webpack). Either way Pilot itself won't run on a public address.`;
  }
}

/** How a loader mounts Pilot naming its project (`mountPilot({ project })`): what `npx usepilot` in the project's folder looks for. */
export function loaderCall(name: string): string {
  return `import("usepilot").then((p) => p.mountPilot({ project: ${JSON.stringify(name)} }))`;
}

/**
 * The loading step, every snippet naming the project (see loaderCall): with
 * several projects open, or another app with Pilot, `npx usepilot` runs only
 * for its own project's pages.
 */
function loadStep(framework: Framework, cwd: string): string {
  const name = projectName(cwd);
  const json = JSON.stringify(name);
  return (
    baseLoadStep(framework, cwd)
      .replaceAll('import("usepilot/auto")', loaderCall(name))
      .replaceAll(
        '<script type="module" src="/node_modules/usepilot/dist/pilot-auto.js"></script>',
        `<script type="module">import { mountPilot } from "/node_modules/usepilot/dist/pilot.js"; mountPilot({ project: ${json} });</script>`,
      )
      .replaceAll(
        '`<script type="module" src="…/node_modules/usepilot/dist/pilot-auto.js"></script>`',
        `\`<script type="module">import { mountPilot } from "…/node_modules/usepilot/dist/pilot.js"; mountPilot({ project: ${json} });</script>\``,
      )
      .replaceAll("import \`usepilot/auto\` from the browser code", `call \`${loaderCall(name)}\` from the browser code`) +
    `\n\n   The \`project\` (${json}, this package's name) tells \`npx usepilot\` which pages are this project's: keep it as it is.`
  );
}

/**
 * A loader found in the app that doesn't name this project (from before
 * 0.15, or another name): the step that names it, for the agent; null when
 * it's right.
 */
export function namingStep(file: string, cwd: string): string | null {
  const name = projectName(cwd);
  const text = readText(file);
  if (new RegExp(`project:\\s*["'\`]${name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}["'\`]`).test(text)) return null;
  return `**Name this project in Pilot's loader** (\`${relative(cwd, file)}\`): \`npx usepilot\` runs only for pages that say which project they are. Replace \`import("usepilot/auto")\` with \`${loaderCall(name)}\` (keep its development-only check), or set \`project: ${JSON.stringify(name)}\` where it calls \`mountPilot\`.`;
}

// ── Files ────────────────────────────────────────────────────────────────

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
