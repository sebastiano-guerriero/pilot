import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { FileToken } from "@pilot/protocol";
import { SKIP, workspaceRoot } from "./components.ts";
import { relPath } from "./paths.ts";

/**
 * The project's design tokens that only live in files, for the page's
 * variables (fields, `@`): the ones that never reach the browser as CSS
 * variables. Read as text, never run:
 * - JSON token files (`tokens.json`, `*.tokens.json`, any `.json` in a
 *   `tokens/` folder): the W3C design-tokens format (`$value`) and Style
 *   Dictionary's (`value`), groups nested into dotted names
 *   (`color.brand.primary`), aliases (`{color.brand.primary}`) followed;
 * - Sass variables (`$brand: #1cf69e;`) in files named for tokens
 *   (`_variables.scss`, `tokens.scss`, `_colors.scss`…), `$a: $b` followed.
 * Tailwind v3 configs are JavaScript: they'd have to run, so they're left
 * for later. Kept current like the components (components.ts): each call
 * walks the workspace again and reads only the files saved since.
 */

const MAX_FILES = 8000;
const MAX_FILE_BYTES = 512_000;
const MAX_TOKENS = 1000;
const BUDGET_MS = 1500;

/** A JSON file that holds tokens: by its name, or by its folder's. */
function isTokenJson(path: string): boolean {
  const name = basename(path).toLowerCase();
  if (!name.endsWith(".json") || name === "package.json" || name.startsWith("tsconfig")) return false;
  return /(^|[.-])(design-)?tokens?\.json$/.test(name) || /(^|\/)(design-)?tokens?$/.test(dirname(path).toLowerCase());
}

/** A Sass file named for tokens. */
function isTokenSass(path: string): boolean {
  const name = basename(path).toLowerCase();
  return /\.s[ac]ss$/.test(name) && /(token|variable|vars?\b|theme|colou?r|spacing|typograph|radius|radii|shadow|breakpoint)/.test(name);
}

interface Cached {
  mtime: number;
  tokens: FileToken[];
}

const cache = new Map<string, Map<string, Cached>>();

/** The token files' tokens under the workspace roots of `folders`, each once (the first file to name one wins). */
export function fileTokens(folders: readonly string[]): FileToken[] {
  const out: FileToken[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + BUDGET_MS;
  for (const root of new Set(folders.map(workspaceRoot))) {
    for (const t of scan(root, deadline)) {
      if (out.length >= MAX_TOKENS) return out;
      if (!seen.has(t.name)) {
        seen.add(t.name);
        out.push(t);
      }
    }
  }
  return out;
}

function scan(root: string, deadline: number): FileToken[] {
  const known = cache.get(root) ?? new Map<string, Cached>();
  const now = new Map<string, Cached>();
  const out: FileToken[] = [];
  let files = 0;
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= MAX_FILES || Date.now() > deadline) return;
      const name = entry.name;
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      files++;
      const json = isTokenJson(path);
      if (!entry.isFile() || !(json || isTokenSass(path))) continue;
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) continue;
      const before = known.get(path);
      const file = relPath(root, path);
      const cached = before && before.mtime === stat.mtimeMs ? before : { mtime: stat.mtimeMs, tokens: read(path, file, json) };
      now.set(path, cached);
      out.push(...cached.tokens);
    }
  };
  walk(root);
  cache.set(root, now);
  return out;
}

function read(path: string, file: string, json: boolean): FileToken[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return json ? jsonTokens(text, file) : sassTokens(text, file);
}

/** A JSON token file's tokens (W3C `$value` or Style Dictionary `value`), aliases followed. */
export function jsonTokens(text: string, file: string): FileToken[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const raw = new Map<string, string>();
  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;
    const value = "$value" in n ? n.$value : "value" in n && typeof n.value !== "object" ? n.value : undefined;
    if (value !== undefined) {
      if ((typeof value === "string" || typeof value === "number") && path.length) raw.set(path.join("."), String(value));
      return;
    }
    for (const [key, child] of Object.entries(n)) if (!key.startsWith("$")) walk(child, [...path, key]);
  };
  walk(data, []);
  const lines = text.split("\n");
  const out: FileToken[] = [];
  for (const [name, value] of raw) {
    const resolved = resolve(value, (ref) => raw.get(ref), /\{([^{}]+)\}/g);
    if (resolved === null) continue;
    // The line of its last key's first `"key": {` after its group's: good enough to open the file there.
    const last = name.split(".").at(-1) as string;
    const at = lines.findIndex((l) => l.includes(`"${last}"`));
    out.push({ name, value: resolved, file, ...(at >= 0 ? { line: at + 1 } : {}) });
  }
  return out;
}

/** A Sass file's variables (`$name: value;`), `$other` references followed; ones whose value needs Sass to compute (a function of variables) left out. */
export function sassTokens(text: string, file: string): FileToken[] {
  const raw = new Map<string, { value: string; line: number }>();
  text.split("\n").forEach((line, i) => {
    const m = /^\s*\$([\w-]+)\s*:\s*([^;]+?)\s*(?:!default|!global)*\s*;/.exec(line);
    if (m && !raw.has(m[1] as string)) raw.set(m[1] as string, { value: m[2] as string, line: i + 1 });
  });
  const out: FileToken[] = [];
  for (const [name, { value, line }] of raw) {
    // A function of a variable (`darken($brand, 10%)`), or a map: Sass computes it, the page can't use it as is.
    if (/[\w-]\([^)]*\$|map-get|\bif\(|^\(/.test(value)) continue;
    const resolved = resolve(value, (ref) => raw.get(ref)?.value, /\$([\w-]+)/g);
    if (resolved === null || resolved.includes("$")) continue;
    out.push({ name: `$${name}`, value: resolved, file, line });
  }
  return out;
}

/** `value` with its references (`pattern`'s group 1, looked up with `get`) replaced, a few levels deep; null when one can't be. */
function resolve(value: string, get: (ref: string) => string | undefined, pattern: RegExp): string | null {
  let v = value;
  for (let depth = 0; depth < 8; depth++) {
    let missing = false;
    const next = v.replace(pattern, (_, ref: string) => {
      const found = get(ref);
      if (found === undefined) missing = true;
      return found ?? "";
    });
    if (missing) return null;
    if (next === v) return v.trim();
    v = next;
  }
  return null;
}
