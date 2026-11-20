import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type AgentKind, isAgentKind } from "./agents.ts";

/**
 * Pilot's own settings on this machine, per project folder: which agent runs
 * its jobs. The designer's, never in the repo (a teammate may use another
 * agent): `~/.config/usepilot/projects.json` (`%APPDATA%\usepilot` on Windows).
 */

export function configFile(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  const base = platform === "win32" ? (env.APPDATA ?? join(home, "AppData", "Roaming")) : (env.XDG_CONFIG_HOME ?? join(home, ".config"));
  return join(base, "usepilot", "projects.json");
}

type Projects = Record<string, { agent?: string }>;

function read(file: string): Projects {
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return data && typeof data === "object" ? (data as Projects) : {};
  } catch {
    return {};
  }
}

/** The agent saved for this project folder, if any. */
export function savedAgent(folder: string, file = configFile()): AgentKind | undefined {
  const agent = read(file)[resolve(folder)]?.agent;
  return isAgentKind(agent) ? agent : undefined;
}

/** Saves the agent for this project folder. */
export function saveAgent(folder: string, agent: AgentKind, file = configFile()): void {
  const projects = read(file);
  projects[resolve(folder)] = { ...projects[resolve(folder)], agent };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(projects, null, 2)}\n`);
}
