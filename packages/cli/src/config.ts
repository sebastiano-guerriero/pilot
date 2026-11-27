import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { projectNameOf } from "@pilot/protocol";
import { type AgentKind, isAgentKind } from "./agents.ts";

/**
 * Pilot's own settings on this machine, per project folder: which agent runs
 * its jobs, and the agent's sessions kept for the editor's jobs (pool.ts). The designer's, never in the repo (a teammate may use another
 * agent): `~/.config/usepilot/projects.json` (`%APPDATA%\usepilot` on Windows).
 */

export function configFile(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  const base = platform === "win32" ? (env.APPDATA ?? join(home, "AppData", "Roaming")) : (env.XDG_CONFIG_HOME ?? join(home, ".config"));
  return join(base, "usepilot", "projects.json");
}

/** A session of the agent's kept for the editor's jobs (pool.ts). */
export interface SavedSession {
  agent: AgentKind;
  id: string;
  /** How many jobs it has run. */
  jobs: number;
  /** When it started (ms since the epoch). */
  since: number;
}

type Projects = Record<string, { agent?: string; editor?: SavedSession[]; setUp?: boolean }>;

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

/**
 * Whether Pilot is set up for this project folder on this computer: `init`
 * ran here (markSetUp), or an agent was saved for it (`init --agent`, or
 * `npx usepilot` here). The dev server starts Pilot only then (dev.ts): the
 * project's files are shared, and a teammate who never set Pilot up doesn't
 * get it started with their dev server.
 */
export function isSetUp(folder: string, file = configFile()): boolean {
  const project = read(file)[resolve(folder)];
  return !!project && (project.setUp === true || isAgentKind(project.agent));
}

/** Marks Pilot as set up for this project folder on this computer (see isSetUp): `init` does. */
export function markSetUp(folder: string, file = configFile()): void {
  const projects = read(file);
  if (projects[resolve(folder)]?.setUp) return;
  projects[resolve(folder)] = { ...projects[resolve(folder)], setUp: true };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(projects, null, 2)}\n`);
}

/** The sessions kept for the editor's jobs in this project folder. */
export function savedSessions(folder: string, file = configFile()): SavedSession[] {
  const list = read(file)[resolve(folder)]?.editor;
  return Array.isArray(list) ? list.filter((s) => s && isAgentKind(s.agent) && typeof s.id === "string") : [];
}

/** Saves the sessions kept for the editor's jobs in this project folder. */
export function saveSessions(folder: string, sessions: SavedSession[], file = configFile()): void {
  const projects = read(file);
  projects[resolve(folder)] = { ...projects[resolve(folder)], editor: sessions };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(projects, null, 2)}\n`);
}

/**
 * A project's name, the tag its pages carry (`mountPilot({ project })`,
 * written by `init`) so `npx usepilot` in its folder runs for its pages only:
 * its package.json's `name`, else its folder's name.
 */
export function projectName(folder: string): string {
  try {
    const name = projectNameOf((JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { name?: unknown }).name);
    if (name) return name;
  } catch {
    // No package.json, or not JSON.
  }
  return projectNameOf(basename(resolve(folder))) ?? "project";
}
