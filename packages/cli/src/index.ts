#!/usr/bin/env node
/**
 * `usepilot` CLI entry: with no command, Pilot for this project (run.ts: it
 * runs your agent for each job); `init` sets Pilot up in a project, `update`
 * brings it up to date, `guide` prints the user guide (bundled in, so it's
 * always this version's).
 */
import { createInterface } from "node:readline/promises";
import { type AgentKind, AGENTS, isAgentKind } from "./agents.ts";
import guide from "../../usepilot/GUIDE.md";
import { init } from "./init.ts";
import { RunnerError, startRunner } from "./run.ts";
import { update } from "./update.ts";

const HELP = `usepilot: design in your running app, your agents write the code

Usage: npx usepilot [command]

  (none)  Run Pilot for this project, in its folder, beside your dev server:
          it runs your coding agent's command-line tool for each job you send
          from the toolbar (Claude Code, Codex or Cursor, installed and signed
          in), and shows the jobs here. Ctrl+C stops it.
          --agent <claude|codex|cursor>: which agent (saved for the project)
          --url <address>: your app's address, when Pilot can't tell
  init    Set Pilot up in this project: installs it, checks your agent's
          command-line tool, removes Pilot's old chat setup, and prints
          what's left (loading Pilot in the app). Ask your agent to run it.
          --agent <claude|codex|cursor>: the agent Pilot runs here
          --no-install: print the install command instead of running it
  update  Update Pilot in this project to the latest, and remove its old
          chat setup. Prints what's left (restart the app and npx usepilot).
          Run it in the app's folder.
  guide   Print Pilot's guide: how to do each thing in Pilot, for this
          version (also in node_modules/usepilot/GUIDE.md)
  help    Show this message
`;

/**
 * What an agent's chat gets when it still starts Pilot's old MCP server
 * (`usepilot mcp`, set up before 0.14): Pilot runs the agent itself now.
 */
const MCP_GONE = `Pilot no longer runs inside your agent's chat: it runs your agent itself.
Run \`npx usepilot@latest update\` in your app's folder (it removes this old setup), then \`npx usepilot\` there, beside the dev server.
`;

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
  case "guide":
    process.stdout.write(guide);
    break;
  case "mcp":
    process.stderr.write(MCP_GONE);
    process.exitCode = 1;
    break;
  case "init":
    try {
      process.stdout.write(
        await init({
          install: !process.argv.includes("--no-install"),
          agent: flag("agent"),
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
