import type { ChangeSet, ElementEdit, ElementState, StyleChange, WidthRange } from "./types.ts";

/**
 * Turn a change set into instructions a coding agent can follow.
 * Used by "Copy prompt" in the overlay and by the bridge's MCP tools,
 * so both paths hand the agent exactly the same text.
 */
export function formatPrompt(changeSet: ChangeSet): string {
  const { page, edits, note } = changeSet;
  const lines: string[] = [
    "# Pilot design edits",
    "",
    "A designer adjusted the UI below in the browser with Pilot. Apply these changes to the source code.",
    "",
    "Guidelines:",
    "- The values are plain CSS. Translate them to this project's conventions (Tailwind classes, CSS modules, design tokens, theme variables...). Do not paste inline styles.",
    "- Prefer an existing token or utility when it matches the value (or is within a pixel or two); mention any value you had to approximate.",
    "- Change only the listed elements. If an element is a shared component, ask before changing every instance.",
    "- Widths are viewport widths in CSS px, both ends included. Use this project's breakpoints when one matches (or is within a few pixels), else a custom media query, and say which. \"Every width\" means no media query: the value holds at every viewport width, and no existing media query should override it.",
    "- A State is the element state the change is for, all of them together (\"hover, active\": hovered and pressed). Use the project's own form: Tailwind's variants (`hover:`, `focus-visible:`, `hover:active:`), `:hover` and the like in CSS. Without a state, the change is for the element as it is (any state).",
    "",
    `Page: ${page.url} (${page.title || "untitled"}) at ${page.viewport.width}x${page.viewport.height}`,
  ];

  if (note?.trim()) {
    lines.push("", `Designer note: ${note.trim()}`);
  }

  edits.forEach((edit, index) => {
    lines.push("", ...formatEdit(edit, index + 1));
  });

  return `${lines.join("\n")}\n`;
}

function formatEdit(edit: ElementEdit, n: number): string[] {
  const { target, changes } = edit;
  const out = [`## ${n}. \`${target.path}\``, "", `- Selector: \`${target.selector}\``];
  if (target.text) out.push(`- Text: "${target.text}"`);
  if (target.source?.component || target.source?.file) {
    const where = [target.source.component, target.source.file && `${target.source.file}${target.source.line ? `:${target.source.line}` : ""}`]
      .filter(Boolean)
      .join(" in ");
    out.push(`- Source hint: ${where}`);
  }
  // The State column only when a change has one, so most prompts stay as they were.
  const withStates = changes.some((c) => c.states?.length);
  out.push(
    "",
    withStates ? "| Property | From | To | Widths | State |" : "| Property | From | To | Widths |",
    withStates ? "| --- | --- | --- | --- | --- |" : "| --- | --- | --- | --- |",
  );
  for (const c of changes) {
    const to = c.removed ? "*removed*" : `\`${c.to}\``;
    const from = c.from ? `\`${c.from}\`` : "*not set*";
    const widths = c.widths ? describeWidths(c.widths) : "every width";
    out.push(`| \`${c.property}\` | ${from} | ${to} | ${widths} |${withStates ? ` ${describeStates(c.states)} |` : ""}`);
  }
  const notes = changes.flatMap((c) => [c.removed && removalNote(c), mediaNote(c)].filter((n): n is string => !!n));
  if (notes.length) out.push("", ...notes.map((n) => `- ${n}`));
  return out;
}

/** The states in words, as the prompt and Pilot's pills write them: `hover, active`; "—" for none. */
export function describeStates(states: readonly ElementState[] | undefined): string {
  return states?.length ? states.join(", ") : "—";
}

/**
 * A width range in words: `from 768px`, `to 767px`, `768–1199px`, `1108px only`. The
 * overlay's width chip uses the same wording.
 */
export function describeWidths({ min, max }: WidthRange): string {
  if (min !== undefined && min === max) return `${min}px only`;
  if (min !== undefined && max !== undefined) return `${min}–${max}px`;
  if (min !== undefined) return `from ${min}px`;
  if (max !== undefined) return `to ${max}px`;
  return "every width";
}

/**
 * Where the old value sits in a media query: for every width, that query
 * must not undo the change.
 */
function mediaNote(c: StyleChange): string | null {
  const media = c.source?.kind === "rule" ? c.source.media : undefined;
  if (!media) return null;
  const today = `\`${c.property}\` is set inside \`@media ${media}\` today.`;
  return c.widths
    ? `${today} The change is for ${describeWidths(c.widths)}.`
    : `${today} The change is for every width, so that media query shouldn't override it.`;
}

/**
 * What "removed" means, spelled out: the element stops declaring the
 * property (not a new value like 0), and where the page declares it today.
 */
function removalNote(c: StyleChange): string {
  const note = `\`${c.property}\` is removed: this element shouldn't set it (not \`0\` or \`none\`), so it gets what the cascade gives without it (another rule, the inherited value, or the default).`;
  const source = c.source;
  if (!source) return note;
  if (source.kind === "inline") return `${note} It's set in the element's own \`style\` attribute.`;
  const shared =
    source.elements && source.elements > 1
      ? `, which matches ${source.elements} elements on the page: remove it for this element only, unless the designer's note says otherwise`
      : "";
  return `${note} It comes from \`${source.selector}\`${shared}.`;
}
