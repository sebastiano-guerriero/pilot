import type { Job } from "@pilot/protocol";
import { formatPrompt, type PromptOptions, sharedChoiceMeaning, SKILL_NAME } from "@pilot/protocol";

/**
 * What the agent reads for a job Pilot runs it for (run.ts): the change
 * set's prompt (`formatPrompt()`: the
 * guidelines in full, since a fresh session hasn't read them), or the
 * follow-up, where its elements' code probably is (`where`, found by Pilot
 * in the project), then the footer: the reply is the notes, with a question
 * or a props list in a `pilot` block at its end (see replyOf in run.ts).
 */
export function jobPrompt(job: Job, where = "", options: PromptOptions = {}): string {
  const body =
    job.attempt === 2 && job.issues?.length
      ? taskFollowUp(job)
      : job.attempt === 2 && job.differences?.length
        ? followUp(job)
        : job.answer && job.question
          ? answered(job)
          : formatPrompt(job.changeSet, options);
  return `${body}${where ? `\n${where}\n` : ""}
---
${runFooter(job)}
`;
}

/**
 * The end of a run's prompt: the reply is the notes; a question or a props
 * list goes in a `pilot` block. And the speed rule, since nothing else in a
 * run says it: Pilot checks the page itself.
 */
function runFooter(job: Job): string {
  const props = job.changeSet.request?.kind === "props";
  return [
    skillOf(job)
      ? `When you're done, reply with your notes for the designer: ${notesFor(job)}. Pilot shows them to the designer in the element's thread.`
      : `When you're done, reply with your notes for the designer: ${notesFor(job)}. Concise, no headings ("Done." when there's nothing to add): Pilot shows them to the designer in a small box, and checks the page itself, so don't open a browser, start a dev server, or run builds or tests, and don't check your edit afterwards (no git diff, script or second read of the file): Pilot does.`,
    "",
    props
      ? "Put the props in a block at the very end of your reply, after your notes, as JSON:"
      : "If you ask the designer a question (only where this job says to), put it in a block at the very end of your reply, after your notes, as JSON:",
    "",
    "```pilot",
    props
      ? '{"props": [{"name": "tone", "type": "options", "options": ["light", "dark"], "default": "light", "description": "a few words, when the name doesn\'t say"}]}'
      : '{"question": {"text": "One short sentence?", "choices": ["Your suggestion", "Another"]}}',
    "```",
    ...(props ? ["", "`type` is one of `options`, `boolean`, `text`, `number`; `options` only for `options`."] : []),
  ].join("\n");
}

/**
 * A job back with the designer's answer to the agent's question: what was
 * asked and answered, then the job for reference.
 */
export function answered(job: Job): string {
  // A one-click answer to "all of them, or only this one?": what it asks of the code, spelled out.
  const meaning = job.answer ? sharedChoiceMeaning(job.answer) : null;
  return [
    "# Pilot: the designer answered your question",
    "",
    `You did this job and asked the designer: ${job.question?.text}`,
    "",
    "Their answer:",
    "",
    job.answer
      ?.trim()
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n"),
    "",
    ...(meaning ? [`What that means for the code: ${meaning}`, ""] : []),
    "Do what's left of the job the way they answered, then reply with your notes. Pilot then checks it like any job. (Don't ask again: say anything still open in your notes.)",
    "",
    "The job, for reference:",
    "",
    formatPrompt(job.changeSet),
  ].join("\n");
}

/**
 * The follow-up of a job: the changes that didn't come out as the designer
 * set them, with what the page gives instead, found by their elements.
 * Pilot takes what the code gives after it, so it says to keep a deliberate
 * approximation and explain it.
 */
export function followUp(job: Job): string {
  const lines = [
    "# Pilot design edits: follow-up",
    "",
    "You applied this job, but Pilot checked the page and these changes don't give the designer's value yet (the values are what the browser computes for the element):",
    "",
  ];
  for (const d of job.differences ?? []) {
    const edit = job.changeSet.edits.find((e) => e.target.selector === d.selector);
    const where = edit ? `\`${edit.target.path}\` (selector \`${d.selector}\`${edit.target.text ? `, text "${edit.target.text}"` : ""})` : `\`${d.selector}\``;
    // A change to the DOM itself: in words, there's no value to compare.
    lines.push(`- ${where}: \`${d.property}\` should be \`${d.expected}\`, the page gives \`${d.actual ?? "?"}\`.`);
  }
  lines.push(
    "",
    "Fix them: the usual causes are a rule that overrides yours (more specific, later, or in a media query), an edit in the wrong file or component, or a missed change. If you chose a different value on purpose (a token or the nearest step in the project's scale), keep it and say so in your notes. Pilot takes what the code gives after this.",
  );
  return lines.join("\n");
}

/** What the notes should say, per kind of job. */
export function notesFor(job: Job): string {
  switch (job.changeSet.request?.kind) {
    case "comment":
      return skillOf(job)
        ? "your reply in the designer's comment thread, as the skill you used says to report (as long as it needs to be; Markdown shows)"
        : "your reply in the designer's comment thread, a small chat box: concise, like a chat message, a few short sentences at most, with what you changed or your answer";
    case "responsive":
      return "what changed at which widths, anything left for the designer";
    case "break-and-fix":
      return "what broke and how you fixed it, anything for the designer to decide";
    case "props":
      return "one short sentence for the designer, like a chat message; the props go in `props`";
    default:
      return "values you approximated, anything you did differently";
  }
}

/**
 * A task's follow-up (Make responsive, Break and fix): the problems Pilot's
 * width check found once the agent was done, then the task again for
 * reference.
 */
export function taskFollowUp(job: Job): string {
  const request = job.changeSet.request;
  const target = `\`${request?.target.path ?? "the element"}\``;
  // Props set from the thread: Pilot read the instance again, and these aren't what the designer picked.
  if (request?.kind === "comment")
    return [
      "# Pilot: props, follow-up",
      "",
      `You set the props the designer picked on ${target}, but Pilot read the instance on the page after hot reload, and these aren't what they picked yet:`,
      "",
      ...(job.issues ?? []).map((i) => `- ${i}`),
      "",
      "Fix them where this instance is written: the usual causes are another instance's line, a value the parent passes from a variable or data, or a default the prop falls back to. If one can't be set there, say why in your notes. Pilot takes what the code gives after this.",
      "",
      "The comment, for reference:",
      "",
      formatPrompt(job.changeSet),
    ].join("\n");
  const breakFix = request?.kind === "break-and-fix";
  const lines = [
    breakFix ? "# Pilot: break and fix, follow-up" : "# Pilot: make responsive, follow-up",
    "",
    breakFix
      ? `You stress-tested ${target} and reported it done, but Pilot's width check (the page with its usual content, measured at each width) finds these problems. If one comes from test content still in the code, remove it:`
      : `You made ${target} responsive, but Pilot's width check (the page measured at each width) still finds these problems:`,
    "",
    ...(job.issues ?? []).map((i) => `- ${i}`),
    "",
    "Fix them from the code (no browser). If one is deliberate, keep it and say why in your notes. Pilot takes what the code gives after this.",
    "",
    "The task, for reference:",
    "",
    formatPrompt(job.changeSet),
  ];
  return lines.join("\n");
}

/**
 * The skill a job's run starts with: the one the designer picked for the
 * comment it carries (its latest message). Not for its follow-up or an
 * answer: the session that used it is resumed. Only a skill's name (it's
 * the prompt's first line).
 */
export function skillOf(job: Job): string | undefined {
  const request = job.changeSet.request;
  if (request?.kind !== "comment" || job.attempt === 2 || job.answer) return undefined;
  const skill = request.thread.at(-1)?.skill;
  return skill && SKILL_NAME.test(skill) ? skill : undefined;
}
