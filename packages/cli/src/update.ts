import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { BRIDGE_VERSION } from "@pilot/protocol";
import { RESTART } from "./clients.ts";
import { agentsWithPilot, installArgs, installedVersion, packageManager, projectRoot, skillFolders } from "./init.ts";
import { writeSkill } from "./setup.ts";
import { olderThan, VERSION } from "./version.ts";

/**
 * `npx usepilot@latest update`: brings Pilot up to date in a project that
 * has it. What `init` set up stays; what changes with a version is updated:
 * - the `usepilot` package, to the latest, with the project's package manager;
 * - the `pilot` skill, wherever `init` put it (the agent's own folder, or
 *   the repo's), since installing the package doesn't touch those copies.
 *   A skill that's a link (to a Pilot checkout, while developing Pilot) is
 *   left as it is.
 * The MCP server's command doesn't change between versions, so its config
 * isn't touched.
 *
 * It prints what changed and the next steps, plain enough for a designer
 * running it in a terminal, and for an agent to pass on: restart the app
 * (its bundler may keep the old Pilot), open a new chat (an open one keeps
 * the old MCP server), and, when the bridge changed, update Pilot in the
 * other projects too (their Pilots can't join this one).
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
  const pkg = readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(join(cwd, "package.json"));
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

  // 2. The skill, wherever init put it.
  const skills: string[] = [];
  for (const folder of skillFolders(root, home)) {
    if (!existsSync(folder) || isLink(folder)) continue;
    await writeSkill(folder);
    skills.push(folder.startsWith(home) ? `~${folder.slice(home.length)}` : folder);
  }

  if (!installed) {
    return `# Pilot: not updated

Installing the latest Pilot didn't work (the output is above). Run this in ${cwd}, then \`npx usepilot@latest update\` again:

\`\`\`
${pm} ${args.join(" ")}
\`\`\`
`;
  }

  const changed = !!before && !!after && olderThan(before, after);
  // How each agent with Pilot loads the new one: some need their Pilot server restarted, a new chat isn't enough (clients.ts).
  const agents = agentsWithPilot(root, home, options.platform);
  const steps = [
    "Restart your app's dev server, so the page loads the new Pilot.",
    ...(agents.length ? agents.map((a) => RESTART[a]) : [RESTART.other]),
    "Then, in a new chat, ask your agent to launch Pilot (or run `/pilot`).",
  ];
  if (oldBridge !== null && oldBridge !== BRIDGE_VERSION) {
    steps.push(
      "Update Pilot in your other projects too (`npx usepilot@latest update` in each): this version can't share its connection with older ones.",
    );
  }
  const headline = changed ? `# Pilot updated: ${before} → ${after}` : `# Pilot is up to date (${after ?? VERSION})`;
  const skillLine = skills.length ? `\nThe \`pilot\` skill is updated too (${skills.map((s) => `\`${s}\``).join(", ")}).\n` : "";
  return `${headline}
${skillLine}
${changed ? `Next:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n` : "Nothing else to do.\n"}`;
}

/** The bridge version of the installed Pilot (read from its CLI bundle), before it's replaced; null when unknown. */
function bridgeOf(cwd: string, root: string): number | null {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const file = join(dir, "node_modules", "usepilot", "cli", "index.js");
    if (existsSync(file)) {
      const match = /BRIDGE_VERSION = (\d+)/.exec(readFileSync(file, "utf8"));
      return match ? Number(match[1]) : null;
    }
    if (dir === root || dirname(dir) === dir) return null;
  }
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
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
