import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BRIDGE_VERSION } from "@pilot/protocol";
import { detectFramework, devServerStep, installArgs, installedVersion, namingStep, packageManager, projectRoot } from "./init.ts";
import { removeOldSetup } from "./legacy.ts";
import { olderThan, VERSION } from "./version.ts";

/**
 * `npx usepilot@latest update`: brings Pilot up to date in a project that
 * has it. What `init` set up stays; what changes with a version is updated:
 * - the `usepilot` package, to the latest, with the project's package manager;
 * - Pilot's old setup (its MCP server and `/pilot` skill, from before agent
 *   runs) removed, wherever it is (legacy.ts).
 *
 * It prints what changed and the next steps, plain enough for a designer
 * running it in a terminal, and for an agent to pass on: restart the app
 * (its bundler may keep the old Pilot, and Pilot starts with it) or `npx
 * usepilot`; `init` again for what's new to set up (starting with the dev
 * server); and, when the bridge changed, update Pilot in the other projects
 * too (their Pilots can't join this one).
 *
 * Why a command of its own, not `init` again: `init` is setup, safe to run
 * any time, and never changes a version you have (the convention of
 * `shadcn init`, `prisma init`); upgrading is a deliberate step (as with
 * `storybook upgrade`), and here it's more than a version bump.
 */

export interface UpdateOptions {
  /** The app's folder (where its package.json is), by default the current one. */
  cwd?: string;
  /** Runs a command in a folder; true when it succeeded. Injected by tests. */
  run?: (command: string, args: string[], cwd: string) => boolean;
  /** The user's home folder, by default the real one. Injected by tests. */
  home?: string;
  /** The OS, for where VS Code keeps its user config. Injected by tests. */
  platform?: NodeJS.Platform;
}

export async function update(options: UpdateOptions = {}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const run = options.run ?? runCommand;
  const home = options.home ?? homedir();
  const pkg = readJson<{ scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(join(cwd, "package.json"));
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (!pkg || !deps.usepilot) {
    return `# Pilot isn't installed here

Run this in your app's folder, the one where Pilot was set up. To set Pilot up in this one, run \`npx usepilot@latest init\` instead.
`;
  }

  const root = projectRoot(cwd);
  const before = installedVersion(cwd, root);
  const oldBridge = bridgeOf(cwd, root);

  // 1. The package.
  const pm = packageManager(cwd, root);
  const args = installArgs(pm, "usepilot@latest");
  const installed = run(pm, args, cwd);
  const after = installed ? (installedVersion(cwd, root) ?? VERSION) : before;

  // 2. Pilot's old setup (an agent's chat running it).
  const removed = installed ? await removeOldSetup(root, home, options.platform ?? process.platform, run) : [];

  if (!installed) {
    return `# Pilot: not updated

Installing the latest Pilot didn't work (the output is above). Run this in ${cwd}, then \`npx usepilot@latest update\` again:

\`\`\`
${pm} ${args.join(" ")}
\`\`\`
`;
  }

  // A loader that doesn't name this project yet (from before 0.15): `npx usepilot` wouldn't take its pages.
  const framework = detectFramework(cwd, deps);
  const loader = framework.loads;
  const unnamed = loader ? !!namingStep(loader, cwd) : oldBridge !== null && oldBridge < 8;
  // Pilot can start with the dev server (the Vite plugin, withPilot, `usepilot dev`): one the project doesn't have yet
  // is init's to set up, as the loader's name is.
  const devServer = devServerStep(framework, cwd, pkg);
  const bumped = !!before && !!after && olderThan(before, after);
  const changed = bumped || removed.length > 0 || unnamed;
  const initFor = [
    ...(unnamed ? ["names this project in Pilot's loader, so Pilot knows the app's pages are this project's"] : []),
    ...(devServer.todo ? ["sets Pilot to start with your dev server, so there's no `npx usepilot` to run"] : []),
  ];
  const steps = [
    ...(initFor.length ? [`Ask your agent to run \`npx usepilot@latest init\` in the app's folder: it ${initFor.join(", and ")}.`] : []),
    "Restart your app's dev server, so the page loads the new Pilot.",
    ...(devServer.done ? [] : ["Restart `npx usepilot` in the app's folder, if you run it (Ctrl+C, then run it again), so Pilot runs the new version."]),
  ];
  if (oldBridge !== null && oldBridge !== BRIDGE_VERSION) {
    steps.push(
      "Update Pilot in your other projects too (`npx usepilot@latest update` in each): this version can't share its connection with older ones.",
    );
  }
  const headline = bumped ? `# Pilot updated: ${before} → ${after}` : `# Pilot is up to date (${after ?? VERSION})`;
  const removedLine = removed.length
    ? `\nPilot's old chat setup is removed (${removed.map((r) => `\`${r}\``).join(", ")}): Pilot runs your agent itself now. Run \`npx usepilot\` in your app's folder, beside its dev server, instead of \`/pilot\` in a chat.\n`
    : "";
  return `${headline}
${removedLine}
${changed ? `Next:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n` : "Nothing else to do.\n"}`;
}

/**
 * The bridge version of the installed Pilot (read from its CLI bundle: one file before 0.17, a few since, the shared
 * code in a chunk), before it's replaced; null when unknown.
 */
function bridgeOf(cwd: string, root: string): number | null {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const folder = join(dir, "node_modules", "usepilot", "cli");
    if (existsSync(join(folder, "index.js"))) {
      for (const name of readdirSync(folder).filter((f) => f.endsWith(".js"))) {
        const match = /BRIDGE_VERSION = (\d+)/.exec(readFileSync(join(folder, name), "utf8"));
        if (match) return Number(match[1]);
      }
      return null;
    }
    if (dir === root || dirname(dir) === dir) return null;
  }
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Runs a command, its output going to the terminal; true when it succeeded. */
function runCommand(command: string, args: string[], cwd: string): boolean {
  const result = spawnSync(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32" });
  return result.status === 0;
}
