import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import type { AgentRequest, CommentReference, ElementTarget, Job } from "@pilot/protocol";
import { requestTargets } from "@pilot/protocol";
import { workspaceRoot } from "./components.ts";
import { markupSources, type Source, sourceFiles, wordsOf } from "./sources.ts";

/**
 * Where an element's code probably is, found by Pilot before the agent gets
 * the job, so it can go straight to the edit instead of searching: Pilot's
 * process (`npx usepilot`) runs in the project's folder, and a search of its
 * files (read once, sources.ts) takes milliseconds, with no model involved.
 *
 * No one detail is reliable (classes repeat, text comes from data, markup is
 * copied), so each tag in the code is weighed on all the page sent
 * (ElementTarget.context): its classes by how rare they are, and against it
 * when they contradict; its texts and attributes in its contents; the texts
 * beside it and its section's heading; its parents; the page's address. A
 * place is said when it's convincing and clearly ahead of the next; two alike
 * are both said, more none: a wrong guess costs the agent more than a search.
 * Measured on labeled copies of real projects (locate.accuracy.test.ts).
 */

export interface Location {
  /** Relative to the project's root. */
  file: string;
  /** 1-based. */
  line: number;
  /** The lines around it, for the agent to edit without opening the file first. */
  snippet: string;
  /** A second place as likely (copies of the same markup): the agent looks at both. */
  also?: Omit<Location, "also">;
}

/** Escapes text for a RegExp. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The whole search, all of a job's elements, stops after this (reading the project the first time isn't counted: warmSources). */
const BUDGET_MS = 800;
/** Files looked at line by line, the ones sharing most with the element. */
const CANDIDATE_FILES = 60;
/** How far a parent's tag may be above the element's. */
const PARENT_LINES = 400;
/** How far an element's contents may go below its tag. */
const BODY_LINES = 80;
/** How far the texts beside it on the page may be from it in the code. */
const NEAR_LINES = 30;

export { sourceFiles } from "./sources.ts";

/** A project's root that's worth searching: one with a package.json or a .git, never a home folder by accident. */
export function searchable(cwd: string): boolean {
  return existsSync(join(cwd, "package.json")) || existsSync(join(cwd, ".git"));
}

/** Text as a page shows it: entities decoded, quotes plain, spaces collapsed. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  rsquo: "'",
  lsquo: "'",
  ldquo: '"',
  rdquo: '"',
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  reg: "®",
  trade: "™",
  times: "×",
  middot: "·",
  rarr: "→",
  larr: "←",
};
function plain(s: string): string {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ");
}

/** The tags starting on a line of code: `<div`, `<Button`, `<my-el`, with their column. */
function* tagsOn(line: string): Generator<{ name: string; column: number }> {
  const re = /<([A-Za-z][\w.:-]*)(?=[\s>/]|$)/g;
  for (let m = re.exec(line); m; m = re.exec(line)) yield { name: m[1] as string, column: m.index };
}
const indentOf = (line: string) => (/^\s*/.exec(line) as RegExpExecArray)[0].length;
/** A plain tag (`div`), not a component's (`Button`, `ui.Card`): it renders as itself. */
const isPlain = (name: string) => name === name.toLowerCase() && !name.includes(".");

interface Needles {
  tag: string;
  id?: string;
  classes: string[];
  /** The element's own text and the texts inside it, as the page shows them. */
  texts: string[];
  attrs: string[];
  /** The texts right before and after it on the page, and its section's heading. */
  before?: string;
  after?: string;
  heading?: string;
  parents: Array<{ tag: string; id?: string; classes: string[] }>;
  /** The page's path, in parts (`web-3`, `pricing`): a file named after them is likelier. */
  route: string[];
  /** The project's folder the page's path names (`web-3` for `/web-3/pricing`), when it names one: the site served from it. */
  served?: string;
  /** The project's other folders that are sites of their own (an index file in them: `web-2`, an older copy): they can't render this page. */
  otherSites: Set<string>;
  /** The element's own text, whole (not cut by the page): a place whose code writes another text isn't it. */
  own?: string;
  /** The element has no text at all on the page. */
  empty: boolean;
  /** How rare a word is in the project, 0 (everywhere) to 6 (one file). */
  rarity: (word: string) => number;
}

function needlesOf(target: ElementTarget, url: string | undefined, root: string, rarity: (w: string) => number): Needles {
  const own = target.text?.replace(/…$/, "").trim();
  const texts: string[] = [];
  const usable = (t: string | undefined) => {
    const text = t ? plain(t).trim() : "";
    return text.length >= 2 && text.length <= 80 ? text : undefined;
  };
  for (const t of [own, ...(target.context?.texts ?? [])]) {
    const text = usable(t);
    if (text && !texts.includes(text)) texts.push(text);
  }
  let route: string[] = [];
  try {
    if (url)
      route = new URL(url).pathname
        .split("/")
        .map((p) => decodeURIComponent(p).replace(/\.[a-z]+$/i, ""))
        .filter((p) => p && p !== "index");
  } catch {
    // Not a URL.
  }
  const served = route.find((p) => !/[\\/]|^\.+$/.test(p) && isFolder(join(root, p)));
  const otherSites = new Set<string>();
  if (served)
    for (const name of safeList(root))
      if (name !== served && INDEX_FILES.some((f) => existsSync(join(root, name, f)))) otherSites.add(name);
  const before = usable(target.context?.before);
  const after = usable(target.context?.after);
  const heading = usable(target.context?.heading);
  return {
    tag: target.tag.toLowerCase(),
    ...(target.id ? { id: target.id } : {}),
    classes: target.classes.filter((c) => c.length >= 2),
    texts,
    attrs: (target.context?.attrs ?? []).map(plain),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(heading ? { heading } : {}),
    parents: target.context?.parents ?? [],
    route,
    ...(served ? { served } : {}),
    otherSites,
    empty: !own && !texts.length && !!target.context,
    ...(own && !target.text?.endsWith("…") ? { own: plain(own).trim() } : {}),
    rarity,
  };
}

/** How rare a text is: its rarest word, more so the longer it is. */
function textWeight(n: Needles, text: string): number {
  const words = wordsOf(text);
  if (!words.length) return 0;
  const rarest = Math.max(...words.map(n.rarity));
  return Math.min(8, Math.max(0.5, rarest) + Math.min(3, (words.length - 1) * 0.5));
}

/**
 * Whether `body` holds `text`: 1 when whole, less when only part of a long
 * one is (it starts or ends with what the code writes from data, `<?php echo
 * $count ?> icons crafted…`), 0 when not.
 */
function textFound(body: string, text: string): number {
  if (body.includes(text)) return 1;
  const words = text.split(" ");
  if (words.length < 6) return 0;
  const run = (from: number) => words.slice(from, from + 5).join(" ");
  return body.includes(run(1)) || body.includes(run(words.length - 6)) || body.includes(run(words.length >> 1)) ? 0.7 : 0;
}

/** The text some code writes as is, outside its tags and template code (`{name}`, `<?php echo $name ?>`). */
function writtenText(code: string): string {
  return plain(
    code
      .replace(/<\?[\s\S]*?(\?>|$)|<%[\s\S]*?(%>|$)|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{[^}]*\}/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/?[A-Za-z][^>]*>?/g, " "),
  ).trim();
}

/** A tag's opening in the code, from `<` to its `>` (quotes, `{…}` and `<?php … ?>` skipped), and the line it ends on. */
function openingAt(lines: string[], index: number, column: number): { text: string; end: number } {
  let text = "";
  let quote = "";
  let braces = 0;
  for (let j = index; j < Math.min(lines.length, index + 16); j++) {
    const line = j === index ? (lines[j] as string).slice(column) : (lines[j] as string);
    for (let k = j === index ? 1 : 0; k < line.length; k++) {
      const ch = line[k] as string;
      if (ch === "<" && (line[k + 1] === "?" || line[k + 1] === "%")) {
        // A template's own code inside the tag: skipped to its end.
        const close = line.indexOf(line[k + 1] === "?" ? "?>" : "%>", k + 2);
        if (close < 0) break;
        k = close + 1;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") braces++;
      else if (ch === "}") braces = Math.max(0, braces - 1);
      else if (ch === ">" && !braces) return { text: text + line.slice(0, k + 1), end: j };
    }
    text += `${line}\n`;
  }
  return { text, end: index };
}

/** The class names a tag's code writes: as is (`class="a b"`), or within template code (`class="a <?php …?>"`, `className={cn("a", …)}`). */
function classAttrOf(opening: string): { words: string[]; dynamic: boolean } | null {
  const re = /(?<![\w-]):?(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|\{([\s\S]*?)\}(?=\s|\/?>|$))/g;
  let words: string[] | null = null;
  let dynamic = false;
  for (let m = re.exec(opening); m; m = re.exec(opening)) {
    const quoted = m[1] ?? m[2] ?? m[3];
    let value: string;
    if (quoted !== undefined && !m[0].startsWith(":")) {
      value = quoted.replace(/<\?[\s\S]*?\?>|<%[\s\S]*?%>|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\$\{[^}]*\}|\{[^}]*\}/g, () => {
        dynamic = true;
        return " ";
      });
    } else {
      // An expression: only its strings are class names, maybe some only at times.
      dynamic = true;
      value = [...(quoted ?? m[4] ?? "").matchAll(/["'`]([^"'`]*)["'`]/g)].map((s) => s[1]).join(" ");
    }
    words = [...(words ?? []), ...wordsOf(value)];
  }
  return words ? { words, dynamic } : null;
}

/** How much a tag's classes in the code agree with an element's: the score, and whether they're clearly its. */
function classesScore(n: Needles, classes: string[], opening: string): { score: number; clear: boolean; facts: string[] } {
  const facts: string[] = [];
  if (!classes.length) return { score: 0, clear: false, facts };
  const words = new Set(wordsOf(opening));
  let matched = 0;
  let score = 0;
  for (const c of classes) {
    if (!words.has(c)) continue;
    matched++;
    facts.push(`class:${c}`);
    score += Math.max(0.2, n.rarity(c));
  }
  if (!matched) return { score: 0, clear: false, facts };
  const attr = classAttrOf(opening);
  let consistent = false;
  if (attr?.words.length) {
    // Classes the code writes that the element doesn't have: likely another element (`gap-2`, not `gap-4`).
    const extras = attr.words.filter((c) => !classes.includes(c));
    const extra = extras.length;
    for (const c of extras) facts.push(`-class:${c}`);
    if (!attr.dynamic) {
      // Both ways (the code has some the element hasn't, and misses some it has): another element, or another version of it.
      if (extra && classes.length - matched >= 2) return { score: -8, clear: false, facts: [...facts, "-classes"] };
      score -= Math.min(9, extra * 3);
      if (!extra && matched === classes.length) {
        score += 3;
        facts.push("classes-exact");
      }
    } else if (extra > attr.words.length / 2) score -= Math.min(4, extra);
    consistent = extra === 0;
  }
  const clear = matched >= Math.ceil(classes.length * 0.6) || (consistent && attr?.dynamic === true) || score >= 6;
  return { score, clear, facts };
}

/** A tag in the code that may be the element, and how much it shares with it. */
export interface Candidate {
  file: Source;
  /** 0-based. */
  index: number;
  column: number;
  score: number;
  /** What its classes alone gave, for an element known by them only. */
  classScore: number;
  /** The kinds of evidence found: id, classes, text, attrs, near, parents. */
  kinds: Set<string>;
  /** Each detail found (`class:nav`, `text:Pricing`, `before`…), and each against it (`-class:gap-2`): to tell a better place from a copy. */
  facts: Set<string>;
}

/** The last line an element's contents likely span, by indentation: up to its closing tag or its next sibling. */
function bodyEnd(lines: string[], index: number, openingEnd: number): number {
  const indent = indentOf(lines[index] as string);
  const last = Math.min(lines.length - 1, index + BODY_LINES);
  for (let j = openingEnd + 1; j <= last; j++) {
    const line = lines[j] as string;
    if (!line.trim()) continue;
    const ind = indentOf(line);
    if (ind < indent) return j - 1;
    if (ind === indent) return /^\s*<\//.test(line) ? j : j - 1;
  }
  return last;
}

/** How much the tag at `index`/`column` shares with the element; null when it can't be it (another tag). */
function scoreAt(n: Needles, file: Source, beside: Beside, index: number, column: number, name: string): Candidate | null {
  const lower = name.toLowerCase();
  // The element's own tag, or a component's (`<Button>` renders the `button`); never another plain tag.
  if (lower !== n.tag && isPlain(name)) return null;
  const { lines } = file;
  const opening = openingAt(lines, index, column);
  const kinds = new Set<string>();
  const facts = new Set<string>(lower === n.tag ? ["tag"] : []);
  let score = lower === n.tag ? 1 : 0;
  if (n.id && opening.text.includes(n.id) && new RegExp(`\\bid\\s*=\\s*[{"'\`]*${escape(n.id)}["'\`}]`).test(opening.text)) {
    score += 8;
    kinds.add("id");
    facts.add("id");
  }
  const classes = classesScore(n, n.classes, opening.text);
  if (classes.clear) kinds.add("classes");
  for (const f of classes.facts) facts.add(f);
  score += classes.score;
  // None of its classes, where the code writes some: another element.
  if (n.classes.length && !classes.score && !kinds.has("id") && classAttrOf(opening.text)?.words.length) return null;
  const end = bodyEnd(lines, index, opening.end);
  if (!n.texts.length && !n.empty) {
    // Nothing to compare: the page didn't say.
  } else if (n.empty) {
    // No text on the page, where the code writes some: another element (the column with the events, not the empty one).
    const code = [(lines[index] as string).slice(column), ...lines.slice(index + 1, end + 1)].join("\n");
    if (writtenText(code).length >= 2) {
      score -= 4;
      facts.add("-text");
    }
  }
  if (n.texts.length || n.attrs.length) {
    const code = [(lines[index] as string).slice(column), ...lines.slice(index + 1, end + 1)].join("\n");
    const body = plain(code);
    let texts = 0;
    for (const t of n.texts) {
      const found = textFound(body, t);
      if (found) facts.add(`text:${t}`);
      texts += found * textWeight(n, t);
    }
    if (texts) {
      score += Math.min(14, texts);
      kinds.add("text");
    }
    // The code writes a text of its own that isn't the element's: another copy (the link to "Database Icons", not "Accessibility Icons").
    const written = n.texts.length ? writtenText(code) : "";
    if (written && n.own && written.length <= 120 && !n.own.includes(written) && !body.includes(n.own)) {
      score -= 4;
      facts.add("-text");
    }
    let attrs = 0;
    for (const a of n.attrs)
      if (body.includes(a)) {
        facts.add(`attr:${a}`);
        attrs += Math.min(6, Math.max(1, textWeight(n, a)));
      }
    if (attrs) {
      score += Math.min(10, attrs);
      kinds.add("attrs");
    }
  }
  // The texts beside it on the page, just above and below it in the code, and its section's heading: which of several copies it is.
  let near = 0;
  const within = (at: number[], from: number, to: number) => at.some((i) => i >= from && i <= to);
  if (
    n.before &&
    (within(beside.before, index - NEAR_LINES, index - 1) ||
      (beside.before.includes(index) && plain((lines[index] as string).slice(0, column)).includes(n.before)))
  ) {
    near += Math.min(5, textWeight(n, n.before));
    facts.add("before");
  }
  if (n.after && within(beside.after, end, end + NEAR_LINES)) {
    near += Math.min(5, textWeight(n, n.after));
    facts.add("after");
  }
  if (n.heading) {
    // Its nearest heading in the code is the page's: not just any heading above (every later section has those).
    let h = -1;
    for (const i of beside.headings) if (i < index) h = i;
    let last = h;
    while (h >= 0 && last < Math.min(h + 2, index - 1) && !/<\/h[1-6]>/i.test(lines[last] as string)) last++;
    if (h >= 0 && plain(lines.slice(h, last + 1).join(" ")).includes(n.heading)) {
      near += Math.min(4, textWeight(n, n.heading));
      facts.add("heading");
    }
  }
  if (near) {
    score += near;
    kinds.add("near");
  }
  const parents = parentsScore(n, lines, index, column);
  if (parents.score) {
    score += parents.score;
    kinds.add("parents");
    for (let i = 0; i < parents.found; i++) facts.add(`parent:${i}`);
  }
  return { file, index, column, score, classScore: classes.score, kinds, facts };
}

/** Tags that never hold others. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** Whether the tag at `index`/`column` closes itself (`<Icon />`): looked at on its line when it ends there. */
function selfClosing(lines: string[], index: number, column: number): boolean {
  const rest = (lines[index] as string).slice(column);
  const end = rest.indexOf(">");
  if (end > 0 && !/["'`{]/.test(rest.slice(0, end))) return rest[end - 1] === "/";
  return /\/>$/.test(openingAt(lines, index, column).text);
}

/**
 * The tag the tag at `index`/`column` sits in: the nearest one above it
 * left open, by matching the tags between (indentation can't be trusted).
 */
function parentOf(lines: string[], index: number, column: number): { index: number; column: number; name: string } | null {
  const open: string[] = [];
  for (let j = index; j >= Math.max(0, index - PARENT_LINES); j--) {
    const line = j === index ? (lines[j] as string).slice(0, column) : (lines[j] as string);
    if (!line.includes("<")) continue;
    const tags = [...line.matchAll(/<(\/?)([A-Za-z][\w.:-]*)(?=[\s>/]|$)/g)];
    for (let t = tags.length - 1; t >= 0; t--) {
      const m = tags[t] as RegExpMatchArray;
      const name = (m[2] as string).toLowerCase();
      if (m[1]) {
        open.push(name);
        continue;
      }
      if (VOID.has(name) || selfClosing(lines, j, m.index as number)) continue;
      const closed = open.lastIndexOf(name);
      if (closed >= 0) {
        open.length = closed;
        continue;
      }
      return { index: j, column: m.index as number, name: m[2] as string };
    }
  }
  return null;
}

/** Its parents found above it in the code, nearest first (where the file has them: a layout may be elsewhere). */
function parentsScore(n: Needles, lines: string[], index: number, column: number): { score: number; found: number } {
  let score = 0;
  let found = 0;
  let at = { index, column };
  for (const p of n.parents) {
    const parent = parentOf(lines, at.index, at.column);
    if (!parent || (isPlain(parent.name) && parent.name !== p.tag)) break;
    const opening = openingAt(lines, parent.index, parent.column).text;
    if (p.id && opening.includes(p.id)) score += 4;
    else if (p.classes.length) {
      const classes = classesScore(n, p.classes, opening);
      if (!classes.clear) break;
      score += Math.min(4, 1 + Math.max(0, classes.score) / 2);
    } else if (classAttrOf(opening)?.words.length) break;
    else score += 0.5;
    at = parent;
    found++;
  }
  return { score, found };
}

/**
 * How much a file's path is like the page's (`web-3/routes/pricing.php` for
 * `/web-3/pricing`). When the page's path names one of the project's folders
 * (a site served from it), the project's other sites (folders with their own
 * index file: `web-2`, an older copy) can't render this page, and its other
 * folders are less likely (shared includes may be there).
 */
function routeOf(n: Needles, rel: string): { score: number; facts: string[] } {
  if (!n.route.length) return { score: 0, facts: [] };
  const parts = rel.split(/[\\/]/);
  const names = new Set(parts.map((p) => p.replace(/\.[a-z]+$/i, "")));
  const like = n.route.filter((p) => names.has(p));
  const score = Math.min(5, like.length * 2.5);
  const facts = like.map((p) => `route:${p}`);
  if (parts.length > 1 && n.otherSites.has(parts[0] as string)) return { score: score - 20, facts: [...facts, "-site"] };
  if (n.served && parts.length > 1 && parts[0] !== n.served) return { score: score - 3, facts: [...facts, "-folder"] };
  return { score, facts };
}

/** What makes a folder a site of its own. */
const INDEX_FILES = ["index.php", "index.html", "index.htm"];
const safeList = (dir: string) => {
  try {
    return readdirSync(dir).filter((name) => !name.startsWith(".") && isFolder(join(dir, name)));
  } catch {
    return [];
  }
};

const isFolder = (path: string) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** How likely a file is to hold the element, from its words alone: the files looked at line by line. */
function fileScore(n: Needles, file: Source): number {
  let score = 0;
  if (n.id && file.words.has(n.id)) score += 8;
  for (const c of n.classes) if (file.words.has(c)) score += n.rarity(c);
  for (const t of [...n.texts, ...n.attrs]) {
    const words = wordsOf(t);
    if (words.length && words.every((w) => file.words.has(w))) score += textWeight(n, t);
  }
  return score;
}

/** Where a file has the texts beside the element (line indexes, each looked for on one line), and its headings' lines. */
interface Beside {
  before: number[];
  after: number[];
  headings: number[];
}
function besideOf(n: Needles, file: Source): Beside {
  const beside: Beside = { before: [], after: [], headings: [] };
  const lead = (t: string | undefined) => t?.split(" ")[0];
  const firstBefore = lead(n.before);
  const firstAfter = lead(n.after);
  file.lines.forEach((line, i) => {
    if (n.heading && /<h[1-6][\s>]/i.test(line)) beside.headings.push(i);
    if (firstBefore && line.includes(firstBefore) && plain(line).includes(n.before as string)) beside.before.push(i);
    if (firstAfter && line.includes(firstAfter) && plain(line).includes(n.after as string)) beside.after.push(i);
  });
  return beside;
}

/** Every tag of `file` that may be the element, from line `from` on. */
function scoreFile(n: Needles, file: Source, from = 0, to = file.lines.length): Candidate[] {
  const out: Candidate[] = [];
  const beside = besideOf(n, file);
  for (let i = from; i < Math.min(to, file.lines.length); i++) {
    const line = file.lines[i] as string;
    if (!line.includes("<")) continue;
    for (const { name, column } of tagsOn(line)) {
      const found = scoreAt(n, file, beside, i, column, name);
      if (found?.kinds.size) out.push(found);
    }
  }
  return out;
}

/**
 * Enough to say it's the element: its id, or two kinds of evidence (its
 * classes and its text, its parents, the texts beside it…), or classes
 * distinctive enough on their own (a long list, rare names, written as the
 * page has them).
 */
function convincing(c: Candidate): boolean {
  if (c.kinds.has("id")) return c.score >= 9;
  if (c.kinds.size >= 2) return c.score >= 10;
  return c.kinds.has("classes") && c.classScore >= 12;
}
/** How far ahead the best must be of the next place to be the only one said. */
const MARGIN = 4;

export interface LocateOptions {
  /** The page's address: a file named like its path wins a tie (`web-3/routes/pricing.php`). */
  url?: string;
  deadline?: number;
}

/**
 * Where `target` probably is under `root`: its file and line, and a second
 * place when two are as likely (copies of the same markup), or null when no
 * place is clearly it.
 */
export function locate(target: ElementTarget, root: string, options: LocateOptions = {}): Location | null {
  const found = candidates(target, root, options);
  if (!found) return null;
  if ("known" in found) return found.known;
  const all = found.list;
  const best = all[0];
  if (!best || !convincing(best)) return null;
  const at = (c: Candidate) => ({ file: c.file.rel, line: c.index + 1, snippet: snippetAt(c.file.lines, c.index) });
  // The next place: any other tag (two alike on the next line are two places).
  const apart = (a: Candidate, b: Candidate) => a.file !== b.file || a.index !== b.index || a.column !== b.column;
  const elsewhere = all.filter((c) => apart(c, best));
  const second = elsewhere[0];
  if (!second || clearlyAhead(best, second)) return at(best);
  // As likely: both said, when they're the only two.
  const third = elsewhere.find((c) => apart(c, second));
  if (convincing(second) && (!third || clearlyAhead(best, third))) return { ...at(best), also: at(second) };
  return null;
}

/**
 * Far enough ahead, or ahead with everything the other has and more, and
 * nothing more against it: the copy of a button with the element's own color,
 * a card with its own title, the copy in the page's own folder. Copies alike in
 * every detail are never ahead of each other.
 */
function clearlyAhead(best: Candidate, other: Candidate): boolean {
  const diff = best.score - other.score;
  if (diff >= MARGIN) return true;
  if (diff <= 0) return false;
  const pro = (c: Candidate) => [...c.facts].filter((f) => !f.startsWith("-"));
  const con = (c: Candidate) => [...c.facts].filter((f) => f.startsWith("-"));
  return pro(other).every((f) => best.facts.has(f)) && con(best).every((f) => other.facts.has(f)) && pro(best).length + con(other).length > pro(other).length + con(best).length;
}

/** Every place that may be the element, best first (or the one its framework named); for locate, and to see why it says what it says. */
export function candidates(
  target: ElementTarget,
  root: string,
  options: LocateOptions = {},
): { known: Location } | { list: Candidate[] } | null {
  const { sources, rarity } = markupSources(root);
  // After reading the project (the first search's, if warmSources didn't run yet): the budget is the search's.
  const deadline = options.deadline ?? Date.now() + BUDGET_MS;
  const n = needlesOf(target, options.url, root, rarity);
  // Its component's file and line are known (the framework said, or componentFile found it): the
  // element's own line in that component, else the component's.
  const known = target.source?.file && target.source.line ? sourcePath(target.source.file, root) : null;
  if (known && target.source?.line) {
    const from = target.source.line - 1;
    const file = sources.find((s) => s.rel === known);
    if (file) {
      const own = scoreFile(n, file, from, from + 200).sort((a, b) => b.score - a.score)[0];
      const index = own && own.score >= 2 ? own.index : from;
      return { known: { file: known, line: index + 1, snippet: snippetAt(file.lines, index) } };
    }
  }
  if (!n.id && !n.texts.length && !n.attrs.length && !n.classes.length) return null;
  const files = sources
    .map((file) => ({ file, score: fileScore(n, file) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_FILES);
  const list: Candidate[] = [];
  for (const { file } of files) {
    if (Date.now() > deadline) break;
    const route = routeOf(n, file.rel);
    for (const c of scoreFile(n, file)) list.push({ ...c, score: c.score + route.score, facts: new Set([...c.facts, ...route.facts]) });
  }
  return { list: list.sort((a, b) => b.score - a.score) };
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
  // What the comment mentions with `@`: a project component's file (sent
  // relative to the workspace's root, components.ts) relative to this
  // project instead; a component or a typed name with no file, looked for
  // by its declaration, across the workspace (a monorepo's packages too).
  const workspace = workspaceRoot(root);
  const declared = (name: string) => {
    const found = componentFile(name, workspace, deadline);
    return found ? { file: relative(root, join(workspace, found.file)), line: found.line } : null;
  };
  // A file in the workspace (a token's, sent relative to its root) as this project sees it.
  const local = (file: string) => {
    const path = join(workspace, file);
    return existsSync(path) ? relative(root, path) : file;
  };
  const mention = (r: CommentReference): CommentReference => {
    if (r.kind === "token") return r.source ? { ...r, source: { ...r.source, file: local(r.source.file) } } : r;
    if (r.kind === "element") return { ...r, target: fill(r.target) };
    if (r.kind === "unlisted") {
      const source = declared(r.name);
      return source ? { kind: "component", name: r.name, source } : r;
    }
    if (r.kind !== "component") return r;
    if (r.source) {
      const path = join(workspace, r.source.file);
      return existsSync(path) ? { ...r, source: { ...r.source, file: relative(root, path) } } : r;
    }
    if (r.target?.source?.file) return { ...r, target: fill(r.target) };
    const source = declared(r.name);
    return source ? { ...r, source } : r;
  };
  const mentions = (refs: CommentReference[] | undefined) => (refs?.length ? { references: refs.map(mention) } : {});
  const { changeSet } = job;
  const request = changeSet.request;
  return {
    ...job,
    changeSet: {
      ...changeSet,
      edits: changeSet.edits.map((e) => ({ ...e, target: fill(e.target) })),
      ...(changeSet.fileTokens ? { fileTokens: changeSet.fileTokens.map((t) => ({ ...t, file: local(t.file) })) } : {}),
      ...(request
        ? {
            request: {
              ...request,
              target: fill(request.target),
              ...(request.others ? { others: request.others.map(fill) } : {}),
              ...(request.kind === "comment"
                ? { thread: request.thread.map((m) => ({ ...m, ...mentions(m.references) })) }
                : mentions(request.references)),
            } as AgentRequest,
          }
        : {}),
    },
  };
}

/** A job's elements and where their code probably is, those found. */
export function jobLocations(job: Job, root: string): Array<{ target: ElementTarget; at: Location }> {
  if (!searchable(root)) return [];
  const targets = job.changeSet.request ? requestTargets(job.changeSet.request) : job.changeSet.edits.map((e) => e.target);
  markupSources(root); // Reading the project isn't the search's time.
  const deadline = Date.now() + BUDGET_MS;
  const found: Array<{ target: ElementTarget; at: Location }> = [];
  for (const target of targets) {
    const at = locate(target, root, { url: job.changeSet.page?.url, deadline });
    if (at) found.push({ target, at });
  }
  return found;
}

/**
 * A job's elements and where their code probably is, as a section for the
 * job's prompt; empty when none was found (or the project can't be searched).
 */
export function whereSection(job: Job, root: string, located = jobLocations(job, root)): string {
  if (!searchable(root)) return "";
  const found: string[] = [];
  for (const { target, at } of located) {
    const snippet = (place: Omit<Location, "also">) => [
      "",
      `  \`\`\`${extname(place.file).slice(1) || "text"}`,
      ...place.snippet.split("\n").map((l) => `  ${l}`),
      "  ```",
    ];
    if (at.also)
      found.push(
        `- \`${target.path}\` → one of these two (the same markup in both; the page doesn't say which):`,
        "",
        `  \`${at.file}:${at.line}\`:`,
        ...snippet(at),
        "",
        `  \`${at.also.file}:${at.also.line}\`:`,
        ...snippet(at.also),
      );
    else found.push(`- \`${target.path}\` → \`${at.file}:${at.line}\`:`, ...snippet(at));
  }
  if (!found.length) return "";
  return [
    "## Where the code probably is",
    "",
    "Pilot searched the project for these elements (by component, and by their classes, texts, attributes and parents together). Start there; if it isn't the right place (the text comes from a prop, a translation, a CMS), search as usual.",
    "",
    ...found,
  ].join("\n");
}
