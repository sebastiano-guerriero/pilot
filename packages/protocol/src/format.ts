import type { WidthCheck } from "./bridge.ts";
import { attachmentKind, mentionText, requestTargets } from "./types.ts";
import type {
  BreakFixRequest,
  ChangeSet,
  CommentAction,
  CommentAttachment,
  CommentMessage,
  CommentReference,
  CommentRequest,
  ElementEdit,
  ElementState,
  ElementTarget,
  AgentRequest,
  PropsRequest,
  PropValue,
  ResponsiveRequest,
  StyleChange,
  WidthRange,
} from "./types.ts";

/**
 * Turn a change set into instructions a coding agent can follow.
 * Used by "Copy prompt" in the overlay and by the bridge's MCP tools,
 * so both paths hand the agent exactly the same text.
 */
export function formatPrompt(changeSet: ChangeSet, options: { guidelines?: boolean } = {}): string {
  if (changeSet.request?.kind === "responsive") return formatResponsive(changeSet, changeSet.request);
  if (changeSet.request?.kind === "break-and-fix") return formatBreakFix(changeSet, changeSet.request);
  if (changeSet.request?.kind === "comment") return formatComment(changeSet, changeSet.request, options);
  if (changeSet.request?.kind === "props") return formatProps(changeSet, changeSet.request);
  const { page, edits, note } = changeSet;
  const lines: string[] = [
    "# Pilot design edits",
    "",
    "A designer adjusted the UI below in the browser with Pilot. Apply these changes to the source code.",
    "",
    // In full when pasted; an agent connected to Pilot read them once (pilot_wait_for_edits's description).
    ...(options.guidelines === false ? [EDIT_GUIDELINES_REMINDER] : ["Guidelines:", ...EDIT_GUIDELINES]),
    "",
    `Page: ${page.url} (${page.title || "untitled"}) at ${page.viewport.width}x${page.viewport.height}`,
  ];

  if (note?.trim()) {
    lines.push("", `Designer note: ${note.trim()}`);
  }

  edits.forEach((edit, index) => {
    lines.push("", ...formatEdit(edit, index + 1));
  });
  lines.push(...fileTokenLines(changeSet.fileTokens));

  return `${lines.join("\n")}\n`;
}

/** What the changes' file-token variables stand for (ChangeSet.fileTokens), as a section; none without any. */
function fileTokenLines(tokens: ChangeSet["fileTokens"]): string[] {
  if (!tokens?.length) return [];
  return [
    "",
    "## The project's tokens in these values",
    "",
    "Some values use tokens from the project's files, which Pilot previewed as CSS variables of its own: they're not in the code. Write each the way the project uses that token (its utility, its variable, its theme), never the `var(--…)` itself:",
    "",
    ...tokens.map((t) => `- \`var(${t.variable})\` is \`${t.name}\` in \`${t.file}${t.line ? `:${t.line}` : ""}\` (\`${t.value}\`)`),
  ];
}

/**
 * Tasks come in two kinds. Edits ("basic") carry every value: speed
 * matters, any model does them. Tasks like Make responsive ("advanced") need
 * judgment: they say so, and an agent that can hands them to its most
 * capable model.
 */
const ADVANCED_TASK =
  "**An advanced task: it needs judgment more than speed.** If you can hand work to a more capable model than the one you run on (a subagent, or another model your agent offers), do: give it this whole prompt (with the job id), have it make the changes and run the width check, and report back; then call `pilot_done` with its notes.";

/**
 * What every job says about the code it asks for, whatever the agent and
 * the project: the values are the designer's intent, and the code is the
 * project's own, ready to ship. The same for edits, comments and tasks.
 */
const DESIGN_INTENT =
  "**These are design instructions, not code**: the designer's intent, shown as plain CSS values. Use your judgment and write production code the way this project already styles things, whatever it uses (Tailwind, CSS or Sass modules, StyleX, vanilla-extract, Panda, styled-components, Emotion, a component library's props…). First look at how each element's component is styled, and follow that: its tokens and scale, its variants and props, and the rule that already styles it rather than a new override.";
const PRODUCTION_CODE = "No inline styles, no `!important`, no hard-coded values where a token or utility fits.";
/**
 * The answers to "all of them, or only this one?" (shared code the
 * designer changed in only some copies), and what each asks of the code,
 * the same for every agent: the labels are the question's one-click
 * buttons, short enough to sit on one line.
 */
export const SHARED_CHOICES = {
  all: { label: "All of them", means: "change the component (or the shared code) itself, so every instance gets it." },
  one: {
    label: "Only this",
    means:
      "change it where this instance is used, with what the component already accepts: classes passed through its `className` (merged the way the project does, `cn`, `twMerge`), or one of its props. If it accepts neither, add the smallest pass-through (accept a `className`), not a variant. Never inline styles.",
  },
  variant: {
    label: "New variant",
    means:
      "add a named option to the component, the way it defines its variants (a `cva` variant, a `variant` or `size` prop, a modifier class), named for its purpose, and use it here. Say its name in your notes.",
  },
} as const;

/** What a one-click answer to a shared-code question asks of the code (null for any other answer: the designer's own words). */
export function sharedChoiceMeaning(answer: string): string | null {
  const said = answer.trim().toLowerCase();
  const choice = Object.values(SHARED_CHOICES).find((c) => c.label.toLowerCase() === said);
  return choice ? `**${choice.label}**: ${choice.means}` : null;
}

/**
 * Shared code the designer changed in only some copies: the agent asks
 * (pilot_done's question) rather than guess, unless the designer already
 * said. Every job says it, edits, comments and tasks alike; Pilot counts
 * each element's look-alikes.
 */
const SHARED_CODE = [
  `**Shared code, only some copies:** an element's "Look-alikes" line counts the elements like it that this job leaves out (other instances of its component, or the same part of other copies). If they come from the same code (a shared component, a loop over data), and the designer didn't say which they meant, don't guess: do the rest of the job, leave that part, and ask in one short sentence, the component's name in **bold**, with three choices, your suggestion first: "${SHARED_CHOICES.all.label}", "${SHARED_CHOICES.one.label}", "${SHARED_CHOICES.variant.label}" (Pilot's \`pilot_done\` takes a \`question\`; without Pilot's tools, ask in your reply). Their answer comes back to you as this job.`,
  ...Object.values(SHARED_CHOICES).map((c) => `**${c.label}**: ${c.means}`),
  'Don\'t ask when the designer already said (in the comment or note: "only here", "every card", "as a variant"), when every copy is in the job, or when nothing else uses that code: just change it.',
].join(" ");
/**
 * The edit jobs' guidelines: what every edit asks of the code. In full in a
 * pasted prompt; an agent connected to Pilot reads them once, in
 * `pilot_wait_for_edits`'s description, and each job only reminds it, so the
 * jobs it gets stay short (they're the most frequent ones).
 */
export const EDIT_GUIDELINES: string[] = [
  `- ${DESIGN_INTENT}`,
  `- ${PRODUCTION_CODE} Prefer an existing token or utility when it matches the value (or is within a pixel or two): utility classes take the closest one in the project's scale or theme (\`padding-top: 24px\` → \`pt-6\`), arbitrary values only when nothing fits. Mention any value you had to approximate.`,
  "- Find each element by its selector, DOM path and text, then the component that renders it. Change only the listed elements.",
  `- ${SHARED_CODE}`,
  "- A removed property means the element shouldn't declare it at all: not `0` or `none`, the declaration gone.",
  "- No screenshots, builds or tests for these edits: hot reload shows them, and Pilot checks the page itself.",
  '- Widths are viewport widths in CSS px, both ends included. Use this project\'s breakpoints when one matches (or is within a few pixels), else a custom media query, and say which. "Every width" means no media query: the value holds at every viewport width, and no existing media query should override it.',
  "- A Text change is the element's copy (all of its text, or the part between its child elements): replace the old text with the new one where it comes from (the markup, a prop, a translation file, a CMS fixture), the rest of the element as it is. If the same text is used elsewhere, change only this element's, unless the designer's note says otherwise.",
  "- A State is the element state the change is for, all of them together (\"hover, active\": hovered and pressed). Use the project's own form: Tailwind's variants (`hover:`, `focus-visible:`, `hover:active:`), `:hover` and the like in CSS. Without a state, the change is for the element as it is (any state).",
];

/** In place of the guidelines, in a job for an agent that read them once. */
const EDIT_GUIDELINES_REMINDER =
  "Follow Pilot's edit guidelines (in `pilot_wait_for_edits`'s description): these are design instructions, not code; write production code the way this project already styles things.";

/** For comments and tasks: the same, in one line. */
const PROJECT_CODE = `**Write production code in the project's own styling system**, whatever it uses (Tailwind, CSS or Sass modules, StyleX, styled-components…), following how this element's component is styled: its tokens and scale, the rule that already styles it. ${PRODUCTION_CODE}`;

/** How an earlier action reads in a comment's thread. */
const ACTION_ASKED: Record<CommentAction, string> = {
  responsive: "asked you to make it responsive",
  "break-and-fix": "asked you to break and fix it",
  props: "asked for the component's props",
};

/** A prop's value as code reads it: a string quoted, a number or a boolean as is. */
function propValue(value: PropValue | undefined): string {
  return value === undefined ? "*not set*" : `\`${typeof value === "string" ? JSON.stringify(value) : String(value)}\``;
}

/**
 * `/props`: the agent reads the component's code and lists the props the
 * designer can set on this instance (pilot_done's `props`), changing
 * nothing. A simple job: any model can read a component's props.
 */
function formatProps(changeSet: ChangeSet, request: PropsRequest): string {
  const { page, note } = changeSet;
  const current = Object.entries(request.current);
  const lines = [
    "# Pilot: props",
    "",
    `A designer selected an instance of the \`${request.component}\` component in the browser with Pilot, to change it through its props from a list. Read the component's code and list its props for them. **Don't change any code.**`,
    "",
    `Page: ${page.url} (${page.title || "untitled"}), seen at ${page.viewport.width}x${page.viewport.height}`,
    "",
    ...elementsSection(request),
    ...(request.usedIn ? [`- This instance is written in: \`${request.usedIn}\``] : []),
    "",
    "## Its props now (read from the page)",
    "",
    ...(current.length ? current.map(([name, value]) => `- \`${name}\`: ${propValue(value)}`) : ["None that Pilot could read (it reads strings, numbers and on-off values)."]),
    ...(note?.trim() ? ["", `Designer note: ${note.trim()}`] : []),
    ...(request.attachments?.length ? ["", ...attachmentLines(request.attachments, `The designer attached ${countFiles(request.attachments.length)}:`)] : []),
    ...(request.references?.length ? ["", ...referenceLines(request.references)] : []),
    "",
    "## What to list",
    "",
    "- **The props that change how it looks or what it shows:** variants, sizes, tones, on-off flags (`disabled`, `loading`), short texts (a label, a title), numbers (a count). Not event handlers, refs, children, class names or styles.",
    "- **For each:** `name`; `type`: `options` (one of a set of values), `boolean`, `text` or `number`; for `options`, every value it accepts, from its types (a union like `\"primary\" | \"ghost\"`), its variants config (cva, tailwind-variants, a variants object), its prop validation (a Vue `validator`, `PropTypes.oneOf`), or how the component uses it; `default` when it has one; `description` in a few words when the name doesn't say.",
    "- The most useful first (the main variant, then the size, then the rest); 12 at most.",
    "",
    "Call `pilot_done` with this job's id, the list in `props`, and notes: one short sentence for the designer, like a chat message (\"Button has 3 props you can change\"). Pilot shows the props in the designer's thread, each with its value on this instance; what they pick comes back to you as a comment, a `name: value` line per prop (`tone: dark`), to set where this instance is written. If none is worth listing, say so in the notes and leave `props` out.",
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Break and fix: the designer asks the agent to stress-test one element with
 * odd but realistic content, fix what breaks without changing its usual
 * look, and put the real content back. Pilot's width check measures it, on
 * the agent's temporary content while it works, on the usual content after.
 */
function formatBreakFix(changeSet: ChangeSet, request: BreakFixRequest): string {
  const { page, note } = changeSet;
  const { breakpoints } = request;
  const several = requestTargets(request).length;
  const widths = breakpoints.length
    ? breakpoints.map((b) => `${b}px`).join(", ")
    : "none found (it may use container queries, or none yet)";
  const lines = [
    "# Pilot: break and fix",
    "",
    several > 1
      ? `A designer selected the ${several} elements below together in the browser with Pilot and asked you to stress-test each of them: make sure they hold up with real-world content, not only the placeholder values they were built with, and fix what breaks. Content should never break the layout.`
      : "A designer selected the element below in the browser with Pilot and asked you to stress-test it: make sure it holds up with real-world content, not only the placeholder values it was built with, and fix what breaks. Content should never break the layout.",
    "",
    `Page: ${page.url} (${page.title || "untitled"}), seen at ${page.viewport.width}x${page.viewport.height}`,
    `The page's breakpoints (the widths its media queries test): ${widths}`,
    "",
    ADVANCED_TASK,
  ];
  if (note?.trim()) lines.push("", `Designer note: ${note.trim()}`);
  if (request.attachments?.length)
    lines.push("", ...attachmentLines(request.attachments, `The designer attached ${countFiles(request.attachments.length)}:`));
  if (request.references?.length) lines.push("", ...referenceLines(request.references));
  lines.push(
    "",
    ...elementsSection(request),
    "",
    "## How to do it",
    "",
    "1. **Find the element's component and where its content comes from**: props, data, a CMS or an API, translations. List what can vary: each text, how many repeated items there are, optional parts (an image, a subtitle, a badge), numbers, names, URLs.",
    "2. **Think of the odd but realistic content each can get**: text far longer than the placeholder (a 120-character title, a long person or product name) and much shorter or empty; long words with no spaces (URLs, emails, IDs, compound words); optional parts missing (no image, no subtitle, an empty list) and many repeated items instead of a few; big numbers and prices; the longer strings of other languages; images (and background images) in odd shapes, very wide, very tall, tiny or low-resolution, and images that fail to load.",
    "3. **Break it on purpose, temporarily**: put that content in the page (the props, the fixture or data it renders, or the markup), let hot reload show it, and run `pilot_check_widths` with this job's id. It measures the element at every width in the designer's page and reports, as numbers, content sticking out of the viewport, spilling out of its parent, clipped, or overlapping. Read the code too, for what the check can't see: items that shrink when they shouldn't (an icon or avatar squeezed by flex), buttons that stretch, rows that misalign, text wrapping under an icon, images stretched or squashed (a distorted image keeps its box, so the check doesn't report it).",
    "4. **Fix what breaks, without changing how it looks with its usual content**, the way this project does it (its utilities, its components):",
    "   - **Long text:** truncate it with an ellipsis (`truncate`, `text-overflow: ellipsis`) where one line matters, or clamp it to a few lines (`line-clamp-*`) where it can wrap; when the full text is lost, show it on hover (`title`, or the project's tooltip).",
    "   - **Flex and grid:** `min-width: 0` (`min-w-0`) on items holding text so they can shrink; `flex-shrink: 0` (`shrink-0`) on icons, avatars and buttons that mustn't; `minmax(0, 1fr)` columns; wrapping rows (`flex-wrap`) instead of overflowing ones.",
    "   - **Long words:** `overflow-wrap: anywhere` (`break-words`) where text must wrap.",
    "   - **Images:** `object-fit: cover` for photos that should fill their frame, `contain` where cropping would lose something (logos, product shots); for background images, `background-size: cover` (or `contain`) with a sensible `background-position`. A fixed `aspect-ratio` (or size) on the frame, so the layout doesn't jump while an image loads or when its shape is odd, and a fallback when it fails or is missing (a plain background, initials, an icon), never a broken-image box.",
    "   - **Missing parts:** no gap or empty box left behind; a simple empty state only where one is clearly needed.",
    "   In the check, an ellipsis on your deliberately long text is the fix working, not a problem.",
    "5. **Put the real content back.** Remove every temporary value you added: nothing of the test may stay in the code. Then run `pilot_check_widths` again: with its usual content, the element must look as it did at the designer's width (the check reports any change there).",
    "6. **Report** in your notes, in a line or two, what broke and how you fixed it, and anything for the designer to decide (a content limit to agree on, an empty state to design). When you report it done, Pilot runs the width check once more, with the usual content: problems come back to you once, as a follow-up.",
    "",
    several > 1
      ? `Change only these elements and what they need (their children, their containers). If they come from a shared component, fix it there, so every instance gets sturdier, as long as its usual look doesn't change; ask before anything that would. ${FIRST_CHECKED}`
      : "Change only this element and what it needs (its children, its container). If it's a shared component, fix it there, so every instance gets sturdier, as long as its usual look doesn't change; ask before anything that would.",
    "",
    PROJECT_CODE,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Make responsive: the designer asks the agent to make one element work at
 * every viewport width. No values: the agent decides the changes, the way
 * the project already does responsive, and checks them in the browser.
 */
function formatResponsive(changeSet: ChangeSet, request: ResponsiveRequest): string {
  const { page, note } = changeSet;
  const { breakpoints } = request;
  const several = requestTargets(request).length;
  const widths = breakpoints.length
    ? breakpoints.map((b) => `${b}px`).join(", ")
    : "none found (it may use container queries, or none yet)";
  const lines = [
    "# Pilot: make responsive",
    "",
    several > 1
      ? `A designer selected the ${several} elements below together in the browser with Pilot and asked you to make each of them work well at every viewport width, from a narrow phone to a wide desktop. Decide the changes yourself and apply them to the source code.`
      : "A designer selected the element below in the browser with Pilot and asked you to make it work well at every viewport width, from a narrow phone to a wide desktop. Decide the changes yourself and apply them to the source code.",
    "",
    `Page: ${page.url} (${page.title || "untitled"}), seen at ${page.viewport.width}x${page.viewport.height}`,
    `The page's breakpoints (the widths its media queries test): ${widths}`,
    "",
    ADVANCED_TASK,
  ];
  if (note?.trim()) lines.push("", `Designer note: ${note.trim()}`);
  if (request.attachments?.length)
    lines.push("", ...attachmentLines(request.attachments, `The designer attached ${countFiles(request.attachments.length)}:`));
  if (request.references?.length) lines.push("", ...referenceLines(request.references));
  lines.push(
    "",
    ...elementsSection(request),
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
    several > 1
      ? `Change only these elements and what their layout needs (their containers, their children). ${FIRST_CHECKED}`
      : "Change only this element and what its layout needs (its container, its children).",
    "",
    SHARED_CODE,
    "",
    PROJECT_CODE,
  );
  return `${lines.join("\n")}\n`;
}

/**
 * A comment: the designer's words about one element, and the thread so far.
 * Simple, specific asks are done right away; open-ended ones are advanced
 * tasks (the stronger model). The agent's notes are its reply in the thread.
 */
function formatComment(changeSet: ChangeSet, request: CommentRequest, options: { guidelines?: boolean } = {}): string {
  const { page, edits } = changeSet;
  const { thread, breakpoints } = request;
  const several = requestTargets(request).length;
  const latest = thread.at(-1);
  const earlier = thread.slice(0, -1);
  const widths = breakpoints.length
    ? breakpoints.map((b) => `${b}px`).join(", ")
    : "none found (it may use container queries, or none yet)";
  const lines = [
    "# Pilot: comment",
    "",
    several > 1
      ? `A designer left a comment on the ${several} elements below, selected together in the browser with Pilot: it's about each of them. Do what it asks in the source code (or, if it's a question, answer it).`
      : "A designer left a comment on the element below, in the browser with Pilot. Do what it asks in the source code (or, if it's a question, answer it).",
    "",
    `Page: ${page.url} (${page.title || "untitled"}), seen at ${page.viewport.width}x${page.viewport.height}`,
    `The page's breakpoints (the widths its media queries test): ${widths}`,
    "",
    ...elementsSection(request),
    "",
    "## The comment",
    "",
    // Props set from the thread, with no words: the props are the comment.
    ...(latest?.props && !latest.text.trim() && !latest.attachments?.length ? ["The designer set props on this instance (below), with no words."] : commentLines(latest)),
  ];
  // Props the designer picked from the agent's `/props` list: set where this instance is written.
  if (latest?.props?.set.length) {
    const { component, usedIn, set } = latest.props;
    lines.push(
      "",
      "## Props to set",
      "",
      `The designer picked new values for this \`${component}\` instance's props from the list you gave (the \`name: value\` lines in their comment):`,
      "",
      ...set.map((c) => `- \`${c.name}\`: ${propValue(c.from)} → ${propValue(c.to)}`),
      "",
      `Set them where this instance is written${usedIn ? ` (\`${usedIn}\`, its \`<${component} …>\`)` : ` (its \`<${component} …>\`)`}, not in the component itself: only this instance changes. If that line renders several instances (a loop over data) or the value comes from data or a variable, ask with \`pilot_done\`'s question and choices before changing it for all of them. Pilot reads the instance's props on the page when you're done.`,
    );
  }
  // The designer's edits on these elements, sent with the comment: exact values, applied as Send's are (and checked by Pilot after).
  if (edits.length) {
    lines.push(
      "",
      "## The designer's edits, sent with the comment",
      "",
      "Before writing it, the designer changed these in Pilot's editor: apply them too, exactly, as design edits. The comment may be about them (\"like this, on mobile too\"). Pilot checks them on the page when you're done.",
      "",
      ...(options.guidelines === false ? [EDIT_GUIDELINES_REMINDER] : ["Guidelines:", ...EDIT_GUIDELINES]),
    );
    edits.forEach((edit, index) => lines.push("", ...formatEdit(edit, index + 1).map((l) => (l.startsWith("## ") ? `#${l}` : l))));
    lines.push(...fileTokenLines(changeSet.fileTokens));
  }
  if (earlier.length) {
    lines.push("", "## The thread so far (you already did what it asked)", "");
    for (const m of earlier) {
      const files = m.attachments?.length ? ` (${countFiles(m.attachments.length)})` : "";
      const action = m.action ? ` (${ACTION_ASKED[m.action]})` : "";
      lines.push(`- **${m.from === "designer" ? "Designer" : "You"}:**${action}${files} ${m.text.replace(/\s*\n\s*/g, " ")}`.trimEnd());
    }
  }
  lines.push(
    "",
    "## How to do it",
    "",
    "- **A specific, small ask** (a color, a size, a spacing, a text): make it right away, in the project's conventions (its tokens, utilities, components). Speed matters: no screenshots or builds.",
    "- **An open-ended ask that needs design judgment** (make it calmer, rework this layout): it's an advanced task. If you can hand work to a more capable model than the one you run on (a subagent, or another model your agent offers), do: give it this prompt (with the job id), and report back with its notes.",
    `- The designer was looking at the page ${page.viewport.width}px wide. If the comment is about how it looks at that width only, scope the change with the project's breakpoints; otherwise it's for every width.`,
    `- ${PROJECT_CODE}`,
    several > 1 ? "- Change only what the comment is about, on each of these elements." : "- Change only what the comment is about.",
    `- ${SHARED_CODE}`,
    "- **A question, not a change:** answer it, and change nothing.",
    "- **Your notes are your reply in the designer's thread, a small chat box for quick design back-and-forth:** keep it to one short sentence, like a chat message (about 120 characters at most): what you changed, or your answer, or the one thing you need from them. No lists, headings or code blocks; inline `code` for a value or a file name at most. Not a report: the designer sees the result on the page.",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * The latest comment: its words, quoted, and its attachments, saved in the
 * OS temp folder. Images and text files come with the job (Pilot shows them
 * to the agent); PDFs are read from their path. With no words, the
 * attachments are the comment.
 */
function commentLines(message: CommentMessage | undefined): string[] {
  const text = message?.text.trim() ?? "";
  const files = message?.attachments ?? [];
  const out = text ? [quote(text)] : [];
  // What the designer mentioned with `@`, picked from Pilot's list: exact names, to use as they are.
  const references = message?.references ?? [];
  if (references.length) out.push("", ...referenceLines(references));
  if (!files.length) return out.length ? out : ["> (empty)"];
  const one = files.length === 1;
  if (out.length) out.push("");
  out.push(
    text
      ? `The designer attached ${countFiles(files.length)} to it:`
      : `The comment is ${countFiles(files.length)}, with no words. ${one ? "It" : "They"} may hold the instructions: a screenshot, a sketch, notes, a spec. If it's unclear what to do, ask in your reply instead of guessing.`,
    "",
    ...attachmentLines(files),
  );
  return out;
}

/** What the designer mentioned with `@`, exact, as the agent reads it. */
function referenceLines(references: CommentReference[]): string[] {
  const picked = references.some((r) => r.kind !== "unlisted");
  return [
    picked
      ? "What it mentions with `@`, each as it reads in the comment (the ones picked from Pilot's list are exact: use them, don't look for others):"
      : "What it mentions with `@`, as it reads in the comment:",
    "",
    ...references.map(referenceLine),
  ];
}

/**
 * A mentioned token, component or element, as the agent reads it: first as
 * it reads in the comment, then what it is and where to find it (a file and
 * line when Pilot knows them; else what to search for).
 */
function referenceLine(reference: CommentReference): string {
  const as = `- \`${mentionText(reference)}\`:`;
  if (reference.kind === "token" && reference.source)
    return `${as} a design token from the project's files (\`${reference.source.file}${reference.source.line ? `:${reference.source.line}` : ""}\`), now \`${reference.value}\`. Use this token the way the project does (its utility, its variable, its theme); it isn't a CSS variable on the page.`;
  if (reference.kind === "token")
    return `${as} a design token (a CSS variable on the page), now \`${reference.value}\`. Use this token (\`var(${reference.name})\`, or the project's form of it).`;
  if (reference.kind === "unlisted")
    return `${as} a name the designer typed that Pilot didn't find on the page or among the project's components: probably a component or a part of the page. Search the project for \`${reference.name}\`, and ask in your reply if it's unclear what it is.`;
  if (reference.kind === "component") {
    const t = reference.target;
    const source = reference.source ?? (t?.source?.file ? { file: t.source.file, line: t.source.line } : undefined);
    const where = source
      ? `, declared in \`${source.file}${source.line ? `:${source.line}` : ""}\``
      : `; find its declaration (\`function ${reference.name}\`, \`const ${reference.name} =\`, \`class ${reference.name}\`, or a \`${reference.name}.vue\` or \`.svelte\` file)`;
    return t
      ? `${as} the \`${reference.name}\` component${where}; one of its instances on the page: \`${t.selector}\`.`
      : `${as} the \`${reference.name}\` component${where}. It isn't on this page.`;
  }
  const el = reference.target;
  const component = el.source?.component ? `, inside the \`${el.source.component}\` component` : "";
  return `${as} an element on the page: \`${el.path}\`, selector \`${el.selector}\`${el.text ? `, text "${el.text}"` : ""}${component}.`;
}

/** Attached files, one per line with how the agent gets each; after `intro` when given. */
function attachmentLines(files: CommentAttachment[], intro?: string): string[] {
  const lines = files.map((file) => {
    const kind = attachmentKind(file.id);
    const how =
      kind === "pdf"
        ? "a PDF: open it at this path"
        : kind === "image"
          ? "an image, shown with this job"
          : "a text file, its contents shown with this job";
    return `- ${file.name ? `${file.name} ` : ""}(${how}): \`${file.path ?? file.id}\``;
  });
  return intro ? [intro, "", ...lines] : lines;
}

/** "a file", "3 files". */
function countFiles(n: number): string {
  return n === 1 ? "a file" : `${n} files`;
}

/** Text as a Markdown quote, line by line. */
function quote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}

/** Pilot's width check, on a task about several elements. */
const FIRST_CHECKED = "Pilot's width check (`pilot_check_widths`, and the one after you're done) measures the first of them; read the code for the others.";

/** The element a request is about, or each of the elements selected together. */
function elementsSection(request: AgentRequest): string[] {
  const targets = requestTargets(request);
  if (targets.length === 1) return [`## \`${request.target.path}\``, "", ...targetLines(request.target)];
  const out = [`## The elements (${targets.length})`];
  targets.forEach((target, i) => out.push("", `### ${i + 1}. \`${target.path}\``, "", ...targetLines(target)));
  return out;
}

/** How to find an element: selector, text, source hint. */
function targetLines(target: ElementTarget): string[] {
  const out = [`- Selector: \`${target.selector}\``];
  if (target.text) out.push(`- Text: "${target.text}"`);
  if (target.source?.component || target.source?.file) {
    const { component, file, line } = target.source;
    const where = [component && `\`${component}\``, file && `\`${file}${line ? `:${line}` : ""}\``].filter(Boolean).join(", in ");
    out.push(`- Component: ${where}`);
  }
  if (target.lookAlikes) {
    const of = target.lookAlikesOf ? `other instances of \`${target.lookAlikesOf}\`, the same part of each` : "the same part of other copies";
    out.push(`- Look-alikes: ${target.lookAlikes} more on the page (${of}), not in this job`);
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
