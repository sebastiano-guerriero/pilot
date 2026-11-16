import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentInfo, Job } from "@pilot/protocol";
import { DEFAULT_BRIDGE_PORT, formatPrompt, originOf } from "@pilot/protocol";
import { z } from "zod";
import { Bridge } from "./agent.ts";

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

The loop, when the user runs /pilot or asks to hand the design over:
1. Call pilot_launch with the URL of the page the designer works on (the app's dev server, e.g. http://localhost:5173). Pilot opens in that page.
2. Call pilot_wait_for_edits. It returns a job when the designer presses Send, or "no edits yet" after a while: then call it again. (In Claude Code a long wait moves to the background: the job arrives as its result.)
3. Apply the job's edits to the source, in the project's conventions (see the job's guidelines).
4. Call pilot_done with the job id and short notes (values you approximated, anything you did differently). Then call pilot_wait_for_edits again.

Keep looping until the user interrupts you. Pilot keeps previewing each job's changes until you call pilot_done, then checks them against the page's real CSS: changes that didn't land come back once as a follow-up job with what the page gives instead.`;

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

/** What the agent reads for a job: the change set's prompt (or the follow-up), then what to do when done. */
export function jobPrompt(job: Job): string {
  const body = job.attempt === 2 && job.differences?.length ? followUp(job) : formatPrompt(job.changeSet);
  return `${body}
---
Pilot job \`${job.id}\`. When you've applied it, call \`pilot_done\` with \`jobId: "${job.id}"\` and short notes (values you approximated, anything you did differently). Then call \`pilot_wait_for_edits\` again for the next job.
`;
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
    lines.push(`- ${where}: \`${d.property}\` should be \`${d.expected}\`, the page gives \`${d.actual ?? "?"}\`.`);
  }
  lines.push(
    "",
    "Fix them: the usual causes are a rule that overrides yours (more specific, later, or in a media query), an edit in the wrong file or component, or a missed change. If you chose a different value on purpose (a token or the nearest step in the project's scale), keep it and say so in your notes. Pilot takes what the code gives after this.",
  );
  return lines.join("\n");
}

export function createPilotServer(options: { port?: number; cwd?: string; waitMs?: number } = {}) {
  const port = options.port ?? (Number(process.env.PILOT_PORT) || DEFAULT_BRIDGE_PORT);
  const cwd = options.cwd ?? process.cwd();
  // Known once the client has connected (see waitMsFor).
  let waitMs = options.waitMs ?? waitMsFor(undefined);
  const server = new McpServer({ name: "pilot", version: "0.3.0" }, { instructions: INSTRUCTIONS });
  const agent: AgentInfo = { id: randomUUID(), label: agentLabel(undefined, cwd) };
  const bridge = new Bridge(agent, port);
  let origin: string | null = null;

  // The client's name is known once it has connected.
  server.server.oninitialized = () => {
    const client = server.server.getClientVersion()?.name;
    agent.label = agentLabel(client, cwd);
    waitMs = options.waitMs ?? waitMsFor(client);
  };

  const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

  server.registerTool(
    "pilot_launch",
    {
      title: "Launch Pilot",
      description:
        "Opens Pilot in the page the designer works on, and routes that page's edits to you. Call it first when the user runs /pilot. Then call pilot_wait_for_edits.",
      inputSchema: {
        url: z
          .string()
          .describe("The page's URL on the app's dev server, e.g. http://localhost:5173 (find it in the dev server's config or output)."),
      },
    },
    async ({ url }) => {
      const o = originOf(url);
      if (!o) return text(`"${url}" isn't a page URL. Pass the dev server's URL, e.g. http://localhost:5173.`, true);
      origin = o;
      try {
        const pages = await bridge.launch(o);
        const where =
          pages > 0
            ? `Pilot is open in ${pages === 1 ? "the page" : `${pages} pages`} at ${o}.`
            : `No page at ${o} is connected yet. Ask the designer to open ${url} (with the dev server running): Pilot opens there.`;
        return text(`${where} Now call pilot_wait_for_edits and wait for the designer to press Send.`);
      } catch (error) {
        return text(`Pilot couldn't start its bridge: ${(error as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "pilot_wait_for_edits",
    {
      title: "Wait for design edits",
      description:
        'Waits for the designer to press Send in Pilot, and returns the job to apply. Returns "no edits yet" after a few minutes: call it again to keep waiting. Call pilot_launch first.',
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
        return text(jobPrompt(job));
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
        "Tells Pilot you applied a job. Pilot then checks each change against the page's real CSS; a change that didn't land comes back to you once as a follow-up. Then call pilot_wait_for_edits again.",
      inputSchema: {
        jobId: z.string().describe("The job's id, from pilot_wait_for_edits."),
        notes: z
          .string()
          .optional()
          .describe("Short notes for the designer: values you approximated (e.g. 22px → pt-6, 24px), anything done differently."),
      },
    },
    async ({ jobId, notes }) => {
      try {
        const job = await bridge.done(jobId, notes);
        if (!job) return text(`Pilot doesn't know job ${jobId} (or the designer cancelled it). Call pilot_wait_for_edits for the next one.`);
        return text("Done. Pilot is checking the changes in the page. Call pilot_wait_for_edits for the next job.");
      } catch (error) {
        return text(`Pilot couldn't report the job done: ${(error as Error).message}`, true);
      }
    },
  );

  return { server, bridge, agent };
}
