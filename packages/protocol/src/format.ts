import type { ChangeSet, ElementEdit } from "./types.ts";

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
    out.push(`| \`${c.property}\` | \`${c.from}\` | \`${c.to}\` |`);
  }
  return out;
}
