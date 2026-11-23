import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Job, StyleChange, WidthRange } from "@pilot/protocol";
import { styleFiles } from "./sources.ts";

/**
 * What the agent would otherwise work out about the project before an edit,
 * found by Pilot and put in the job's prompt ("The project"): which Tailwind
 * it uses and where its theme is, the class for each changed value in the
 * project's own scale (`gap: 48px` → `gap-12`), and that its CSS is rebuilt
 * on save (so the agent doesn't check the compiled file). Each saves the
 * agent a step or two: reading the theme, the scale's math, a look at the
 * build. Tailwind 4 only (its theme is CSS Pilot can read; a Tailwind 3
 * config is code); nothing is said for other projects.
 */

/** A root font size: rem values in px. */
const REM = 16;

/** Tailwind 4's default scales (its `theme.css`), for a project whose `node_modules` doesn't have it. */
const DEFAULTS = new Map<string, string>(
  Object.entries({
    spacing: "0.25rem",
    ...prefixed("breakpoint", { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem" }),
    ...prefixed("container", {
      "3xs": "16rem",
      "2xs": "18rem",
      xs: "20rem",
      sm: "24rem",
      md: "28rem",
      lg: "32rem",
      xl: "36rem",
      "2xl": "42rem",
      "3xl": "48rem",
      "4xl": "56rem",
      "5xl": "64rem",
      "6xl": "72rem",
      "7xl": "80rem",
    }),
    ...prefixed("text", {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "3.75rem",
      "7xl": "4.5rem",
      "8xl": "6rem",
      "9xl": "8rem",
    }),
    ...prefixed("font-weight", {
      thin: "100",
      extralight: "200",
      light: "300",
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
      extrabold: "800",
      black: "900",
    }),
    ...prefixed("tracking", { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" }),
    ...prefixed("leading", { tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" }),
    ...prefixed("radius", { xs: "0.125rem", sm: "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", "4xl": "2rem" }),
  }),
);
function prefixed(namespace: string, values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [`${namespace}-${k}`, v]));
}

export interface Tailwind {
  /** The stylesheet that imports Tailwind, relative to the project's root. */
  entry: string;
  version?: string;
  /** Its theme: Tailwind's defaults, then the project's `@theme`, by variable name without `--`. */
  theme: Map<string, string>;
  /** How its CSS gets rebuilt on save: `npm run dev`, a dev server's plugin. */
  rebuild?: string;
}

/** The project's Tailwind 4 for a job: the entry nearest the job's files (where its code probably is), else the page's folder's, else the first. */
export function tailwindOf(root: string, near: string[] = [], url?: string): Tailwind | null {
  const entries = styleFiles(root).filter((f) => importsTailwind(f));
  if (!entries.length) return null;
  const route = routeParts(url);
  const closeness = (entry: string) => {
    const dir = relative(root, dirname(entry)).split(sep).filter(Boolean);
    const shared = (file: string) => {
      const parts = file.split(/[\\/]/);
      let n = 0;
      while (n < dir.length && dir[n] === parts[n]) n++;
      return n;
    };
    return Math.max(0, ...near.map(shared)) * 10 + (route.includes(dir[0] ?? "") ? 1 : 0);
  };
  const entry = [...entries].sort((a, b) => closeness(b) - closeness(a))[0] as string;
  const pkg = nearestPackage(dirname(entry), root);
  const version = installedVersion(dirname(entry), root) ?? declaredVersion(pkg);
  if (version && !version.replace(/^[^\d]*/, "").startsWith("4")) return null;
  const theme = new Map<string, string>();
  const defaults = findUp(dirname(entry), root, join("node_modules", "tailwindcss", "theme.css"));
  if (defaults) readTheme(defaults, theme, 0);
  else for (const [k, v] of DEFAULTS) theme.set(k, v); // Not installed yet: Tailwind 4's own scales (its colors left out).
  readTheme(entry, theme, 0);
  const rebuild = rebuildOf(pkg, root);
  return { entry: relative(root, entry), ...(version ? { version } : {}), theme, ...(rebuild ? { rebuild } : {}) };
}

function importsTailwind(file: string): boolean {
  try {
    return /@import\s+(url\()?["']tailwindcss["']/.test(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function routeParts(url?: string): string[] {
  try {
    return url ? new URL(url).pathname.split("/").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** A file up from `dir` to `root` (and the root's), or null. */
function findUp(dir: string, root: string, name: string): string | null {
  for (let d = resolve(dir); ; d = dirname(d)) {
    const path = join(d, name);
    if (existsSync(path)) return path;
    if (d === resolve(root) || d === dirname(d)) return null;
  }
}

function nearestPackage(dir: string, root: string): string | null {
  return findUp(dir, root, "package.json");
}

function installedVersion(dir: string, root: string): string | undefined {
  const pkg = findUp(dir, root, join("node_modules", "tailwindcss", "package.json"));
  try {
    return pkg ? (JSON.parse(readFileSync(pkg, "utf8")) as { version?: string }).version : undefined;
  } catch {
    return undefined;
  }
}

function declaredVersion(pkg: string | null): string | undefined {
  try {
    if (!pkg) return undefined;
    const p = JSON.parse(readFileSync(pkg, "utf8")) as Record<string, Record<string, string> | undefined>;
    return p.dependencies?.tailwindcss ?? p.devDependencies?.tailwindcss;
  } catch {
    return undefined;
  }
}

/** Reads `@theme` blocks' variables into `theme` (later ones win, `--x-*: initial` clears a namespace), following local `@import`s. */
function readTheme(file: string, theme: Map<string, string>, depth: number): void {
  let css: string;
  try {
    css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  } catch {
    return;
  }
  if (depth < 3)
    for (const m of css.matchAll(/@import\s+(?:url\()?["'](\.{1,2}\/[^"']+\.css)["']/g)) readTheme(resolve(dirname(file), m[1] as string), theme, depth + 1);
  for (const block of themeBlocks(css)) {
    for (const m of block.matchAll(/--([\w-]+|\*)(-\*)?\s*:\s*([^;]+);/g)) {
      const name = m[1] as string;
      const value = (m[3] as string).replace(/\s+/g, " ").trim();
      if (value === "initial" && (m[2] || name === "*")) {
        for (const key of [...theme.keys()]) if (name === "*" || key.startsWith(`${name}-`)) theme.delete(key);
        continue;
      }
      theme.set(name, value);
    }
  }
}

/** The insides of a stylesheet's `@theme { … }` blocks (`@theme inline`, `@theme default` too). */
function themeBlocks(css: string): string[] {
  const blocks: string[] = [];
  for (const m of css.matchAll(/@theme\b[^{]*\{/g)) {
    let depth = 1;
    let i = (m.index as number) + m[0].length;
    const start = i;
    for (; i < css.length && depth; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

/** How the project's CSS is rebuilt on save: its script that watches Tailwind (and the one that runs it), or its dev server's Tailwind plugin. */
function rebuildOf(pkg: string | null, root: string): string | undefined {
  const scriptsOf = (file: string | null) => {
    try {
      return file ? ((JSON.parse(readFileSync(file, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {}) : {};
    } catch {
      return {};
    }
  };
  const depsOf = (file: string | null) => {
    try {
      const p = file ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string> | undefined>) : {};
      return { ...p.dependencies, ...p.devDependencies };
    } catch {
      return {};
    }
  };
  for (const file of [pkg, join(root, "package.json")]) {
    const scripts = scriptsOf(file);
    const watch = Object.entries(scripts).find(([, cmd]) => /\btailwindcss\b/.test(cmd) && /(--watch|\s-w)\b/.test(cmd));
    if (watch) {
      const [name] = watch;
      const runner = Object.entries(scripts).find(([, cmd]) => new RegExp(`(npm run|pnpm( run)?|yarn|bun run|npm:)\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(cmd));
      const where = file === pkg && pkg && dirname(pkg) !== resolve(root) ? ` in \`${relative(root, dirname(pkg))}\`` : "";
      return runner ? `\`npm run ${runner[0]}\`${where} (its \`${name}\`)` : `\`npm run ${name}\`${where}`;
    }
    const deps = depsOf(file);
    if (deps["@tailwindcss/vite"] || deps["@tailwindcss/postcss"]) return "the dev server";
  }
  return undefined;
}

/** A CSS length in px, when it's one (`3rem`, `calc(0.5rem * var(--m, 1))`), resolving the theme's variables. */
export function toPx(value: string, theme: Map<string, string>, depth = 0): number | null {
  const v = value.trim();
  if (depth > 5) return null;
  let m = /^(-?[\d.]+)(px|rem)?$/.exec(v);
  if (m) return m[2] === "rem" ? Number(m[1]) * REM : m[2] === "px" || Number(m[1]) === 0 ? Number(m[1]) : null;
  m = /^var\(--([\w-]+)(?:\s*,\s*(.+))?\)$/.exec(v);
  if (m) {
    const own = theme.get(m[1] as string);
    return own !== undefined ? toPx(own, theme, depth + 1) : m[2] ? toPx(m[2], theme, depth + 1) : null;
  }
  m = /^calc\((.+)\)$/.exec(v);
  if (m) {
    // `a * b` or `a / b`, one length and numbers: what themes use (`calc(0.25rem * var(--m, 1))`).
    const parts = (m[1] as string).split(/\s*([*/])\s*/);
    let px: number | null = null;
    let factor = 1;
    for (let i = 0; i < parts.length; i += 2) {
      const part = (parts[i] as string).trim();
      const op = i ? parts[i - 1] : "*";
      const resolved = /^var\(/.test(part) ? (theme.get(/^var\(--([\w-]+)/.exec(part)?.[1] ?? "") ?? /,\s*(.+)\)$/.exec(part)?.[1] ?? "") : part;
      const n = /^-?[\d.]+$/.test(resolved.trim()) ? Number(resolved) : null;
      const len = n === null ? toPx(resolved, theme, depth + 1) : null;
      if (n !== null) factor = op === "/" ? factor / n : factor * n;
      else if (len !== null && px === null && op === "*") px = len;
      else return null;
    }
    return px === null ? null : px * factor;
  }
  return null;
}

/** A color as `#rrggbb` and its alpha (0–1), when it's hex or rgb(). */
function rgbOf(value: string): { hex: string; alpha: number } | null {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1] as string;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { hex: `#${h.slice(0, 6)}`, alpha: h.length === 8 ? Number.parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    const hex = `#${[m[1], m[2], m[3]].map((c) => Math.round(Number(c)).toString(16).padStart(2, "0")).join("")}`;
    const a = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    return { hex, alpha: a };
  }
  return null;
}

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Properties whose values are the spacing scale (`--spacing` steps), by their utility. */
const SPACING: Record<string, string> = {
  padding: "p",
  "padding-top": "pt",
  "padding-right": "pr",
  "padding-bottom": "pb",
  "padding-left": "pl",
  "padding-inline": "px",
  "padding-block": "py",
  "padding-inline-start": "ps",
  "padding-inline-end": "pe",
  margin: "m",
  "margin-top": "mt",
  "margin-right": "mr",
  "margin-bottom": "mb",
  "margin-left": "ml",
  "margin-inline": "mx",
  "margin-block": "my",
  "margin-inline-start": "ms",
  "margin-inline-end": "me",
  gap: "gap",
  "row-gap": "gap-y",
  "column-gap": "gap-x",
  width: "w",
  height: "h",
  "min-width": "min-w",
  "max-width": "max-w",
  "min-height": "min-h",
  "max-height": "max-h",
  inset: "inset",
  "inset-inline": "inset-x",
  "inset-block": "inset-y",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  "text-indent": "indent",
};
/** Color properties, by their utility. */
const COLORS: Record<string, string> = {
  color: "text",
  "background-color": "bg",
  "border-color": "border",
  "border-top-color": "border-t",
  "border-right-color": "border-r",
  "border-bottom-color": "border-b",
  "border-left-color": "border-l",
  "outline-color": "outline",
  fill: "fill",
  stroke: "stroke",
  "text-decoration-color": "decoration",
  "accent-color": "accent",
  "caret-color": "caret",
};
/** Properties with a named scale in the theme: utility, the theme's namespace. */
const NAMED: Record<string, [string, string]> = {
  "border-radius": ["rounded", "radius"],
  "border-top-left-radius": ["rounded-tl", "radius"],
  "border-top-right-radius": ["rounded-tr", "radius"],
  "border-bottom-right-radius": ["rounded-br", "radius"],
  "border-bottom-left-radius": ["rounded-bl", "radius"],
  "font-size": ["text", "text"],
  "font-weight": ["font", "font-weight"],
  "letter-spacing": ["tracking", "tracking"],
  "line-height": ["leading", "leading"],
  "box-shadow": ["shadow", "shadow"],
};

/** A theme's values in a namespace (`radius` → `lg: 0.5rem`), without sub-values (`text-sm--line-height`). */
function scale(theme: Map<string, string>, namespace: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of theme) {
    if (!key.startsWith(`${namespace}-`) || key.includes("--")) continue;
    const name = key.slice(namespace.length + 1);
    // `font-weight-*` isn't `font-*`'s; `text-shadow-*` isn't `text-*`'s.
    if (namespace === "text" && /^shadow/.test(name)) continue;
    out.push([name, value]);
  }
  return out;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/**
 * The Tailwind class for one change, in the project's theme, without its
 * width and state prefixes: exact (`gap-12`), or the scale's closest with the
 * exact arbitrary value (`text-sm` is 13px; `text-[14px]`); null when Pilot
 * can't tell (a keyword, a property it doesn't map).
 */
export function classFor(property: string, value: string, theme: Map<string, string>): { exact: string; closest?: { cls: string; px: number }; note?: string } | null {
  const v = value.trim();
  if (!v) return null;
  // A theme variable as is: its own utility (`var(--color-primary)` → `bg-primary`).
  const variable = /^var\(--([\w-]+)\)$/.exec(v)?.[1];
  const spacingUtility = SPACING[property];
  if (spacingUtility) {
    if (v === "auto") return { exact: `${spacingUtility}-auto` };
    if (v === "100%" && /^(w|h|min-w|max-w|min-h|max-h|inset|top|right|bottom|left)/.test(spacingUtility)) return { exact: `${spacingUtility}-full` };
    const frac = /^([\d.]+)%$/.exec(v);
    if (frac && /^[wh]$/.test(spacingUtility)) {
      const f = Number(frac[1]) / 100;
      for (let q = 2; q <= 12; q++) for (let p = 1; p < q; p++) if (Math.abs(p / q - f) < 0.0005) return { exact: `${spacingUtility}-${p}/${q}` };
    }
    if (spacingUtility === "max-w") {
      const named = scale(theme, "container").find(([, size]) => toPx(size, theme) === toPx(v, theme));
      if (named) return { exact: `max-w-${named[0]}` };
    }
    const n = toPx(v, theme);
    const step = toPx(theme.get("spacing") ?? "0.25rem", theme);
    if (n === null || !step) return null;
    const negative = n < 0 && /^(m|inset|top|right|bottom|left)/.test(spacingUtility) ? "-" : "";
    const steps = Math.abs(n) / step;
    if (Math.abs(n) === 1 && step !== 1) return { exact: `${negative}${spacingUtility}-px` };
    // Tailwind takes any step that's a multiple of 0.25 (`gap-10.5`).
    if (Math.abs(steps * 4 - Math.round(steps * 4)) < 1e-6) return { exact: `${negative}${spacingUtility}-${Math.round(steps * 100) / 100}` };
    return { exact: `${negative}${spacingUtility}-[${px(Math.abs(n))}]` };
  }
  const colorUtility = COLORS[property];
  if (colorUtility) {
    if (variable?.startsWith("color-")) return { exact: `${colorUtility}-${variable.slice(6)}` };
    if (/^(transparent|currentcolor|inherit)$/i.test(v)) return { exact: `${colorUtility}-${v.toLowerCase() === "currentcolor" ? "current" : v.toLowerCase()}` };
    const rgb = rgbOf(v);
    for (const [name, color] of scale(theme, "color")) {
      const own = rgbOf(color);
      if (rgb && own && own.hex === rgb.hex) {
        const alpha = Math.round(rgb.alpha * 100);
        return { exact: `${colorUtility}-${name}${alpha < 100 ? `/${alpha}` : ""}` };
      }
      if (!rgb && normal(color) === normal(v)) return { exact: `${colorUtility}-${name}` };
    }
    return { exact: `${colorUtility}-[${v.replace(/\s+/g, "_")}]`, note: "no color of the theme" };
  }
  if (property === "opacity") {
    const n = /^([\d.]+)(%)?$/.exec(v);
    if (n) return { exact: `opacity-${Math.round(Number(n[1]) * (n[2] ? 1 : 100))}` };
    return null;
  }
  if (property === "z-index" && /^-?\d+$/.test(v)) return { exact: `${v.startsWith("-") ? "-" : ""}z-${v.replace("-", "")}` };
  if (property === "font-family") {
    const first = normal(v.split(",")[0] as string).replace(/["']/g, "");
    const named = scale(theme, "font").find(([name, family]) => !name.startsWith("weight") && normal(family.split(",")[0] as string).replace(/["']/g, "") === first);
    return named ? { exact: `font-${named[0]}` } : null;
  }
  const named = NAMED[property];
  if (!named) return null;
  const [utility, namespace] = named;
  if (variable?.startsWith(`${namespace}-`)) return { exact: `${utility}-${variable.slice(namespace.length + 1)}` };
  const values = scale(theme, namespace);
  if (namespace === "shadow") {
    const same = values.find(([, s]) => normal(s) === normal(v));
    return same ? { exact: `shadow-${same[0]}` } : null;
  }
  if (namespace === "radius") {
    if (/^(0|0px)$/.test(v)) return { exact: `${utility}-none` };
    if (/^(9999px|calc\(infinity \* 1px\)|50%)$/.test(v)) return { exact: `${utility}-full` };
  }
  if (namespace === "tracking") {
    const same = values.find(([, s]) => s.trim() === v || (/^-?0(em)?$/.test(s.trim()) && /^-?0(em|px)?$/.test(v)));
    return same ? { exact: `tracking-${same[0]}` } : { exact: `tracking-[${v}]` };
  }
  if (namespace === "font-weight" || namespace === "leading") {
    const same = values.find(([, s]) => s.trim() === v);
    if (same) return { exact: `${utility}-${same[0]}` };
    if (namespace === "font-weight") return /^\d+$/.test(v) ? { exact: `font-[${v}]` } : null;
    // A line height in px: the spacing scale (`leading-6`); unitless: arbitrary.
    const n = toPx(v, theme);
    const step = toPx(theme.get("spacing") ?? "0.25rem", theme);
    if (n !== null && step && Math.abs((n / step) * 4 - Math.round((n / step) * 4)) < 1e-6) return { exact: `leading-${Math.round((n / step) * 100) / 100}` };
    return { exact: `leading-[${v}]` };
  }
  const n = toPx(v, theme);
  if (n === null) return null;
  let best: { name: string; px: number } | null = null;
  for (const [name, size] of values) {
    const p = toPx(size, theme);
    if (p === null) continue;
    if (Math.abs(p - n) < 0.01) return { exact: `${utility}-${name}` };
    if (!best || Math.abs(p - n) < Math.abs(best.px - n)) best = { name, px: p };
  }
  const arbitrary = `${utility}-[${px(n)}]`;
  return best ? { exact: arbitrary, closest: { cls: `${utility}-${best.name}`, px: best.px } } : { exact: arbitrary };
}

/** The variants before a class: its widths in the theme's breakpoints (`md:`, `max-lg:`, else `min-[900px]:`), then its states (`hover:`). */
export function prefixFor(change: Pick<StyleChange, "widths" | "states">, theme: Map<string, string>): string {
  const widths: WidthRange | undefined = change.widths;
  const points = scale(theme, "breakpoint")
    .map(([name, size]) => ({ name, px: toPx(size, theme) }))
    .filter((b): b is { name: string; px: number } => b.px !== null);
  let prefix = "";
  if (widths?.min !== undefined) prefix += `${points.find((b) => b.px === widths.min)?.name ?? `min-[${widths.min}px]`}:`;
  if (widths?.max !== undefined) {
    const at = points.find((b) => b.px === (widths.max as number) + 1);
    prefix += `max-${at ? at.name : `[${(widths.max as number) + 1}px]`}:`;
  }
  for (const s of change.states ?? []) prefix += `${s}:`;
  return prefix;
}

/**
 * The job's "The project" section, for its prompt: the project's Tailwind,
 * the class for each of its changes, and how its CSS is rebuilt; empty when
 * the project doesn't use Tailwind 4 (or the job changes nothing it maps).
 * `near`: the files where the job's code probably is.
 */
export function factsSection(job: Job, root: string, near: string[] = []): string {
  let tw: Tailwind | null;
  try {
    tw = tailwindOf(root, near, job.changeSet.page?.url);
  } catch {
    return "";
  }
  if (!tw) return "";
  const step = toPx(tw.theme.get("spacing") ?? "0.25rem", tw.theme);
  const lines = [
    `- Tailwind CSS ${tw.version?.replace(/^[^\d]*/, "") ?? "4"}, its theme in \`${tw.entry}\` (\`@theme\`) and Tailwind's defaults; spacing steps of ${step ? px(step) : "0.25rem"} (\`--spacing\`).`,
  ];
  const seen = new Set<string>();
  for (const edit of job.changeSet.edits) {
    for (const change of edit.changes) {
      if (change.removed) continue;
      const cls = classFor(change.property, change.to, tw.theme);
      if (!cls) continue;
      const prefix = prefixFor(change, tw.theme);
      const line = `- \`${change.property}: ${change.to}\`${prefix ? ` (${prefix.slice(0, -1).replaceAll(":", ", ")})` : ""} is \`${prefix}${cls.exact}\`${cls.closest ? `, no step of the scale; its closest is \`${prefix}${cls.closest.cls}\` (${px(cls.closest.px)})` : ""}${cls.note ? ` (${cls.note})` : ""}.`;
      if (!seen.has(line)) lines.push(line);
      seen.add(line);
    }
  }
  if (tw.rebuild) lines.push(`- Its CSS is rebuilt on save by ${tw.rebuild}, so a new class works at once: don't build it or check the compiled CSS.`);
  return ["## The project", "", ...lines].join("\n");
}
