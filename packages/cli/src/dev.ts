import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { configFile, isSetUp, projectName } from "./config.ts";
import { type Runner, RunnerError, RunnerStopped, startRunner } from "./run.ts";

/**
 * Pilot started with the app's dev server, so there's no `npx usepilot` to
 * remember: the Vite plugin (`usepilot/vite`), Next.js's `withPilot`
 * (`usepilot/next`) and `usepilot dev -- <command>` for any other dev server
 * all call startWithDevServer. It runs the same runner as `npx usepilot`, in
 * the dev server's process, waiting for the agent when it isn't ready yet
 * (waitForAgent): the designer can try Pilot before signing in, and the page
 * says what to do (docs/handoff.md, *Starting with the dev server*).
 *
 * Only on a computer where Pilot is set up for the project (`init` ran there,
 * or `npx usepilot`: isSetUp in config.ts, a file of this computer's, never
 * the repo's). The configs that start it are the team's, committed: a
 * teammate who never set Pilot up gets one line in the dev server's log
 * saying how to, and nothing else (the owner's call, 2026-11-27).
 *
 * Development only, like everything Pilot sets up: never in a production
 * process (NODE_ENV=production), nor in CI (a dev server started for tests
 * must not run anyone's agent). Each hook adds its own check on top: Vite's
 * `apply: "serve"`, Next.js's development phase.
 */

/** Set in the process that runs it, so its child processes (Next.js's workers) don't start a second one. */
export const RUNNER_ENV = "USEPILOT_RUNNER";

const STARTED = Symbol.for("usepilot.devRunner");

/** Set once the dev server's log said Pilot isn't set up on this computer, so it's said once. */
const OFF_SAID_ENV = "USEPILOT_OFF_SAID";

export interface DevOptions {
  /** Where the dev server runs: the project is the closest folder up with a package.json. */
  cwd?: string;
  /** The app's address, when the dev server knows it (else Pilot finds its pages by the project's name). */
  url?: string;
  /** Where Pilot's lines go (the dev server's log); `[pilot]` lines on stdout by default. */
  out?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  /** For tests: the runner's own options. */
  runner?: Partial<Parameters<typeof startRunner>[0]>;
}

export interface DevRunner {
  /** Resolves with the runner once Pilot is on the app's page (null when it couldn't start: said in the log). */
  started: Promise<Runner | null>;
  close(): Promise<void>;
}

/** Why Pilot doesn't start with this dev server, or null when it does. */
export function devGuard(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === "production") return "Pilot doesn't start: NODE_ENV is production (Pilot only runs in development).";
  if (env.CI && env.CI !== "false" && env.CI !== "0") return "Pilot doesn't start in CI.";
  return null;
}

/**
 * Starts Pilot for the project, once per process (a dev server that
 * restarts calls it again after closing the last one), and never in a
 * child of a process that runs it. Never throws: a dev server must start
 * whatever Pilot's state; what went wrong is said in its log. Null when it
 * doesn't start here (see devGuard, RUNNER_ENV).
 */
export function startWithDevServer(options: DevOptions = {}): DevRunner | null {
  const env = options.env ?? process.env;
  const out = options.out ?? ((line: string) => process.stdout.write(`[pilot] ${line}\n`));
  const off = devGuard(env);
  if (off) {
    out(off);
    return null;
  }
  const global = globalThis as { [STARTED]?: DevRunner };
  if (global[STARTED]) return global[STARTED];
  const parent = Number(env[RUNNER_ENV]);
  if (parent && parent !== process.pid && alive(parent)) return null;

  const project = projectFolder(options.cwd ?? process.cwd());
  if (!isSetUp(project, options.runner?.configFile ?? configFile(env))) {
    // Said once per dev server: not again in Next.js's other processes (they inherit the env), nor on a Vite restart.
    if (!env[OFF_SAID_ENV]) {
      out(`Pilot isn't set up for ${projectName(project)} on this computer, so it doesn't start. To use it: npx usepilot init (in ${project}).`);
      env[OFF_SAID_ENV] = "1";
    }
    return null;
  }
  env[RUNNER_ENV] = String(process.pid);

  let closed = false;
  // Closing before it started (the dev server ended before a page opened): it stops waiting for one.
  const stop = new AbortController();
  const started: Promise<Runner | null> = startRunner({
    cwd: project,
    out,
    waitForAgent: true,
    signal: stop.signal,
    ...(options.url ? { url: options.url } : {}),
    ...options.runner,
  }).then(
    async (runner) => {
      if (!closed) return runner;
      await runner.close();
      return null;
    },
    (error: unknown) => {
      if (!(error instanceof RunnerStopped)) out(error instanceof RunnerError ? error.message : `Pilot couldn't start: ${(error as Error).message}`);
      return null;
    },
  );
  const handle: DevRunner = {
    started,
    async close() {
      if (closed) return;
      closed = true;
      // At once: a dev server restarting starts the next one before this one has finished closing.
      if (global[STARTED] === handle) delete global[STARTED];
      if (env[RUNNER_ENV] === String(process.pid)) delete env[RUNNER_ENV];
      stop.abort();
      await (await started)?.close();
    },
  };
  global[STARTED] = handle;
  return handle;
}

/** The project's folder: the closest one up from `dir` with a package.json (`dir` itself when there's none). */
export function projectFolder(dir: string): string {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, "package.json"))) return d;
    if (dirname(d) === d) return dir;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it's there, owned by someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
