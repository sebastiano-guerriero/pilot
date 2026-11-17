import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import skill from "../../../skills/pilot/SKILL.md";

/** How agents start Pilot's MCP server: the published package, through npx. */
export const MCP_SERVER = { command: "npx", args: ["-y", "usepilot", "mcp"] };

export interface SetupOptions {
  /**
   * Set up the repo instead of this machine: the skill in the repo's
   * `.claude/skills/pilot/`, and the MCP server in its `.mcp.json`, both
   * meant to be committed, so everyone working in the repo gets /pilot.
   */
  project?: boolean;
  /** The project folder (`project`), by default the current one. */
  cwd?: string;
  /** The user's home folder (machine setup), by default the real one. */
  home?: string;
}

/**
 * `usepilot setup`: makes `/pilot` available in Claude Code.
 * - By default, for this machine, in every project: installs the skill in
 *   the user's skills folder and prints the command that registers the MCP
 *   server for all projects (the user's agent configuration: they run it).
 * - With `project`, for the repo: writes the skill and `.mcp.json` into it
 *   (adding Pilot to an `.mcp.json` that's already there), to commit.
 * Returns what to tell the user.
 */
export async function setup(options: SetupOptions = {}): Promise<string> {
  return options.project ? setupProject(options.cwd ?? process.cwd()) : setupMachine(options.home ?? homedir());
}

async function setupMachine(home: string): Promise<string> {
  const file = await writeSkill(join(home, ".claude", "skills", "pilot"));
  return `Installed the /pilot skill: ${file}

Now register Pilot's MCP server with Claude Code, once, for every project:

  claude mcp add --scope user pilot -- npx -y usepilot mcp

Then, in any Claude Code chat: /pilot
(For a repo you share, run \`npx usepilot setup --project\` in it instead.)
`;
}

async function setupProject(cwd: string): Promise<string> {
  const skillFile = await writeSkill(join(cwd, ".claude", "skills", "pilot"));
  const mcpFile = join(cwd, ".mcp.json");
  const { added } = await addMcpServer(mcpFile);
  const rel = (f: string) => relative(cwd, f);
  const app = existsSync(join(cwd, "package.json"))
    ? ""
    : "\nNo package.json here: run this in the project's root folder, where the app is.\n";
  const width = rel(skillFile).length + 2;
  return `Set up /pilot for this repo:
  ${rel(skillFile).padEnd(width)}the /pilot skill
  ${rel(mcpFile).padEnd(width)}Pilot's MCP server${added ? "" : " (it was there: updated)"}
${app}
Commit both: everyone working in the repo gets /pilot in Claude Code (it asks
each of them once to approve the project's MCP server).

The app needs Pilot too, in development, if it doesn't have it yet:
  npm install -D usepilot
  if (import.meta.env.DEV) import("usepilot/auto");   (in the app's entry file)

Then, in a Claude Code chat in this folder: /pilot
`;
}

async function writeSkill(dir: string): Promise<string> {
  // A link (to a Pilot checkout, while developing it): replaced by a folder
  // of its own, so the published skill isn't written into the checkout.
  if (await isLink(dir)) await unlink(dir);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "SKILL.md");
  await writeFile(file, skill);
  return file;
}

async function isLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Adds Pilot to the project's `.mcp.json`, keeping every other server and
 * setting in it. `added`: it wasn't there before.
 */
async function addMcpServer(file: string): Promise<{ added: boolean }> {
  let config: { mcpServers?: Record<string, unknown>; [key: string]: unknown } = {};
  if (existsSync(file)) {
    const text = await readFile(file, "utf8");
    try {
      config = text.trim() ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${file} isn't valid JSON: fix it, then run setup again.`);
    }
  }
  const servers = config.mcpServers ?? {};
  const added = !("pilot" in servers);
  config.mcpServers = { ...servers, pilot: MCP_SERVER };
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
  return { added };
}
