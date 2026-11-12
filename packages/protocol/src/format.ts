import type { ChangeSet, ElementEdit, StyleChange } from "./types.ts";

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
  out.push("", "| Property | From | To |", "| --- | --- | --- |");
  for (const c of changes) {
    out.push(`| \`${c.property}\` | \`${c.from}\` | ${c.removed ? "*removed*" : `\`${c.to}\``} |`);
  }
  const removed = changes.filter((c) => c.removed);
  if (removed.length) out.push("");
  for (const c of removed) out.push(`- ${removalNote(c)}`);
  return out;
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
