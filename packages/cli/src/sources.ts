import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * A project's source files, for Pilot's code search (locate.ts): every file
 * that can hold markup, read once and kept while `npx usepilot` runs (re-read
 * when it changes), with how many files hold each word, so the search can
 * tell a rare class (`nav-links`) from one on every line (`flex`).
 *
 * No cap on how many files the walk takes (a project's own vendored library
 * could fill any cap before its pages: nucleo-2's `libs`, ahead of `web-3`);
 * files without markup are dropped once read, and remembered as such.
 */

/** Folders never searched: dependencies, builds, caches, VCS. */
const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "bower_components",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  ".vercel",
  ".turbo",
  ".cache",
]);
/** Files that may hold markup. */
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
/** A sanity bound, far above any project's own files. */
const MAX_FILES = 50_000;
const MAX_FILE_BYTES = 512_000;
/** How long a walk is trusted before the next search walks again. */
const FRESH_MS = 2_000;

/** A file with markup, as the search reads it. */
export interface Source {
  path: string;
  /** Relative to the project's root. */
  rel: string;
  content: string;
  lines: string[];
  /** Its words (split on spaces, quotes and brackets): class names, text words. */
  words: Set<string>;
  /** How many of its lines hold each word. */
  lineCounts: Map<string, number>;
}

interface Entry {
  mtime: number;
  size: number;
  /** null: read, no markup in it. */
  source: Source | null;
}

class Index {
  entries = new Map<string, Entry>();
  /** Every walked file, markup or not (componentFile looks at all scripts). */
  paths: string[] = [];
  /** Every stylesheet walked (not read): where facts.ts looks for the project's Tailwind. */
  styles: string[] = [];
  /** How many lines of the markup files hold each word, and how many lines they have. */
  counts = new Map<string, number>();
  lines = 0;
  walkedAt = 0;
  constructor(readonly root: string) {}

  get sources(): Source[] {
    const out: Source[] = [];
    for (const e of this.entries.values()) if (e.source) out.push(e.source);
    return out;
  }

  refresh(): void {
    if (Date.now() - this.walkedAt < FRESH_MS) return;
    const seen = new Set<string>();
    const paths: string[] = [];
    const styles: string[] = [];
    const walk = (dir: string) => {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        if (paths.length >= MAX_FILES) return;
        if (SKIP.has(name) || name.startsWith(".")) continue;
        const path = join(dir, name);
        let stat: ReturnType<typeof statSync>;
        try {
          stat = statSync(path);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          walk(path);
          continue;
        }
        if (extname(name) === ".css" && stat.size <= MAX_FILE_BYTES) styles.push(path);
        if (!EXTENSIONS.has(extname(name)) || stat.size > MAX_FILE_BYTES) continue;
        paths.push(path);
        seen.add(path);
        const known = this.entries.get(path);
        if (known && known.mtime === stat.mtimeMs && known.size === stat.size) continue;
        if (known?.source) this.count(known.source, -1);
        const source = this.read(path);
        if (source) this.count(source, 1);
        this.entries.set(path, { mtime: stat.mtimeMs, size: stat.size, source });
      }
    };
    walk(this.root);
    for (const [path, e] of this.entries) {
      if (seen.has(path)) continue;
      if (e.source) this.count(e.source, -1);
      this.entries.delete(path);
    }
    this.paths = paths;
    this.styles = styles;
    this.walkedAt = Date.now();
  }

  private read(path: string): Source | null {
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      return null;
    }
    if (!/<[A-Za-z][\w.:-]*[\s>/]/.test(content)) return null;
    const lines = content.split("\n");
    const lineCounts = new Map<string, number>();
    for (const line of lines) for (const w of new Set(wordsOf(line))) lineCounts.set(w, (lineCounts.get(w) ?? 0) + 1);
    return { path, rel: relative(this.root, path), content, lines, words: new Set(lineCounts.keys()), lineCounts };
  }

  private count(source: Source, by: 1 | -1): void {
    this.lines += by * source.lines.length;
    for (const [w, lines] of source.lineCounts) {
      const n = (this.counts.get(w) ?? 0) + by * lines;
      if (n > 0) this.counts.set(w, n);
      else this.counts.delete(w);
    }
  }
}

/** The words of some markup: class names (whole, `**:[:where(h1,h2)]:mb-0` too), text words, attribute values. */
export function wordsOf(text: string): string[] {
  return text.split(/[\s"'`<>{}=]+/).filter((w) => w.length > 0);
}

const indexes = new Map<string, Index>();

function indexOf(root: string): Index {
  let index = indexes.get(root);
  if (!index) {
    index = new Index(root);
    indexes.set(root, index);
  }
  index.refresh();
  return index;
}

/**
 * The project's markup files, and how rare a word is in them: 6 when one line
 * has it, 0 when every line does, the same in a small project as in a large
 * one (by lines, not files: a two-file project has rare words too).
 */
export function markupSources(root: string): { sources: Source[]; rarity: (word: string) => number } {
  const index = indexOf(root);
  const scale = 6 / Math.log2(index.lines + 2);
  return {
    sources: index.sources,
    rarity: (word) => Math.max(0, Math.min(6, Math.log2((index.lines + 2) / ((index.counts.get(word) ?? 0) + 1)) * scale)),
  };
}

/** Every stylesheet under `root` (absolute paths). */
export function styleFiles(root: string): string[] {
  return indexOf(root).styles;
}

/** Every source file under `root` (absolute paths), markup or not. */
export function sourceFiles(root: string): string[] {
  return indexOf(root).paths;
}

/** Reads the project once ahead of its first job (`npx usepilot` starting), so that job doesn't wait for it. */
export function warmSources(root: string): void {
  indexOf(root);
}
