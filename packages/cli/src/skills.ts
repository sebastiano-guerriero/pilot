import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type ProjectSkill, SKILL_NAME } from "@pilot/protocol";
import type { AgentCli } from "./agents.ts";

/**
 * The skills of the agent Pilot runs, for the comment box's `/` list: the
 * ones its own `/` shows, read from the folders that agent reads them from
 * (`skills` in AGENTS), the project's first, then the user's. A skill is a
 * folder with a `SKILL.md`, its name and description in the frontmatter at
 * its top, the format Claude Code, Codex and Cursor share. Pilot reads only
 * that: the agent loads the skill itself when a comment picks it (see
 * `invokeSkill`), with its other files, as it would in its chat.
 *
 * Read again each time the list opens (a few small files), so a skill
 * installed meanwhile (`npx skills add …`) shows the next time.
 */

/** Where `cli` reads skills from, for a run in `project`: the project's folder and each above it up to the repository's root, then the user's. */
export function skillFolders(cli: AgentCli, project: string, home = homedir()): string[] {
  const folders = [...projectRoots(project).flatMap((dir) => cli.skills.project.map((rel) => join(dir, rel))), ...cli.skills.home.map((rel) => join(home, rel))];
  return [...new Set(folders)];
}

/** The project's folder, and each above it up to the repository's root (the one with `.git`); only the project's folder outside a repository. */
function projectRoots(project: string): string[] {
  const roots = [project];
  let dir = project;
  while (!existsSync(join(dir, ".git"))) {
    const up = dirname(dir);
    if (up === dir) return [project];
    dir = up;
    roots.push(dir);
  }
  return roots;
}

/** The skills in `folders`, each name once (the first folder's wins: the project's over the user's), by name. */
export function findSkills(folders: readonly string[]): ProjectSkill[] {
  const found = new Map<string, ProjectSkill>();
  for (const folder of folders) {
    let entries: string[];
    try {
      entries = readdirSync(folder);
    } catch {
      continue;
    }
    for (const entry of entries.sort()) {
      if (entry.startsWith(".")) continue;
      const meta = readSkill(join(folder, entry, "SKILL.md"));
      if (!meta) continue;
      const name = meta.name || entry;
      if (!SKILL_NAME.test(name) || found.has(name)) continue;
      found.set(name, { name, ...(meta.description ? { description: meta.description } : {}), ...(meta.author ? { author: meta.author } : {}) });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const MAX_SKILL_BYTES = 256_000;
const MAX_DESCRIPTION = 300;
const MAX_AUTHOR = 60;

/** A `SKILL.md`'s name, description and author (a symlinked folder counts, as installers make them); null when there's none. */
function readSkill(file: string): { name?: string; description?: string; author?: string } | null {
  try {
    if (statSync(file).size > MAX_SKILL_BYTES) return null;
    const text = readFileSync(file, "utf8");
    const meta = frontmatter(text);
    const description = meta.description?.replace(/\s+/g, " ").trim();
    const author = (meta.author ?? metadataValue(text, "author"))?.replace(/\s+/g, " ").trim().slice(0, MAX_AUTHOR);
    return {
      name: meta.name?.trim(),
      description: description && description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : description,
      ...(author ? { author } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The keys of a Markdown file's YAML frontmatter, as text: plain, quoted and
 * folded or literal values (`description: >-` and its indented lines), and
 * plain values that go on over indented lines. Enough for a skill's name
 * and description; not a YAML parser.
 */
export function frontmatter(text: string): Record<string, string> {
  const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)?.[1];
  if (block === undefined) return {};
  const lines = block.split(/\r?\n/);
  const out: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const pair = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i] as string);
    if (!pair) continue;
    const key = pair[1] as string;
    let value = (pair[2] as string).trim();
    const more: string[] = [];
    while (i + 1 < lines.length && (/^[ \t]+\S/.test(lines[i + 1] as string) || !(lines[i + 1] as string).trim())) more.push((lines[++i] as string).trim());
    if (/^[>|][+-]?$/.test(value)) value = more.filter(Boolean).join(value.startsWith("|") ? "\n" : " ");
    else if (more.some(Boolean)) value = [value, ...more].filter(Boolean).join(" ");
    out[key] = unquote(value);
  }
  return out;
}

/**
 * A key of the frontmatter's `metadata:` map (the Agent Skills format keeps
 * `author` and `version` there), as text; undefined when there's none.
 */
export function metadataValue(text: string, key: string): string | undefined {
  const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)?.[1];
  if (block === undefined) return undefined;
  const lines = block.split(/\r?\n/);
  const start = lines.findIndex((l) => /^metadata:[ \t]*$/.test(l));
  if (start < 0) return undefined;
  for (const line of lines.slice(start + 1)) {
    if (!/^[ \t]+\S/.test(line)) break;
    const pair = new RegExp(`^[ \\t]+${key}:[ \\t]*(.+)$`).exec(line);
    if (pair) return unquote((pair[1] as string).trim());
  }
  return undefined;
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\(["\\])/g, "$1").replace(/\\n/g, "\n");
  return value;
}
