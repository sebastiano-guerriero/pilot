import { type CommentReference, type ComponentFile, mentionText } from "@pilot/protocol";
import type { Mentionables } from "../../../dom/mentions.ts";

/**
 * `@` in the comment box: what's being typed after it, and the matching
 * things to mention (tokens, components, elements on the page: App reads
 * them with dom/mentions.ts when the list opens). Picked, one goes into the
 * text as it reads (`--color-accent`, `@ProductCard`, `@section#features`)
 * and as a reference the comment carries, exact, for the agent. Typed
 * without the list, the same text counts too (see mentionsIn).
 */

/** One thing `@` can mention. */
export interface MentionOption {
  /** Its group in the list; "Unlisted": typed, found nowhere (never listed, sent for the agent to look for). */
  group: "Tokens" | "Components" | "Elements" | "Unlisted";
  /** Shown in the list, matched against what's typed, and the reference's name. */
  label: string;
  /** What goes into the comment's text. */
  insert: string;
  /** Beside the name: a token's value, a project component's folder. */
  detail?: string;
  /** A color token's value, for a swatch. */
  swatch?: string;
  /** The component's first instance, or the element: described when the comment is sent (App). */
  element?: Element;
  /** A component of the project's (not on the page): where it's declared, from Pilot's server. */
  source?: ComponentFile;
  /** A token from a file in the project (not a CSS variable on the page): where it's defined. */
  tokenFile?: ComponentFile;
  /** One of the page's breakpoints, in px: listed with the tokens, mentioned as `@768px`. */
  breakpoint?: number;
}

/** At most this many per group: the list narrows as you type. */
export const PER_GROUP = 5;

/** The page's mentionables as the list's options, by group. */
export function mentionOptions({ tokens, breakpoints = [], components, elements }: Mentionables): MentionOption[] {
  return [
    ...tokens.map((t): MentionOption => ({
      group: "Tokens",
      // A file's token as the file names it (`color.brand.primary`, `$brand`).
      label: t.source?.name ?? t.name,
      insert: t.source?.name ?? t.name,
      detail: t.value,
      swatch: t.kind === "color" ? t.value : undefined,
      ...(t.source ? { tokenFile: { file: t.source.file, ...(t.source.line ? { line: t.source.line } : {}) } } : {}),
    })),
    // The page's breakpoints with the tokens, after them (the owner's call, 2026-11-26): what a comment about layout names.
    ...breakpoints.map((b): MentionOption => ({ group: "Tokens", label: `${b}px`, insert: `@${b}px`, detail: "breakpoint", breakpoint: b })),
    ...components.map((c): MentionOption => ({ group: "Components", label: c.name, insert: `@${c.name}`, element: c.element })),
    ...elements.map((e): MentionOption => ({ group: "Elements", label: e.name, insert: `@${e.name}`, element: e.element })),
  ];
}

/** The `@` being typed right before the caret (at the start, or after a space), and what follows it; null otherwise. */
export function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@]*)$/.exec(before);
  if (!m) return null;
  return { start: before.length - (m[2] as string).length - 1, query: m[2] as string };
}

/**
 * The options matching `query`, by group in their order (Tokens,
 * Components, Elements), the ones starting with it first, at most PER_GROUP
 * each. Matched without case and without the names' own prefixes (`--`, `@`);
 * a token's value matches too (`#1cf69e`).
 */
export function matchMentions(options: readonly MentionOption[], query: string): MentionOption[] {
  const bare = (s: string) => s.toLowerCase().replace(/^(--|@)/, "");
  const q = bare(query);
  const out: MentionOption[] = [];
  for (const group of ["Tokens", "Components", "Elements"] as const) {
    const matching = options.filter(
      (o) => o.group === group && (!q || bare(o.label).includes(q) || (o.detail ?? "").toLowerCase().includes(q)),
    );
    matching.sort((a, b) => Number(!bare(a.label).startsWith(q)) - Number(!bare(b.label).startsWith(q)));
    // Breakpoints count apart from the variables: the few of them never push the variables out, nor the reverse.
    out.push(...matching.filter((o) => o.breakpoint === undefined).slice(0, PER_GROUP));
    out.push(...matching.filter((o) => o.breakpoint !== undefined).slice(0, PER_GROUP));
  }
  return out;
}

/** `text` with the `@query` at `mention` replaced by `insert` and a space; and where the caret goes (after the space). */
export function insertMention(text: string, mention: { start: number; query: string }, insert: string): { text: string; caret: number } {
  const end = mention.start + 1 + mention.query.length;
  const rest = text.slice(end);
  const spaced = rest.startsWith(" ") ? insert : `${insert} `;
  return { text: text.slice(0, mention.start) + spaced + rest, caret: mention.start + spaced.length + (rest.startsWith(" ") ? 1 : 0) };
}

/** The project's components (from Pilot's server) as options after the page's: those with a name on the page are left out (the page's has an instance). */
export function projectOptions(
  components: ReadonlyArray<{ name: string; file: string; line?: number }>,
  page: readonly MentionOption[],
): MentionOption[] {
  const onPage = new Set(page.filter((o) => o.group === "Components").map((o) => o.label));
  return components
    .filter((c) => !onPage.has(c.name))
    .map((c) => ({
      group: "Components",
      label: c.name,
      insert: `@${c.name}`,
      detail: c.file.includes("/") ? c.file.slice(0, c.file.lastIndexOf("/")) : c.file,
      source: { file: c.file, line: c.line },
    }));
}

/**
 * What the comment mentions, in the order it reads, once each: every `@name`
 * (at the start of a word; trailing punctuation isn't part of it) and every
 * `--token` the page defines. Each is what was picked for that text, else the
 * listed thing it names (`options`, without case when only one matches),
 * else, for an `@name`, an "Unlisted" one, for the agent to look for. A pick
 * taken out of the text isn't there.
 */
export function mentionsIn(text: string, picked: readonly MentionOption[], options: readonly MentionOption[]): MentionOption[] {
  const out = new Map<string, MentionOption>();
  const find = (word: string) => {
    const exact = picked.find((o) => o.insert === word) ?? options.find((o) => o.insert === word);
    if (exact) return exact;
    const loose = options.filter((o) => o.insert.toLowerCase() === word.toLowerCase());
    return loose.length === 1 ? loose[0] : undefined;
  };
  for (const m of text.matchAll(/(^|[\s(])(@[^\s@]+|--[\w-]+)/g)) {
    const word = (m[2] as string).replace(/[.,;:!?)"'’]+$/, "").replace(/['’]s$/, "");
    if (word.length < 2 || out.has(word)) continue;
    const found = find(word);
    if (found) out.set(word, found);
    else if (word.startsWith("@")) out.set(word, { group: "Unlisted", label: word.slice(1), insert: word });
  }
  return [...out.values()];
}

/** `text` cut into plain runs and mentions (of `references`), to show the mentions apart in the thread. */
export function splitMentions(text: string, references: readonly CommentReference[] = []): Array<{ text: string; mention?: true }> {
  const inserts = [...new Set(references.map(mentionText))].sort((a, b) => b.length - a.length);
  if (!inserts.length) return [{ text }];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts: Array<{ text: string; mention?: true }> = [];
  let last = 0;
  // Without case: a typed `@productcard` names `ProductCard` (see mentionsIn).
  for (const m of text.matchAll(new RegExp(inserts.map(escape).join("|"), "gi"))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
