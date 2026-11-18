import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { type ElementTarget, type Job, requestTargets } from "@pilot/protocol";

/**
 * Where an element's code probably is, found by Pilot before the agent gets
 * the job, so it can go straight to the edit instead of searching: the MCP
 * server runs in the project's folder, and a plain text search there takes
 * milliseconds, with no model involved.
 *
 * Each line of the project's source files is scored by what it shares with
 * the element: its id, its text (whole, or its first words), its classes and
 * its tag; nearby lines' classes count too, as markup often spans lines. The
 * best line wins when it's clearly the element's (its id or text, or most of
 * its classes); otherwise nothing is said, and the agent searches as usual.
 * A wrong guess costs the agent one look, so the bar is high.
 */

export interface Location {
  /** Relative to the project's root. */
  file: string;
  /** 1-based. */
  line: number;
  /** The lines around it, for the agent to edit without opening the file first. */
  snippet: string;
}

/** Folders never searched: dependencies, builds, caches, VCS. */
const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  ".vercel",
  ".turbo",
  ".cache",
]);
/** Files that hold markup. */
const EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".jsx",
  ".tsx",
  ".js",
  ".ts",
  ".mjs",
  ".vue",
  ".svelte",
  ".astro",
  ".mdx",
  ".php",
  ".erb",
  ".hbs",
  ".njk",
  ".liquid",
  ".twig",
]);
const MAX_FILES = 4000;
const MAX_FILE_BYTES = 512_000;
/** The whole search, all of a job's elements, stops after this. */
const BUDGET_MS = 800;

/** A project's source files, cached for a moment: a burst of jobs searches the same tree. */
let cache: { root: string; at: number; files: string[] } | null = null;

function sourceFiles(root: string): string[] {
  if (cache && cache.root === root && Date.now() - cache.at < 30_000) return cache.files;
  const files: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (files.length >= MAX_FILES) return;
      if (SKIP.has(name) || (name.startsWith(".") && name !== ".")) continue;
      const path = join(dir, name);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(path);
      else if (EXTENSIONS.has(extname(name)) && stat.size <= MAX_FILE_BYTES) files.push(path);
    }
  };
  walk(root);
  cache = { root, at: Date.now(), files };
  return files;
}

/** A project's root that's worth searching: one with a package.json or a .git, never a home folder by accident. */
export function searchable(cwd: string): boolean {
  return existsSync(join(cwd, "package.json")) || existsSync(join(cwd, ".git"));
}

/** Escapes text for a RegExp. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What to look for, from the element. */
function needles(target: ElementTarget) {
  const text = target.text?.replace(/…$/, "").trim();
  const words = text?.split(/\s+/) ?? [];
  return {
    id: target.id ? new RegExp(`\\bid\\s*=\\s*[{"']*${escape(target.id)}["'}]`) : null,
    // The whole text when it's short; else its first words (the rest may be split across lines or tags).
    text: text && text.length >= 3 && text.length <= 60 ? text : null,
    lead: words.length >= 3 ? words.slice(0, 3).join(" ") : null,
    classes: target.classes.filter((c) => c.length >= 2).map((c) => new RegExp(`(^|[\\s"'\`{])${escape(c)}($|[\\s"'\`}])`)),
    tag: new RegExp(`<${escape(target.tag)}[\\s>/]`, "i"),
  };
}

/** Where `target` probably is under `root`, or null when no line is clearly it. */
export function locate(target: ElementTarget, root: string, deadline = Date.now() + BUDGET_MS): Location | null {
  const n = needles(target);
  if (!n.id && !n.text && !n.lead && n.classes.length < 3) return null;
  let best: { file: string; line: number; score: number; lines: string[] } | null = null;
  for (const file of sourceFiles(root)) {
    if (Date.now() > deadline) break;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Cheap skip: a file sharing nothing distinctive with the element.
    if (
      !(n.id && content.includes(target.id as string)) &&
      !(n.text && content.includes(n.text)) &&
      !(n.lead && content.includes(n.lead))
    ) {
      if (n.classes.length < 3) continue;
    }
    const lines = content.split("\n");
    const classesOn = (i: number) => (lines[i] === undefined ? 0 : n.classes.filter((re) => re.test(lines[i] as string)).length);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] as string;
      let score = 0;
      if (n.id?.test(line)) score += 8;
      if (n.text && line.includes(n.text)) score += 6;
      else if (n.lead && line.includes(n.lead)) score += 4;
      // Classes on this line, or on the lines just above (the opening tag of a multi-line element).
      let classes = 0;
      for (let j = Math.max(0, i - 3); j <= i; j++) classes = Math.max(classes, classesOn(j));
      score += classes;
      if (n.classes.length && classes === n.classes.length) score += 2;
      if (n.tag.test(line)) score += 1;
      if (!best || score > best.score) best = { file, line: i, score, lines };
    }
  }
  // Clearly the element: its id or text, or nearly all of several classes.
  const enough = best && (best.score >= 6 || (n.classes.length >= 3 && best.score >= n.classes.length + 2));
  if (!best || !enough) return null;
  const from = Math.max(0, best.line - 2);
  const snippet = best.lines
    .slice(from, best.line + 3)
    .map((l) => (l.length > 160 ? `${l.slice(0, 159)}…` : l))
    .join("\n");
  return { file: relative(root, best.file), line: best.line + 1, snippet };
}

/**
 * A job's elements and where their code probably is, as a section for the
 * job's prompt; empty when none was found (or the project can't be searched).
 */
export function whereSection(job: Job, root: string): string {
  if (!searchable(root)) return "";
  const targets = job.changeSet.request ? requestTargets(job.changeSet.request) : job.changeSet.edits.map((e) => e.target);
  const deadline = Date.now() + BUDGET_MS;
  const found: string[] = [];
  for (const target of targets) {
    const at = locate(target, root, deadline);
    if (!at) continue;
    const lang = extname(at.file).slice(1) || "text";
    found.push(
      `- \`${target.path}\` → \`${at.file}:${at.line}\`:`,
      "",
      `  \`\`\`${lang}`,
      ...at.snippet.split("\n").map((l) => `  ${l}`),
      "  ```",
    );
  }
  if (!found.length) return "";
  return [
    "## Where the code probably is",
    "",
    "Pilot searched the project for these elements (by id, text and classes). Start there; if it isn't the right place (the text comes from a prop, a translation, a CMS), search as usual.",
    "",
    ...found,
  ].join("\n");
}
