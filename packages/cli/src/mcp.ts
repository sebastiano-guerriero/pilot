import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentInfo, Job } from "@pilot/protocol";
import { DEFAULT_BRIDGE_PORT, EDIT_GUIDELINES, formatPrompt, formatWidthCheck, MAX_CHOICES, MAX_PROPS, originOf, propsOf, questionOf, SHARED_CHOICES, sharedChoiceMeaning } from "@pilot/protocol";
import { z } from "zod";
import { Bridge } from "./agent.ts";
import { attachmentBlocks } from "./attachments.ts";
import { searchable, whereSection, withComponentFiles } from "./locate.ts";
import { clientOf, RESTART } from "./clients.ts";
import { installedVersion } from "./init.ts";
import { olderThan, VERSION } from "./version.ts";

/**
 * Pilot's MCP server: the tools an agent uses to hand the UI to the designer
 * and apply what they send back. The loop (the /pilot skill):
 *   pilot_launch(url) → pilot_wait_for_edits → apply → pilot_done → wait again…
 */

/**
 * How long one pilot_wait_for_edits call waits before returning "no edits
 * yet" (PILOT_WAIT_MS overrides it):
 * - Claude Code: 25 minutes. Its tool calls may run for hours, it moves a
 *   call still running after 2 minutes to the background (the chat stays
 *   usable, and the job arrives as a notification), and our progress
 *   notifications keep it under its 30-minute idle limit for stdio servers.
 *   Long waits mean fewer "no edits yet" turns for the agent.
 * - Other clients: 50 seconds, under the 60-second request timeout MCP
 *   clients use by default.
 */
export function waitMsFor(clientName: string | undefined): number {
  const configured = Number(process.env.PILOT_WAIT_MS);
  if (configured > 0) return configured;
  return clientName === "claude-code" ? 25 * 60_000 : 50_000;
}
/** How often a waiting call tells the agent it's still waiting (MCP progress). */
const PROGRESS_MS = 20_000;

export const INSTRUCTIONS = `Pilot lets the designer edit the running app in the browser and send the edits back to you as jobs.

The loop, when the user asks to launch or start Pilot, runs /pilot, or asks to hand the design over:
1. Find the page: the URL of the app's dev server, from the dev script and its config (vite.config → server.port, Next.js → 3000, a --port flag…) or a server already running. If it isn't running, start it in the background; if you can't tell the URL, ask. Call pilot_launch with that URL and \`folder\`, the project's folder as an absolute path (your working directory: Pilot searches the code there for each job, and some clients start its server in another folder): Pilot opens in that page (if the page isn't open, tell the user to open it), then tell the user in one line that Pilot is ready: select an element, edit, press Send.
2. Call pilot_wait_for_edits. It returns a job when the designer presses Send, or "no edits yet" after a while: then call it again. (In Claude Code a long wait moves to the background: the job arrives as its result.)
3. Apply the job's edits to the source: they're design instructions, not code, so write production code the way the project already styles things, whatever it uses (see the job's guidelines). Edits are basic: every value is given, so be fast (no screenshots or browser checks: Pilot checks the page). A "make responsive" job is an advanced task: make one element work at every viewport width. A "break and fix" job is one too: stress-test one element with odd but realistic content, fix what breaks, and put the real content back. Their prompts list the steps; check the result with pilot_check_widths (numbers for every width, instead of screenshots). If you can hand advanced tasks to a more capable model than the one you run on (a subagent, or another model your agent offers), do. A "comment" job is the designer's own words about one element: do what it asks (simple asks right away, open-ended ones as advanced tasks), and your pilot_done notes are your reply in their thread: one short sentence, like a chat message, not a report.
4. Call pilot_done with the job id and short notes (values you approximated, anything you did differently). When part of a job needs the designer's decision (they changed only some copies of shared code: each element's "Look-alikes" line counts the others; the jobs' guidelines say when, and what each answer means), do the rest, leave that part, and ask with pilot_done's question and choices ("${SHARED_CHOICES.all.label}", "${SHARED_CHOICES.one.label}", "${SHARED_CHOICES.variant.label}", your suggestion first); go on with other jobs, and their answer comes back as that job. Then call pilot_wait_for_edits again. When several jobs were queued, one wait returns them all: do them all, then call pilot_done once per job, each with its own id and notes.

When the user asks to update Pilot: run \`npx usepilot@latest update\` in the app's folder and tell them, in a few lines, what it prints (the new version, and the steps left).

Keep looping until the user interrupts you. Between jobs keep your messages short: a line on what you changed (and anything you approximated) is enough. If the user talks to you meanwhile, help them, then wait again: queued jobs are kept. Pilot keeps previewing each job's changes until you call pilot_done, then checks them against the page's real CSS: changes that didn't land come back once as a follow-up job with what the page gives instead.`;

/** "Claude Code · pilot": the agent's app and its project folder. */
function agentLabel(clientName: string | undefined, cwd: string): string {
  const names: Record<string, string> = {
    "claude-code": "Claude Code",
    "claude-ai": "Claude",
    cursor: "Cursor",
    "cursor-vscode": "Cursor",
    vscode: "VS Code",
    windsurf: "Windsurf",
    codex: "Codex",
  };
  const app = (clientName && (names[clientName.toLowerCase()] ?? clientName)) || "Agent";
  return `${app} · ${basename(cwd)}`;
}

/**
 * What the agent reads for a job: the change set's prompt (or the
 * follow-up), where its elements' code probably is (`where`, found by Pilot
 * in the project), then what to do when done. The edit guidelines aren't
 * repeated: the agent read them in `pilot_wait_for_edits`'s description.
 */
export function jobPrompt(job: Job, where = ""): string {
  const body =
    job.attempt === 2 && job.issues?.length
      ? taskFollowUp(job)
      : job.attempt === 2 && job.differences?.length
        ? followUp(job)
        : job.answer && job.question
          ? answered(job)
          : formatPrompt(job.changeSet, { guidelines: false });
  return `${body}${where ? `\n${where}\n` : ""}
---
Pilot job \`${job.id}\`. When you've applied it, call \`pilot_done\` with \`jobId: "${job.id}"\` and short notes (${notesFor(job)}). Then call \`pilot_wait_for_edits\` again for the next job.
`;
}

/**
 * A job back with the designer's answer to the agent's question (see
 * pilot_done): what was asked and answered, then the job for reference.
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
    "Do what's left of the job the way they answered, then call `pilot_done` again. Pilot then checks it like any job. (Don't ask again: say anything still open in your notes.)",
    "",
    "The job, for reference:",
    "",
    formatPrompt(job.changeSet, { guidelines: false }),
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

/** At most this many jobs come in one wait: past it, the next wait takes the rest. */
export const MAX_BATCH = 6;

/**
 * The jobs already queued for the page when the agent takes `first`, taken
 * with it (each `take` returns one at once, or none), so several Sends made
 * while the agent worked cost one round trip instead of one each. Each stays
 * a job of its own: the page tracks and checks it, and the agent reports it
 * done by its id. An advanced task (Make responsive, Break and fix) comes
 * alone, and ends a batch: it takes long, and the quick ones shouldn't wait
 * behind it.
 */
export async function takeQueued(first: Job, take: () => Promise<{ job: Job | null }>): Promise<Job[]> {
  const advanced = (j: Job) => !!j.changeSet.request && j.changeSet.request.kind !== "comment" && j.changeSet.request.kind !== "props";
  if (advanced(first)) return [];
  const more: Job[] = [];
  while (more.length < MAX_BATCH - 1) {
    const { job } = await take();
    if (!job) break;
    more.push(job);
    if (advanced(job)) break;
  }
  return more;
}

/** Above a batch: several jobs, each to report done on its own. */
export function batchIntro(jobs: Job[]): string {
  return `# Pilot: ${jobs.length} jobs

The designer sent these while you were busy. Do them all (they're on different elements), then call \`pilot_done\` once per job, each with its own id and notes (you can make the calls together): ${jobs.map((j) => `\`${j.id}\``).join(", ")}. Then call \`pilot_wait_for_edits\` again.`;
}

/** What `pilot_done`'s notes should say, per kind of job. */
function notesFor(job: Job): string {
  switch (job.changeSet.request?.kind) {
    case "comment":
      return "your reply in the designer's comment thread, a small chat box: one short sentence, about 120 characters at most, with what you changed or your answer; no lists or code blocks";
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
      formatPrompt(job.changeSet, { guidelines: false }),
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
    "Fix them, then run `pilot_check_widths` to confirm before `pilot_done`. If one is deliberate, keep it and say why in your notes. Pilot takes what the code gives after this.",
    "",
    "The task, for reference:",
    "",
    formatPrompt(job.changeSet),
  ];
  return lines.join("\n");
}

/**
 * A project's folder Pilot can search (absolute, there, with a package.json
 * or a .git), from a path or a `file://` URI; null otherwise.
 */
export function projectFolder(candidate: string | undefined): string | null {
  if (!candidate) return null;
  let path = candidate;
  if (path.startsWith("file://")) {
    try {
      path = fileURLToPath(path);
    } catch {
      return null;
    }
  }
  if (!isAbsolute(path)) return null;
  path = resolve(path);
  return existsSync(path) && searchable(path) ? path : null;
}

export function createPilotServer(options: { port?: number; cwd?: string; waitMs?: number } = {}) {
  const port = options.port ?? (Number(process.env.PILOT_PORT) || DEFAULT_BRIDGE_PORT);
  // The project's folder: where Pilot searches the code (the elements' lines, the components' files) and what the
  // agent is labeled by. The folder the server started in, when it's a project (Claude Code starts it there); else
  // the client's workspace (its MCP roots), or the folder the agent passes to pilot_launch: Cursor starts a server
  // set up for the machine in the home folder.
  const cwd = options.cwd ?? process.cwd();
  let project = cwd;
  let client: string | undefined;
  // Known once the client has connected (see waitMsFor).
  let waitMs = options.waitMs ?? waitMsFor(undefined);
  const server = new McpServer({ name: "pilot", version: VERSION }, { instructions: INSTRUCTIONS });
  const agent: AgentInfo = { id: randomUUID(), label: agentLabel(undefined, cwd), ...(searchable(cwd) ? { folder: cwd } : {}) };
  const bridge = new Bridge(agent, port);
  let origin: string | null = null;
  const useProject = (folder: string) => {
    project = folder;
    agent.label = agentLabel(client, folder);
    // For the hub, which reads the project's components from it (never shown to pages).
    agent.folder = folder;
  };

  // The client's name is known once it has connected, and so are its workspace folders, when it shares them.
  server.server.oninitialized = () => {
    client = server.server.getClientVersion()?.name;
    agent.label = agentLabel(client, project);
    waitMs = options.waitMs ?? waitMsFor(client);
    if (searchable(project) || !server.server.getClientCapabilities()?.roots) return;
    void server.server
      .listRoots()
      .then(({ roots }) => {
        const folder = roots.map((r) => projectFolder(r.uri)).find((f): f is string => !!f);
        if (folder && !searchable(project)) useProject(folder);
      })
      .catch(() => {});
  };

  const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

  server.registerTool(
    "pilot_launch",
    {
      title: "Launch Pilot",
      description:
        "Opens Pilot in the page the designer works on, and routes that page's edits to you. Call it first when the user asks to launch or start Pilot (or runs /pilot). Then call pilot_wait_for_edits.",
      inputSchema: {
        url: z
          .string()
          .describe("The page's URL on the app's dev server, e.g. http://localhost:5173 (find it in the dev server's config or output)."),
        folder: z
          .string()
          .optional()
          .describe(
            "The project's folder, as an absolute path: your working directory (the app's folder, with its package.json). Pilot searches its code there for each job. Always pass it: some clients start Pilot's server in another folder.",
          ),
      },
    },
    async ({ url, folder }) => {
      const o = originOf(url);
      if (!o) return text(`"${url}" isn't a page URL. Pass the dev server's URL, e.g. http://localhost:5173.`, true);
      origin = o;
      const given = projectFolder(folder);
      if (given) useProject(given);
      // Started outside the project, and no folder to go by: say so, so the agent passes it.
      const lost =
        !searchable(project) && !given
          ? ` Pilot can't search the project's code from ${project}${folder ? ` (nor from ${folder}: it needs a package.json or a .git)` : ""}: call pilot_launch again with \`folder\` set to the project's folder (absolute).`
          : "";
      try {
        const pages = await bridge.launch(o);
        const where =
          pages > 0
            ? `Pilot is open in ${pages === 1 ? "the page" : `${pages} pages`} at ${o}.`
            : `No page at ${o} is connected yet. Ask the designer to open ${url} (with the dev server running): Pilot opens there.`;
        // This server and the project's Pilot on different versions: they may not meet (each version's hub has its port).
        // Older here: a client that keeps its server running (Cursor), or an old `npx usepilot` registration, which
        // keeps its first download (update moves it to @latest). Older there: the project wasn't updated.
        const installed = searchable(project) ? installedVersion(project, project) : null;
        const stale =
          installed && olderThan(VERSION, installed)
            ? ` This chat's Pilot server is ${VERSION}, older than the project's ${installed}, so they may not connect. Don't look into ports or processes: tell the user to run \`npx usepilot@latest update\` in the app's folder (it makes the server start the latest Pilot), then restart it. ${RESTART[clientOf(client) ?? "other"]}`
            : installed && pages === 0 && olderThan(installed, VERSION)
              ? ` The project's Pilot is ${installed}, older than this server's ${VERSION}, so the page may not connect. Don't look into ports or processes: tell the user to run \`npx usepilot@latest update\` in the app's folder, then restart the app's dev server.`
              : "";
        return text(`${where} Now call pilot_wait_for_edits and wait for the designer to press Send.${lost}${stale}`);
      } catch (error) {
        return text(`Pilot couldn't start its bridge: ${(error as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "pilot_wait_for_edits",
    {
      title: "Wait for design edits",
      // The edit guidelines live here, read once with the tool, not repeated in every job (they're the most frequent).
      description: `Waits for the designer to press Send in Pilot, and returns the job to apply (or several, when they were queued: do them all, and report each done). Returns "no edits yet" after a few minutes: call it again to keep waiting. Call pilot_launch first.

Guidelines for every design-edits job (the job doesn't repeat them):
${EDIT_GUIDELINES.join("\n")}`,
      inputSchema: {},
    },
    async (_args, extra) => {
      if (!origin) return text("Call pilot_launch with the page's URL first.", true);
      const token = extra._meta?.progressToken;
      let progress = 0;
      const ticker =
        token !== undefined
          ? setInterval(() => {
              extra
                .sendNotification({
                  method: "notifications/progress",
                  params: { progressToken: token, progress: ++progress, message: "Waiting for the designer to send edits" },
                })
                .catch(() => {});
            }, PROGRESS_MS)
          : null;
      try {
        const { job } = await bridge.wait(origin, waitMs, extra.signal);
        if (!job) return text("No edits yet. Call pilot_wait_for_edits again to keep waiting (the designer can keep editing meanwhile).");
        // The other jobs already queued for this page come too (see takeQueued): one round trip for several Sends.
        const jobs = [job, ...(await takeQueued(job, () => bridge.wait(origin as string, 0, extra.signal)))];
        const parts = await Promise.all(
          jobs.map(async (taken) => {
            // Its components' files, found here by name when the page couldn't tell (React 19 under Turbopack, Server Components).
            const j = withComponentFiles(taken, project);
            return {
              // Where its elements' code probably is: found here, in the project, so the agent can go straight to the edit.
              text: jobPrompt(j, j.attempt === 2 ? "" : whereSection(j, project)),
              // A comment's images and text files come with it, so the agent sees them without opening files.
              blocks: await attachmentBlocks(j),
            };
          }),
        );
        if (parts.length === 1) return { content: [{ type: "text" as const, text: parts[0]?.text ?? "" }, ...(parts[0]?.blocks ?? [])], isError: false };
        return {
          content: [
            { type: "text" as const, text: batchIntro(jobs) },
            ...parts.flatMap((p, i) => [{ type: "text" as const, text: `## Job ${i + 1} of ${jobs.length}\n\n${p.text}` }, ...p.blocks]),
          ],
          isError: false,
        };
      } catch (error) {
        return text(`Pilot's bridge failed while waiting: ${(error as Error).message}. Call pilot_wait_for_edits again.`, true);
      } finally {
        if (ticker) clearInterval(ticker);
      }
    },
  );

  server.registerTool(
    "pilot_done",
    {
      title: "Report a job done",
      description:
        "Tells Pilot you applied a job. Pilot then checks each change against the page's real CSS; a change that didn't land comes back to you once as a follow-up. Then call pilot_wait_for_edits again. When part of the job needs the designer's decision (they changed only some copies of shared code), apply the rest, leave that part, and ask with `question`: Pilot shows it in a comment on the element, with one-click `choices`, holds the job until they answer, and their answer comes back to you as this job again. You go on with other jobs meanwhile. A job asks once. For a props job (\`/props\`), pass the component's props in \`props\`: Pilot shows them to the designer to pick values from.",
      inputSchema: {
        jobId: z.string().describe("The job's id, from pilot_wait_for_edits."),
        notes: z
          .string()
          .optional()
          .describe("Short notes for the designer: values you approximated (e.g. 22px → pt-6, 24px), anything done differently."),
        question: z
          .object({
            text: z.string().describe("One short sentence, the component's name in **bold** (it's shown as markdown), e.g. \"This title comes from the shared **Card**: change every card, or only this one?\""),
            choices: z
              .array(z.string())
              .max(MAX_CHOICES)
              .optional()
              .describe(
                `One-click answers, a few words each (they sit on one line), your suggestion first (it's the main button). For shared code: "${SHARED_CHOICES.all.label}", "${SHARED_CHOICES.one.label}", "${SHARED_CHOICES.variant.label}". The designer can also write their own.`,
              ),
          })
          .optional()
          .describe("Only when part of the job needs the designer's decision: see the description."),
        props: z
          .array(
            z.object({
              name: z.string().describe("The prop's name, as the code has it (`variant`)."),
              type: z.enum(["options", "boolean", "text", "number"]).describe("`options`: one of a set of values; `boolean`: on or off; `text` or `number`: typed."),
              options: z.array(z.string()).optional().describe("For `options`: every value it accepts, in the code's order."),
              default: z.union([z.string(), z.number(), z.boolean()]).optional().describe("Its default value, when it has one."),
              description: z.string().optional().describe("What it does, in a few words, when the name doesn't say."),
            }),
          )
          .max(MAX_PROPS)
          .optional()
          .describe("Only for a props job (`/props`): the component's props the designer can set, the most useful first."),
      },
    },
    async ({ jobId, notes, question, props }) => {
      try {
        const asked = questionOf(question);
        const job = await bridge.done(jobId, notes, asked, propsOf(props));
        if (!job) return text(`Pilot doesn't know job ${jobId} (or the designer cancelled it). Call pilot_wait_for_edits for the next one.`);
        if (asked && job.question)
          return text("Done. Pilot shows your question to the designer; their answer comes back as this job. Call pilot_wait_for_edits for the next job meanwhile.");
        if (asked) return text("Done. This job was answered already, so the question wasn't asked: Pilot is checking the changes. Say it in your notes next time. Call pilot_wait_for_edits for the next job.");
        return text("Done. Pilot is checking the changes in the page. Call pilot_wait_for_edits for the next job.");
      } catch (error) {
        return text(`Pilot couldn't report the job done: ${(error as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "pilot_check_widths",
    {
      title: "Check an element at every width",
      description:
        "For a Make responsive or Break and fix job: Pilot loads the page in hidden frames at a phone width, each breakpoint and just below it, a wide desktop and the designer's width, and measures the job's element in each. Returns each width's size and layout, and problems (sticking out of the viewport, spilling out of its parent, clipped content, overlaps), plus what changed at the designer's width. Use it instead of screenshots; fix the problems and run it again until it finds none.",
      inputSchema: {
        jobId: z.string().describe("The Make responsive or Break and fix job's id, from pilot_wait_for_edits."),
      },
    },
    async ({ jobId }) => {
      try {
        const check = await bridge.check(jobId);
        if (!check) {
          return text(
            `Pilot couldn't check job ${jobId}: no page answered. The page with Pilot must be open (the designer's tab), and the job must be a Make responsive or Break and fix one. If you can, check the widths in a browser instead.`,
            true,
          );
        }
        return text(formatWidthCheck(check));
      } catch (error) {
        return text(`Pilot couldn't run the width check: ${(error as Error).message}`, true);
      }
    },
  );

  return { server, bridge, agent };
}
