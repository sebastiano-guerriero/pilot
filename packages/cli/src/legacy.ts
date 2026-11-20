import { existsSync, lstatSync, readFileSync } from "node:fs";
import { readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Pilot's old setup, from before agent runs (0.13 and earlier): its MCP
 * server registered with each agent, and the `/pilot` skill, on this machine
 * or in the repo. An agent's chat then ran Pilot, parked in an MCP tool call.
 * Since Pilot runs the agent itself (`npx usepilot`), `init` and `update`
 * remove what they find of it, so no chat starts an old Pilot that can't
 * reach the page. Only Pilot's own entries and files: the rest of each
 * config is kept, a skill folder is removed only when it's Pilot's (its
 * SKILL.md says `name: pilot`), and a link to a Pilot checkout is unlinked,
 * never followed.
 */

/** JSON configs that may register Pilot's server: the file, and the key its servers are under. */
function serverConfigs(root: string, home: string, platform: NodeJS.Platform): Array<{ file: string; key: string }> {
  return [
    { file: join(home, ".cursor", "mcp.json"), key: "mcpServers" },
    { file: join(vscodeUserDir(home, platform), "mcp.json"), key: "servers" },
    { file: join(root, ".mcp.json"), key: "mcpServers" },
    { file: join(root, ".cursor", "mcp.json"), key: "mcpServers" },
    { file: join(root, ".vscode", "mcp.json"), key: "servers" },
  ];
}

/** Folders that may hold the `pilot` skill. */
function skillFolders(root: string, home: string): string[] {
  return [
    join(home, ".claude", "skills", "pilot"),
    join(home, ".cursor", "skills", "pilot"),
    join(home, ".copilot", "skills", "pilot"),
    join(home, ".agents", "skills", "pilot"),
    join(root, ".claude", "skills", "pilot"),
    join(root, ".cursor", "skills", "pilot"),
    join(root, ".github", "skills", "pilot"),
    join(root, ".agents", "skills", "pilot"),
  ];
}

/** Whether a server entry is Pilot's: its command runs `usepilot … mcp` (npx, or a link to a checkout's build). */
export function isPilotServer(entry: unknown): boolean {
  const e = entry as { command?: unknown; args?: unknown } | null;
  if (!e || typeof e.command !== "string") return false;
  const args = Array.isArray(e.args) ? e.args.map(String) : [];
  const line = [e.command, ...args].join(" ");
  return args.includes("mcp") && /usepilot|packages\/cli\/dist\/index\.js/.test(line);
}

/**
 * Removes Pilot's old MCP registrations and skills found on this machine
 * and in the repo at `root`. Returns what it removed, for the user to read
 * (paths with the home folder as `~`).
 */
export async function removeOldSetup(
  root: string,
  home: string,
  platform: NodeJS.Platform,
  run: (command: string, args: string[], cwd: string) => boolean,
): Promise<string[]> {
  const removed: string[] = [];
  for (const { file, key } of serverConfigs(root, home, platform)) {
    let config: Record<string, Record<string, unknown>>;
    try {
      config = JSON.parse(await readFile(file, "utf8")) as typeof config;
    } catch {
      continue;
    }
    const servers = config?.[key];
    if (!servers || !isPilotServer(servers.pilot)) continue;
    delete servers.pilot;
    await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
    removed.push(tilde(file, home));
  }
  // Claude Code's and Codex's user configs: their own CLI removes it.
  const claude = (readJson(join(home, ".claude.json")) as { mcpServers?: Record<string, unknown> } | null)?.mcpServers?.pilot;
  if (isPilotServer(claude) && run("claude", ["mcp", "remove", "--scope", "user", "pilot"], home)) removed.push("Claude Code's `pilot` server");
  if (/\[mcp_servers\.pilot\][^[]*usepilot/.test(readText(join(home, ".codex", "config.toml"))) && run("codex", ["mcp", "remove", "pilot"], home))
    removed.push("Codex's `pilot` server");
  for (const folder of skillFolders(root, home)) {
    if (!(await removeSkill(folder))) continue;
    removed.push(tilde(folder, home));
  }
  return removed;
}

/** Removes the `pilot` skill at `folder` if it's Pilot's: a link is unlinked (its target kept), a folder removed. */
async function removeSkill(folder: string): Promise<boolean> {
  let link = false;
  try {
    link = lstatSync(folder).isSymbolicLink();
  } catch {
    return false;
  }
  if (!/^name:\s*pilot\s*$/m.test(readText(join(folder, "SKILL.md")))) return false;
  if (link) await unlink(folder);
  else await rm(folder, { recursive: true, force: true });
  return true;
}

function vscodeUserDir(home: string, platform: NodeJS.Platform): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Code", "User");
  if (platform === "win32") return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User");
  return join(home, ".config", "Code", "User");
}

function tilde(path: string, home: string): string {
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function readText(file: string): string {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch {
    return "";
  }
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}
