import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { sourceFiles, styleFiles } from "./sources.ts";

/**
 * Where a value the page reports (its CSS rule's selector, `.btn--primary`)
 * is written in the project's own stylesheets: plain CSS, Sass, Less, a CSS
 * module, a Vue or Svelte file's `<style>`. Every project styled with CSS has
 * this, whatever its tools; Tailwind's utilities have no rule of their own in
 * the code, so nothing is found for them (facts.ts says their class instead).
 *
 * Stylesheets are read into rules with their full selectors, nesting resolved
 * (`.btn { &--primary {…} }` is `.btn--primary`), and their declarations'
 * lines. The page's compiled CSS is in the project too, so a source
 * (`buttons.scss`) wins over plain CSS with the same rule (`buttons.css`),
 * then the one nearest the element's code.
 */

export interface StyleRule {
  /** Relative to the project's root. */
  file: string;
  /** 1-based: the selector's line. */
  line: number;
  /** Its selectors, nesting resolved, spaces normalized. */
  selectors: string[];
  declarations: Array<{ property: string; value: string; line: number }>;
  /** The `@media` it sits in, when any. */
  media?: string;
}

/** Stylesheets (component files with a `<style>` are read apart). */
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less", ".styl"]);
const PREPROCESSED = new Set([".scss", ".sass", ".less", ".styl"]);
/** At-rules whose blocks hold templates, not rules (a mixin's selectors aren't any element's). */
const TEMPLATES = /^@(mixin|function|each|for|while|if|else|keyframes|-webkit-keyframes|font-face|property|page|counter-style|theme|utility|variant|custom-variant)\b/;

/** Rules per file, kept while the file is unchanged. */
const parsed = new Map<string, { mtime: number; size: number; rules: StyleRule[] }>();

function rulesOf(path: string, root: string): StyleRule[] {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  const known = parsed.get(path);
  if (known && known.mtime === stat.mtimeMs && known.size === stat.size) return known.rules;
  let rules: StyleRule[] = [];
  try {
    const text = readFileSync(path, "utf8");
    // A minified file is a build's output.
    if (!text.split("\n", 50).some((l) => l.length > 3000)) rules = parseStylesheet(text, relative(root, path));
  } catch {
    // Unreadable: no rules.
  }
  parsed.set(path, { mtime: stat.mtimeMs, size: stat.size, rules });
  return rules;
}

/** Comments blanked out (kept as spaces, so lines and columns stay): `/* … *\/`, and `//` lines in Sass and Less. */
function withoutComments(text: string, lineComments: boolean): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (quote) {
      out += ch;
      if (ch === "\\") out += text[++i] ?? "";
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop - 1;
      continue;
    }
    // `//` starts a comment, not in a URL (`http://`).
    if (lineComments && ch === "/" && text[i + 1] === "/" && text[i - 1] !== ":") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      out += " ".repeat(stop - i);
      i = stop - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Splits on `sep` outside parentheses and brackets (a selector list's commas, not `:is(a, b)`'s). */
export function splitTopLevel(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A selector as compared: spaces collapsed, none around combinators. */
export function normalSelector(selector: string): string {
  return (
    selector
      .replace(/\s+/g, " ")
      .replace(/\s*([>+~])\s*/g, "$1")
      // An attribute's value with or without quotes, as compilers write it either way (`[type="text"]`, `[type=text]`).
      .replace(/\[\s*([\w-]+)\s*([~|^$*]?=)\s*(["'])([\w-]+)\3\s*\]/g, "[$1$2$4]")
      .replace(/\[\s*([\w-]+)\s*\]/g, "[$1]")
      .trim()
  );
}

/** Nested selectors resolved against their parents' (`&` where it is, else a descendant). */
function resolve(parents: string[], own: string[]): string[] {
  if (!parents.length) return own;
  const out: string[] = [];
  for (const p of parents) for (const s of own) out.push(s.includes("&") ? s.replaceAll("&", p) : `${p} ${s}`);
  return out;
}

/** A stylesheet's rules (CSS, Sass's SCSS syntax, Less): each block's selectors, nesting resolved, and its declarations. */
export function parseStylesheet(text: string, file: string): StyleRule[] {
  const ext = extname(file);
  const css = withoutComments(text, ext !== ".css");
  const rules: StyleRule[] = [];
  // Each open block: a rule (its selectors), an at-rule that keeps its parents' (`@media`), or a template's (skipped).
  const stack: Array<{ selectors: string[]; rule?: StyleRule; media?: string; template?: boolean }> = [];
  let start = 0;
  let line = 1;
  let startLine = 1;
  const top = () => stack[stack.length - 1];
  const inTemplate = () => stack.some((b) => b.template);
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "\n") line++;
    // Sass interpolation `#{…}` isn't a block.
    if (ch === "{" && css[i - 1] === "#") {
      const close = css.indexOf("}", i);
      if (close > 0) {
        line += (css.slice(i, close).match(/\n/g) ?? []).length;
        i = close;
      }
      continue;
    }
    if (ch === "{") {
      const prelude = css.slice(start, i).trim();
      const preludeLine = startLine + (css.slice(start, i).match(/^\s*/)?.[0].match(/\n/g) ?? []).length;
      const parent = top();
      if (prelude.startsWith("@")) {
        const own = /^@media\s+(.+)$/.exec(prelude)?.[1]?.trim();
        const media = own && parent?.media ? `${parent.media} and ${own}` : (own ?? parent?.media);
        const template = TEMPLATES.test(prelude);
        // Inside a rule, its declarations are that rule's, in this @media: a rule of its own.
        const rule: StyleRule | undefined =
          parent?.rule && own ? { file, line: preludeLine, selectors: parent.selectors, declarations: [], ...(media ? { media } : {}) } : parent?.rule;
        if (rule && rule !== parent?.rule && !template && !inTemplate()) rules.push(rule);
        stack.push({ selectors: parent?.selectors ?? [], ...(rule ? { rule } : {}), ...(media ? { media } : {}), template });
      } else {
        const selectors = resolve(parent?.selectors ?? [], splitTopLevel(prelude, ",")).map(normalSelector);
        const rule: StyleRule = { file, line: preludeLine, selectors, declarations: [], ...(parent?.media ? { media: parent.media } : {}) };
        if (!inTemplate() && !/^(from|to|\d+%)$/.test(prelude)) rules.push(rule);
        stack.push({ selectors, rule, ...(parent?.media ? { media: parent.media } : {}) });
      }
      start = i + 1;
      startLine = line;
      continue;
    }
    if (ch === ";" || ch === "}") {
      const statement = css.slice(start, i);
      const m = /^\s*(-?[A-Za-z][\w-]*|--[\w-]+)\s*:(?!:)\s*([\s\S]+?)\s*$/.exec(statement);
      const block = top();
      if (m && block?.rule && !inTemplate()) {
        const at = startLine + (statement.match(/^\s*/)?.[0].match(/\n/g) ?? []).length;
        block.rule.declarations.push({ property: (m[1] as string).toLowerCase(), value: (m[2] as string).replace(/\s+/g, " "), line: at });
      }
      if (ch === "}") stack.pop();
      start = i + 1;
      startLine = line;
    }
  }
  return rules;
}

/** The `<style>` blocks of a component file (Vue, Svelte, Astro), parsed with their lines in the file. */
function componentStyles(path: string, root: string): StyleRule[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: StyleRule[] = [];
  for (const m of text.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/g)) {
    const before = text.slice(0, (m.index as number) + m[0].indexOf(">") + 1);
    const offset = (before.match(/\n/g) ?? []).length;
    const lang = /lang=["'](\w+)["']/.exec(m[1] as string)?.[1] ?? "css";
    const file = relative(root, path);
    for (const r of parseStylesheet(m[2] as string, `${file}.${lang}`))
      out.push({ ...r, file, line: r.line + offset, declarations: r.declarations.map((d) => ({ ...d, line: d.line + offset })) });
  }
  return out;
}

/**
 * A CSS module's class as written (`primary`), from the page's hashed one:
 * `Button_primary__a1B2c` (Next, webpack: the file's name, then the class), `_primary_x7k2p_12` (Vite in dev).
 */
export function moduleClass(hashed: string): { local: string; file?: string } | null {
  let m = /^([A-Za-z][\w-]*?)_([\w-]+?)__[\w-]{5,}$/.exec(hashed);
  if (m) return { file: m[1] as string, local: m[2] as string };
  m = /^_([\w-]+?)_[a-z0-9]{5,}(_\d+)?$/.exec(hashed);
  if (m) return { local: m[1] as string };
  return null;
}

/** The page's selector with each CSS module class as written, and the module's name when the page says it. */
function asWritten(selector: string): { selector: string; module?: string; hashed: boolean } {
  let module: string | undefined;
  let hashed = false;
  const out = selector.replace(/\.(-?[_A-Za-z][\w-]*)/g, (whole, cls: string) => {
    const m = moduleClass(cls);
    if (!m) return whole;
    hashed = true;
    module = module ?? m.file;
    return `.${m.local}`;
  });
  return { selector: normalSelector(out), ...(module ? { module } : {}), hashed };
}

/** Reads the project's stylesheets ahead of the first job (`npx usepilot` starting), as warmSources does its markup. */
export function warmStyles(root: string): void {
  for (const path of styleFiles(root)) if (STYLE_EXTENSIONS.has(extname(path))) rulesOf(path, root);
}

export interface RuleSource {
  rule: StyleRule;
  /** The declaration of the property in it, when the rule declares it as written (not through a mixin). */
  declaration?: { property: string; value: string; line: number };
}

/**
 * Where the rule the page reports for `property` is written: its file and
 * line, and the declaration's. `near`: the files of the element's code, to
 * pick among copies. Null when no stylesheet of the project has it.
 */
export function ruleSource(selector: string, property: string, root: string, near: string[] = [], media?: string): RuleSource | null {
  const wanted = asWritten(selector);
  const files = styleFiles(root);
  const found: RuleSource[] = [];
  const consider = (rules: StyleRule[]) => {
    for (const rule of rules) {
      if (!rule.selectors.includes(wanted.selector)) continue;
      const declaration = [...rule.declarations].reverse().find((d) => d.property === property || shorthandOf(property).includes(d.property));
      found.push({ rule, ...(declaration ? { declaration } : {}) });
    }
  };
  const sources = new Set(files.filter((f) => PREPROCESSED.has(extname(f))).map((f) => basename(f).replace(/^_/, "").replace(/\.\w+$/, "")));
  for (const path of files) {
    const ext = extname(path);
    if (!STYLE_EXTENSIONS.has(ext)) continue;
    if (ext === ".css" && compiled(path, sources)) continue;
    // A hashed class is a CSS module's: only module files (`Button.module.css`), the named one when said.
    if (wanted.hashed && !/\.module\.\w+$/.test(path)) continue;
    if (wanted.module && !basename(path).startsWith(`${wanted.module}.`)) continue;
    consider(rulesOf(path, root));
  }
  if (!found.length && !wanted.hashed) {
    for (const path of sourceFiles(root)) if (/\.(vue|svelte|astro)$/.test(path)) consider(componentStyles(path, root));
  }
  // Where the element's code is known, its rule is in the same site (the nearest folder above it with an index
  // file or a package.json): not a copy in another demo or site folder.
  const sites = new Set(near.map((f) => siteOf(f, root)));
  const kept = sites.size ? found.filter((s) => sites.has(siteOf(s.rule.file, root))) : found;
  if (!kept.length) return null;
  // Not known: copies in several sites are as likely, none said.
  if (!sites.size && new Set(kept.map((s) => siteOf(s.rule.file, root))).size > 1) return null;
  const score = (s: RuleSource) => {
    const ext = extname(s.rule.file);
    const dir = s.rule.file.split(/[\\/]/).slice(0, -1);
    const shared = Math.max(
      0,
      ...near.map((f) => {
        const parts = f.split(/[\\/]/);
        let n = 0;
        while (n < dir.length && dir[n] === parts[n]) n++;
        return n;
      }),
    );
    return (PREPROCESSED.has(ext) || !STYLE_EXTENSIONS.has(ext) ? 100 : 0) + (s.declaration ? 50 : 0) + ((s.rule.media ?? "") === (media ?? "") ? 20 : 0) + shared;
  };
  return kept.sort((a, b) => score(b) - score(a))[0] as RuleSource;
}

/** What makes a folder a site, or a package, of its own. */
const SITE_FILES = ["index.html", "index.htm", "index.php", "package.json"];
const siteCache = new Map<string, string>();

/** The site a file is part of: the nearest folder above it (relative to the project's root) with an index file or a package.json; "" for the root. */
export function siteOf(file: string, root: string): string {
  const parts = file.split(/[\\/]/).slice(0, -1);
  for (let n = parts.length; n > 0; n--) {
    const dir = parts.slice(0, n).join("/");
    const key = `${root}\0${dir}`;
    let site = siteCache.get(key);
    if (site === undefined) {
      site = SITE_FILES.some((f) => existsSync(join(root, dir, f))) ? dir : "";
      siteCache.set(key, site);
    }
    if (site) return site;
  }
  return "";
}

/**
 * A stylesheet a build wrote (its source is Sass, Less, or a loop in them):
 * one with a source map, or a preprocessor file of the same name in the
 * project (`buttons.scss` for `buttons.css`). Its rules aren't where to edit.
 */
function compiled(path: string, sources: Set<string>): boolean {
  if (existsSync(`${path}.map`)) return true;
  if (sources.has(basename(path, ".css"))) return true;
  try {
    const text = readFileSync(path, "utf8");
    return /\/\*#\s*sourceMappingURL=/.test(text.slice(-500));
  } catch {
    return false;
  }
}

/** The shorthands that set a property too (`padding` for `padding-top`), so a rule's `padding:` is where `padding-top` comes from. */
function shorthandOf(property: string): string[] {
  const out: string[] = [];
  const m = /^(padding|margin|inset|border|border-radius|gap|flex|grid|font|background|outline|transition|animation)/.exec(property);
  if (m && m[1] !== property) out.push(m[1] as string);
  if (/^(row|column)-gap$/.test(property)) out.push("gap");
  if (/^(padding|margin)-(inline|block)/.test(property)) out.push(property.replace(/-(start|end)$/, ""));
  if (property === "background-color") out.push("background");
  return out;
}
