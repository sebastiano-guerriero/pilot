import { type Dirent, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { ProjectComponent } from "@pilot/protocol";
import { relPath } from "./paths.ts";

/**
 * The project's components, for the comment box's `@` list: the ones the
 * page doesn't render too, so the designer can mention a component that's on
 * another page, or not used yet. Read from the code with plain text
 * patterns (no build, no parser): React, Preact and Solid components
 * declared as exported functions or constants (`forwardRef`, `memo` too),
 * Vue and Svelte components by their file. Not found: components made by a
 * factory of the project's own (`motion.create(Card)`); the designer can
 * still type them, and the agent looks for them.
 *
 * Scanned from the workspace's root (a monorepo's, where `packages/ui`
 * lives), not only the app's folder. Kept current without a watcher: each
 * call walks the folders again and reads only the files saved since (a
 * walk is milliseconds: ~25ms for a thousand files), so a component the
 * designer or an agent adds shows the next time the list opens.
 */

/** Folders never scanned: dependencies, builds, caches, VCS, test and story folders. */
export const SKIP = new Set([
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
  "storybook-static",
  "__tests__",
  "__mocks__",
]);
const EXTENSIONS = new Set([".jsx", ".tsx", ".js", ".vue", ".svelte"]);
/** Tests, stories and type declarations hold no components to mention. */
const NOT_COMPONENTS = /\.(test|spec|stories|story|d)\.[jt]sx?$/;
/** Route files (Next.js, Remix): the framework calls them, the designer names the page instead. */
const ROUTE_FILES = /^(page|layout|template|loading|error|not-found|default|route|_app|_document)\.[jt]sx?$/;
const MAX_FILES = 8000;
const MAX_FILE_BYTES = 512_000;
const BUDGET_MS = 1500;

interface Cached {
  mtime: number;
  components: Array<{ name: string; line: number }>;
}

/** Per workspace root: each file's components, as of its last save. */
const cache = new Map<string, Map<string, Cached>>();

/** The components under the workspace roots of `folders` (the agents' project folders), each once, paths relative to its root. */
export function projectComponents(folders: readonly string[]): ProjectComponent[] {
  const roots = [...new Set(folders.map(workspaceRoot))];
  const out: ProjectComponent[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + BUDGET_MS;
  for (const root of roots) {
    for (const c of scan(root, deadline)) {
      const key = `${c.name} ${c.file}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
  }
  return out;
}

/**
 * Where a project's components are: the nearest folder up from it that holds
 * a workspace (pnpm, npm/yarn `workspaces`, Lerna, Nx, Turborepo), within its
 * repository; else the project's folder itself.
 */
export function workspaceRoot(folder: string): string {
  let dir = folder;
  for (;;) {
    if (isWorkspace(dir)) return dir;
    const parent = dirname(dir);
    // The repository's root is as far as it goes (and never above the folder without one).
    if (existsSync(join(dir, ".git")) || parent === dir) return folder;
    dir = parent;
  }
}

function isWorkspace(dir: string): boolean {
  if (["pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json"].some((f) => existsSync(join(dir, f)))) return true;
  try {
    return "workspaces" in JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return false;
  }
}

function scan(root: string, deadline: number): ProjectComponent[] {
  const known = cache.get(root) ?? new Map<string, Cached>();
  const now = new Map<string, Cached>();
  const out: ProjectComponent[] = [];
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (now.size >= MAX_FILES || Date.now() > deadline) return;
      const name = entry.name;
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || !EXTENSIONS.has(extname(name)) || NOT_COMPONENTS.test(name) || ROUTE_FILES.test(name)) continue;
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) continue;
      const before = known.get(path);
      const cached = before && before.mtime === stat.mtimeMs ? before : { mtime: stat.mtimeMs, components: read(path) };
      now.set(path, cached);
      const file = relPath(root, path);
      for (const c of cached.components) out.push({ name: c.name, file, line: c.line });
    }
  };
  walk(root);
  // Files gone (deleted, renamed) leave the cache with this walk.
  cache.set(root, now);
  return out;
}

/** A Vue or Svelte file's component name: its file's, in PascalCase (`user-card.vue` → `UserCard`). */
export function fileComponentName(path: string): string {
  return basename(path, extname(path))
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
}

/** A component's name: PascalCase with a lowercase letter in it (not `API_URL`, not `X`). */
const NAME = "[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*";
const FUNCTION = new RegExp(`^\\s*(export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+(${NAME})\\b`);
const CONSTANT = new RegExp(`^\\s*(export\\s+)?(?:const|let|var)\\s+(${NAME})\\s*(?::[^=]+)?=\\s*(.*)$`);
/** What a constant component is: a function, or a wrapper around one. */
const COMPONENT_VALUE =
  /^(?:\(|async\s*\(|function\b|[A-Za-z_$][\w$]*\s*=>|(?:React\.)?(?:forwardRef|memo|lazy)\b|styled[.(]|defineComponent\b|component\$)/;

/** The components a file declares and exports, with their lines. */
export function read(path: string): Array<{ name: string; line: number }> {
  const ext = extname(path);
  if (ext === ".vue" || ext === ".svelte") return [{ name: fileComponentName(path), line: 1 }];
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  // A component file has markup (JSX), or wraps one (styled).
  if (!/<[A-Za-z]|styled[.(]/.test(source)) return [];
  const found: Array<{ name: string; line: number }> = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const fn = FUNCTION.exec(line);
    const constant = fn ? null : CONSTANT.exec(line);
    const m = fn ?? constant;
    if (!m) continue;
    const name = m[2] as string;
    if (constant && !COMPONENT_VALUE.test((constant[3] ?? "").trim())) continue;
    // Exported where it's declared, or later (`export default Card`, `export { Card }`): helpers used in one file aren't listed.
    const exported = !!m[1] || new RegExp(`export\\s+default\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source);
    if (exported && !found.some((f) => f.name === name)) found.push({ name, line: i + 1 });
  }
  return found;
}
