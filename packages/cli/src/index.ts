#!/usr/bin/env node
/**
 * `usepilot` CLI entry: with no command, Pilot for this project (run.ts: it
 * runs your agent for each job); `init` sets Pilot up in a project, `update`
 * brings it up to date, `mcp` runs the MCP server and the bridge, `setup`
 * installs /pilot for Claude Code.
 */
import { createInterface } from "node:readline/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type AgentKind, AGENTS, isAgentKind } from "./agents.ts";
import { RunnerError, startRunner } from "./run.ts";
import { createPilotServer } from "./mcp.ts";
import { AGENT_IDS, type AgentId, init } from "./init.ts";
import { setup } from "./setup.ts";
import { update } from "./update.ts";

const HELP = `usepilot: design in your running app, your agents write the code

Usage: npx usepilot [command]

  (none)  Run Pilot for this project, in its folder, beside your dev server:
          it runs your coding agent's command-line tool for each job you send
          from the toolbar (Claude Code, Codex or Cursor, installed and signed
          in), and shows the jobs here. Ctrl+C stops it.
          --agent <claude|codex|cursor>: which agent (saved for the project)
          --url <address>: your app's address, when Pilot can't tell
  init    Set Pilot up in this project for your agent: installs it, connects
          the agent (its MCP server and the pilot skill, nothing for other
          agents), and prints what's left for it (loading Pilot in the app).
          Ask your agent to run it.
          --agent <claude-code|cursor|codex|vscode|other>: the agent running it
          --project: connect the agent in this repo (files to commit, for a
                     team) instead of once for every project on this machine
          --no-install: print the install command instead of running it
  update  Update Pilot in this project: the latest usepilot, and the pilot
          skill wherever init put it. Prints what's left (restart the app,
          open a new chat). Run it in the app's folder.
  setup   Set up /pilot in Claude Code, for every project on this machine
          (--project: for this repo, to commit, so everyone gets it)
  mcp     Run the MCP server (stdio) agents connect to, and the bridge the
          page talks to. Agents start it: register it with your agent.
  help    Show this message
`;

/** `pilot mcp`: the MCP server on stdio, until the agent closes it. */
async function runMcp(): Promise<void> {
  const { server, bridge } = createPilotServer();
  const close = async () => {
    await bridge.close();
    process.exit(0);
  };
  process.stdin.on("close", close);
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  await server.connect(new StdioServerTransport());
}

const [command = "run"] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.match(/^--(agent|url)$/));

/** A flag's value: `--name value` or `--name=value`. */
function flag(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return args[i]?.includes("=") ? args[i].slice(args[i].indexOf("=") + 1) : args[i + 1];
}

/** `--agent` for the runner: claude, codex or cursor (claude-code too). */
function runAgentArg(): AgentKind | undefined {
  const value = flag("agent")?.toLowerCase().replace(/^claude-code$/, "claude");
  if (value === undefined) return undefined;
  if (isAgentKind(value)) return value;
  throw new RunnerError(`--agent takes one of: ${Object.keys(AGENTS).join(", ")}.`);
}

/** Asks in the terminal: a numbered list, the answer's number (the first without a terminal). */
async function choose(question: string, options: string[]): Promise<number> {
  if (!process.stdin.isTTY) return 0;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`${question}\n${options.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}\n`);
    for (;;) {
      const n = Number((await rl.question("Number: ")).trim());
      if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
    }
  } finally {
    rl.close();
  }
}

/** `npx usepilot`: the runner, until Ctrl+C. */
async function run(): Promise<void> {
  const runner = await startRunner({ cwd: process.cwd(), agent: runAgentArg(), url: flag("url"), choose });
  let closing = false;
  const close = async () => {
    if (closing) process.exit(1);
    closing = true;
    process.stdout.write("Stopping Pilot…\n");
    await runner.close();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

/** `--agent <id>` or `--agent=<id>`; an unknown one fails, listing the known ones. */
function agentArg(): AgentId | undefined {
  const args = process.argv.slice(3);
  const i = args.findIndex((a) => a === "--agent" || a.startsWith("--agent="));
  if (i < 0) return undefined;
  const value = (args[i]?.includes("=") ? args[i].split("=")[1] : args[i + 1])?.toLowerCase();
  if (value && (AGENT_IDS as readonly string[]).includes(value)) return value as AgentId;
  throw new Error(`--agent takes one of: ${AGENT_IDS.join(", ")}.`);
}

switch (command) {
  case "run":
    try {
      await run();
    } catch (error) {
      process.stderr.write(error instanceof RunnerError ? `${error.message}\n` : `usepilot: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    break;
  case "help":
  case "--help":
  case "-h":
    process.stdout.write(HELP);
    break;
  case "mcp":
    await runMcp();
    break;
  case "setup":
    try {
      process.stdout.write(await setup({ project: process.argv.includes("--project") }));
    } catch (error) {
      process.stderr.write(`usepilot setup: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    break;
  case "init":
    try {
      process.stdout.write(
        await init({
          install: !process.argv.includes("--no-install"),
          agent: agentArg(),
          scope: process.argv.includes("--project") ? "project" : "machine",
        }),
      );
    } catch (error) {
      process.stderr.write(`usepilot init: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    break;
  case "update":
    try {
      process.stdout.write(await update());
    } catch (error) {
      process.stderr.write(`usepilot update: ${(error as Error).message}\n`);
      process.exitCode = 1;
    }
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
    process.exitCode = 1;
}
