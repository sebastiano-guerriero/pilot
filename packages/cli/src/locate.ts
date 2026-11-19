import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import type { AgentRequest, ElementTarget, Job } from "@pilot/protocol";
import { requestTargets } from "@pilot/protocol";

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
  // Its component's file and line are known (the framework said, or componentFile found it): the
  // element's own line in that component (its classes or tag are enough there), else the component's.
  const known = target.source?.file && target.source.line ? sourcePath(target.source.file, root) : null;
  if (known && target.source?.line) {
    try {
      const lines = readFileSync(join(root, known), "utf8").split("\n");
      const from = target.source.line - 1;
      const own = bestLine(n, lines, from);
      const index = own && own.score >= 2 ? own.index : from;
      return { file: known, line: index + 1, snippet: snippetAt(lines, index) };
    } catch {
      // Not readable: search as usual.
    }
  }
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
    const found = bestLine(n, lines);
    if (found && (!best || found.score > best.score)) best = { file, line: found.index, score: found.score, lines };
  }
  // Clearly the element: its id or text, or nearly all of several classes.
  const enough = best && (best.score >= 6 || (n.classes.length >= 3 && best.score >= n.classes.length + 2));
  if (!best || !enough) return null;
  return { file: relative(root, best.file), line: best.line + 1, snippet: snippetAt(best.lines, best.line) };
}

/**
 * The line of `lines` (from `from` on) most like the element: its id, its
 * text (whole, or its first words), its classes (on the line or just above,
 * for a multi-line tag) and its tag. The first of the best, with its score.
 */
function bestLine(n: ReturnType<typeof needles>, lines: string[], from = 0): { index: number; score: number } | null {
  const classesOn = (i: number) => (lines[i] === undefined ? 0 : n.classes.filter((re) => re.test(lines[i] as string)).length);
  let best: { index: number; score: number } | null = null;
  for (let i = from; i < lines.length; i++) {
    const line = lines[i] as string;
    let score = 0;
    if (n.id?.test(line)) score += 8;
    if (n.text && line.includes(n.text)) score += 6;
    else if (n.lead && line.includes(n.lead)) score += 4;
    let classes = 0;
    for (let j = Math.max(from, i - 3); j <= i; j++) classes = Math.max(classes, classesOn(j));
    score += classes;
    if (n.classes.length && classes === n.classes.length) score += 2;
    if (n.tag.test(line)) score += 1;
    if (!best || score > best.score) best = { index: i, score };
  }
  return best;
}

/** The lines around `index` (0-based), long ones cut. */
function snippetAt(lines: string[], index: number): string {
  return lines
    .slice(Math.max(0, index - 2), index + 3)
    .map((l) => (l.length > 160 ? `${l.slice(0, 159)}…` : l))
    .join("\n");
}

/** A file the framework named, relative to `root` when it's in the project (absolute, or relative already); null when it isn't there. */
function sourcePath(file: string, root: string): string | null {
  const rel = isAbsolute(file) ? relative(root, file) : file.replace(/^\.\//, "");
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return existsSync(join(root, rel)) ? rel : null;
}

/**
 * Where a component is declared in the project, by its name: the file and
 * line of `function ProductCard`, `const ProductCard =`, `class
 * ProductCard`, exported or not. A file named after it wins (`ProductCard.tsx`),
 * then an exported declaration. For when the framework names the component
 * but not its file: React 19 under Turbopack (its stacks name bundle chunks),
 * Server Components (their stacks are the server's), and React 19's lines
 * anywhere (its stacks are the transformed module's).
 */
export function componentFile(
  name: string,
  root: string,
  deadline = Date.now() + BUDGET_MS,
  within?: string,
): { file: string; line: number } | null {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const declaration = new RegExp(
    `^\\s*(export\\s+(?:default\\s+)?)?(?:(?:async\\s+)?function\\s*\\*?\\s+${name}\\b|class\\s+${name}\\b|(?:const|let|var)\\s+${name}\\s*[:=])`,
  );
  let best: { file: string; line: number; score: number } | null = null;
  const files = within ? [join(root, within)] : sourceFiles(root);
  for (const file of files) {
    if (Date.now() > deadline) break;
    if (!/\.[jt]sx?$|\.mjs$/.test(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.includes(name)) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = declaration.exec(lines[i] as string);
      if (!m) continue;
      const score = (basename(file).replace(/\.[^.]+$/, "") === name ? 2 : 0) + (m[1] ? 1 : 0);
      if (!best || score > best.score) best = { file, line: i + 1, score };
      break;
    }
  }
  return best ? { file: relative(root, best.file), line: best.line } : null;
}

/**
 * The job with its elements' component files filled in, where the page
 * named a component but not its file or line (see componentFile): the
 * prompt's "Component" line and the "Where the code probably is" section
 * then point at the declaration. The job the hub keeps is left as it is.
 */
export function withComponentFiles(job: Job, root: string): Job {
  if (!searchable(root)) return job;
  const deadline = Date.now() + BUDGET_MS;
  const fill = (target: ElementTarget): ElementTarget => {
    const source = target.source;
    if (!source?.component || source.line) return target;
    const known = source.file ? sourcePath(source.file, root) : null;
    if (source.file && !known) return target; // Outside the project (a dependency's): nothing to find here.
    const found = componentFile(source.component, root, deadline, known ?? undefined);
    return found ? { ...target, source: { ...source, file: found.file, line: found.line } } : target;
  };
  const { changeSet } = job;
  const request = changeSet.request;
  return {
    ...job,
    changeSet: {
      ...changeSet,
      edits: changeSet.edits.map((e) => ({ ...e, target: fill(e.target) })),
      ...(request
        ? {
            request: {
              ...request,
              target: fill(request.target),
              ...(request.others ? { others: request.others.map(fill) } : {}),
            } as AgentRequest,
          }
        : {}),
    },
  };
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
    "Pilot searched the project for these elements (by component, id, text and classes). Start there; if it isn't the right place (the text comes from a prop, a translation, a CMS), search as usual.",
    "",
    ...found,
  ].join("\n");
}
