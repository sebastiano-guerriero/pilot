import type { WidthCheck } from "./bridge.ts";
import type { ChangeSet, CommentRequest, ElementEdit, ElementState, ElementTarget, ResponsiveRequest, StyleChange, WidthRange } from "./types.ts";

/**
 * Turn a change set into instructions a coding agent can follow.
 * Used by "Copy prompt" in the overlay and by the bridge's MCP tools,
 * so both paths hand the agent exactly the same text.
 */
export function formatPrompt(changeSet: ChangeSet): string {
  if (changeSet.request?.kind === "responsive") return formatResponsive(changeSet, changeSet.request);
  if (changeSet.request?.kind === "comment") return formatComment(changeSet, changeSet.request);
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
    "- A Text change is the element's copy (all of its text, or the part between its child elements): replace the old text with the new one where it comes from (the markup, a prop, a translation file, a CMS fixture), the rest of the element as it is. If the same text is used elsewhere, change only this element's, unless the designer's note says otherwise.",
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

/**
 * Tasks come in two kinds. Edits ("basic") carry every value: speed
 * matters, any model does them. Tasks like Make responsive ("advanced") need
 * judgment: they say so, and an agent that can hands them to its most
 * capable model.
 */
const ADVANCED_TASK =
  "**An advanced task: it needs judgment more than speed.** If you can hand work to a more capable model and aren't running on one, do: in Claude Code, unless you already run on Opus, give this whole prompt (with the job id) to a subagent with `model: \"opus\"` (the Agent tool), have it make the changes and run the width check, and report back; then call `pilot_done` with its notes.";

/**
 * Make responsive: the designer asks the agent to make one element work at
 * every viewport width. No values: the agent decides the changes, the way
 * the project already does responsive, and checks them in the browser.
 */
function formatResponsive(changeSet: ChangeSet, request: ResponsiveRequest): string {
  const { page, note } = changeSet;
  const { target, breakpoints } = request;
  const widths = breakpoints.length ? breakpoints.map((b) => `${b}px`).join(", ") : "none found (it may use container queries, or none yet)";
  const lines = [
    "# Pilot: make responsive",
    "",
    "A designer selected the element below in the browser with Pilot and asked you to make it work well at every viewport width, from a narrow phone to a wide desktop. Decide the changes yourself and apply them to the source code.",
    "",
    `Page: ${page.url} (${page.title || "untitled"}), seen at ${page.viewport.width}x${page.viewport.height}`,
    `The page's breakpoints (the widths its media queries test): ${widths}`,
    "",
    ADVANCED_TASK,
  ];
  if (note?.trim()) lines.push("", `Designer note: ${note.trim()}`);
  lines.push(
    "",
    `## \`${target.path}\``,
    "",
    ...targetLines(target),
    "",
    "## How to do it",
    "",
    "1. **Find the element's component** and the layout around it (its parent and siblings): a fix often belongs to the container, not the element.",
    "2. **Learn how this project does responsive**: its breakpoints and their names (Tailwind config or theme, CSS variables, existing media queries), whether components respond to their container instead (container queries, `@container`), and whether it writes mobile-first (min-width) or desktop-first (max-width). Use its breakpoints; don't invent new ones.",
    "3. **Find similar components** that already have responsive rules (other cards, lists, headers, forms in this project) and follow the same patterns, so this one behaves like its siblings.",
    "4. **Make the smallest changes that work**, in the project's conventions (Tailwind variants like `md:`, the media queries it already uses, its tokens): layout first (stacking, wrapping, columns, flex direction), then spacing and type size. Hide content only as a last resort, and say so. Don't change how it looks at the width the designer is working at unless that width has a problem too. Never leave inline styles.",
    "5. **Check every width with `pilot_check_widths`** (Pilot's tool, with this job's id). It loads the page at a phone width (375px), each breakpoint and 1px below it, a wide desktop (1440px) and the designer's width, measures the element in each, and reports problems as numbers: sticking out of the viewport, spilling out of its parent, clipped content, overlaps, and anything that changed at the designer's width. No screenshots needed. Fix what it finds and run it again until it finds none. Without that tool (a pasted prompt), check those widths in a browser if you have one, and say which widths you couldn't check.",
    "6. **Report** in your notes what changed at which widths, in a line or two, and anything you left for the designer to decide. When you report it done, Pilot runs the width check once more: problems come back to you once, as a follow-up.",
    "",
    "Change only this element and what its layout needs (its container, its children). If it's a shared component, ask before changing every instance.",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * A comment: the designer's words about one element, and the thread so far.
 * Simple, specific asks are done right away; open-ended ones are advanced
 * tasks (the stronger model). The agent's notes are its reply in the thread.
 */
function formatComment(changeSet: ChangeSet, request: CommentRequest): string {
  const { page } = changeSet;
  const { target, thread, breakpoints } = request;
  const latest = thread.at(-1);
  const earlier = thread.slice(0, -1);
  const widths = breakpoints.length ? breakpoints.map((b) => `${b}px`).join(", ") : "none found (it may use container queries, or none yet)";
  const lines = [
    "# Pilot: comment",
    "",
    "A designer left a comment on the element below, in the browser with Pilot. Do what it asks in the source code (or, if it's a question, answer it).",
    "",
    `Page: ${page.url} (${page.title || "untitled"}), seen at ${page.viewport.width}x${page.viewport.height}`,
    `The page's breakpoints (the widths its media queries test): ${widths}`,
    "",
    `## \`${target.path}\``,
    "",
    ...targetLines(target),
    "",
    "## The comment",
    "",
    quote(latest?.text ?? ""),
  ];
  if (earlier.length) {
    lines.push("", "## The thread so far (you already did what it asked)", "");
    for (const m of earlier) lines.push(`- **${m.from === "designer" ? "Designer" : "You"}:** ${m.text.replace(/\s*\n\s*/g, " ")}`);
  }
  lines.push(
    "",
    "## How to do it",
    "",
    "- **A specific, small ask** (a color, a size, a spacing, a text): make it right away, in the project's conventions (its tokens, utilities, components). Speed matters: no screenshots or builds.",
    "- **An open-ended ask that needs design judgment** (make it calmer, rework this layout): it's an advanced task. If you can hand work to a more capable model and aren't running on one, do: in Claude Code, unless you already run on Opus, give this prompt (with the job id) to a subagent with `model: \"opus\"` (the Agent tool), and report back with its notes.",
    `- The designer was looking at the page ${page.viewport.width}px wide. If the comment is about how it looks at that width only, scope the change with the project's breakpoints; otherwise it's for every width.`,
    "- Change only what the comment is about. Never leave inline styles. If the element comes from a shared component, ask before changing every instance.",
    "- **A question, not a change:** answer it, and change nothing.",
    "- **Your notes are your reply in the designer's thread:** in a sentence or two, what you changed (or your answer), and anything you need from them.",
  );
  return `${lines.join("\n")}\n`;
}

/** Text as a Markdown quote, line by line. */
function quote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

/** How to find an element: selector, text, source hint. */
function targetLines(target: ElementTarget): string[] {
  const out = [`- Selector: \`${target.selector}\``];
  if (target.text) out.push(`- Text: "${target.text}"`);
  if (target.source?.component || target.source?.file) {
    const where = [target.source.component, target.source.file && `${target.source.file}${target.source.line ? `:${target.source.line}` : ""}`]
      .filter(Boolean)
      .join(" in ");
    out.push(`- Source hint: ${where}`);
  }
  return out;
}

function formatEdit(edit: ElementEdit, n: number): string[] {
  const { target, changes, texts } = edit;
  const out = [`## ${n}. \`${target.path}\``, "", ...targetLines(target)];
  if (texts?.length) out.push("", "Text (from → to):", "", ...texts.map((t) => `- ${JSON.stringify(t.from)} → ${JSON.stringify(t.to)}`));
  if (!changes.length) return out;
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

/**
 * A width check as the agent reads it (`pilot_check_widths`, and a task's
 * follow-up): each width's size and layout, its problems and notes, then
 * what changed at the designer's width.
 */
export function formatWidthCheck(check: WidthCheck): string {
  const lines = [
    check.problems
      ? `Pilot's width check of \`${check.selector}\`: ${check.problems} ${check.problems === 1 ? "problem" : "problems"} to fix.`
      : `Pilot's width check of \`${check.selector}\`: no problems found.`,
    "",
  ];
  for (const r of check.widths) {
    const mine = r.width === check.designerWidth ? " (the designer's width)" : "";
    if (!r.found) {
      lines.push(`- ${r.width}px${mine}: the element isn't on the page at this width (or its selector no longer matches it).`);
      continue;
    }
    lines.push(`- ${r.width}px${mine}: ${[r.size, r.layout].filter(Boolean).join(", ")}${r.issues.length ? "" : ". OK"}`);
    for (const issue of r.issues) lines.push(`  - Problem: ${issue}`);
    for (const note of r.notes) lines.push(`  - Note: ${note}`);
  }
  if (check.changedAtDesignerWidth?.length) {
    lines.push("", `Changed at the designer's width (${check.designerWidth}px), which should look as it did:`);
    for (const c of check.changedAtDesignerWidth) lines.push(`- ${c}`);
  }
  if (check.source === "copy") {
    lines.push(
      "",
      "Measured on a copy of the page as the designer has it, with scripts off: layout that only changes through JavaScript (a menu a script toggles, components that measure themselves) isn't reflected here.",
    );
  }
  return `${lines.join("\n")}\n`;
}
