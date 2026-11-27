import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { AgentInfo, AgentSession, AgentSetup, Job, JobError, PromptOptions } from "@pilot/protocol";
import { DEFAULT_BRIDGE_PORT, isLocalHost, originKey, originOf, propsOf, questionOf, requestTargets, sessionOf } from "@pilot/protocol";
import { AGENTS, type AgentCli, type AgentKind, detectAgents, exec, type FoundAgent, installCommand, missingFlags, NOTHING_PRINTED, type Refused, refusedNote, refusedOf, type RunOutput } from "./agents.ts";
import { Bridge } from "./agent.ts";
import { attachmentBlocks, attachmentsDir, newAttachments } from "./attachments.ts";
import { markSetUp, projectName, saveAgent, savedAgent } from "./config.ts";
import { factsSection } from "./facts.ts";
import { jobLocations, searchable, whereSection, withComponentFiles } from "./locate.ts";
import { type Lease, SessionPool } from "./pool.ts";
import { jobPrompt, skillOf } from "./prompt.ts";
import { warmSources } from "./sources.ts";
import { warmStyles } from "./styles.ts";

/**
 * `npx usepilot`: Pilot for this project, in a terminal beside the dev
 * server. It joins (or hosts) the hub for the project's site, and runs the
 * agent's command-line tool for each job the designer sends: one run per job,
 * a comment thread resuming its session (docs/handoff.md, *Agent runs*).
 * Nothing waits in an agent's chat, so nothing there can time out or pause.
 */

/**
 * Jobs run at once: the page never sends two on one element at once. Five, not
 * three: a designer's burst of six comments left two waiting about 10s each for
 * a slot, and three at once made no job slower (docs/benchmark.md, B1).
 */
export const SLOTS = 5;
/** How often a run checks that its job wasn't cancelled. */
const CANCEL_POLL_MS = 2_000;
/** How often, at most, the runner tells the hub the agent is at work (Job.activeAt): well under the page's quiet time. */
const ACTIVITY_EVERY_MS = 15_000;
/** A run longer than this is stopped: something's stuck. */
const RUN_TIMEOUT_MS = 20 * 60_000;
/** How long one wait for a job lasts before the next (the hub caps it at 15 min). */
const WAIT_MS = 10 * 60_000;

export interface RunnerOptions {
  /** The project's folder. */
  cwd: string;
  port?: number;
  /** The site (any page of it): only when Pilot is open on several, or none yet. */
  url?: string;
  /** The agent, else the one saved for the project, else the one signed in. */
  agent?: AgentKind;
  /** Where the log goes (a line at a time). */
  out?: (line: string) => void;
  /** Asks the designer to pick one (the terminal); returns its index. Without it, the first. */
  choose?: (question: string, options: string[]) => Promise<number>;
  /** For tests: the agents found, and the executable to run. */
  detect?: () => Promise<FoundAgent[]>;
  bin?: string;
  slots?: number;
  /** For tests: the saved agent's file. */
  configFile?: string;
  /**
   * Start even when the agent isn't ready (its command-line tool not
   * installed, or not signed in), instead of failing: Pilot opens on the
   * page, the designer can edit and send, jobs wait, and the page says what
   * to do (AgentSetup). Pilot looks again every few seconds and runs the
   * jobs that waited once it's ready, with no restart. For Pilot started
   * with the dev server (dev.ts), where nobody would read a failure.
   */
  waitForAgent?: boolean;
  /** For tests: how often to look again while waiting for the agent, for a sign-in asked from the page and the agent both. */
  setupPollMs?: number;
  /**
   * Stops it while it starts (before a page of the project opened, which it may wait for as long as the dev server
   * runs): it then rejects with RunnerStopped. Once started, `close()` stops it.
   */
  signal?: AbortSignal;
  /** For tests: starts the agent's sign-in (default: its `login`, see signIn). */
  signIn?: (cli: AgentCli, bin: string, onUrl: (url: string) => void) => Promise<void>;
}

export interface Runner {
  origin: string;
  /** The agent Pilot runs: null while it waits for one to be ready (waitForAgent). */
  agent: AgentCli | null;
  /** Resolves once the agent is ready and jobs run (at once, unless waitForAgent). */
  ready: Promise<void>;
  close(): Promise<void>;
}

/** Why Pilot can't start: what's wrong and what to do (printed as is). */
export class RunnerError extends Error {}

/** It was stopped before it started (RunnerOptions.signal): nothing went wrong, nothing to say. */
export class RunnerStopped extends Error {}

export async function startRunner(options: RunnerOptions): Promise<Runner> {
  const out = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const choose = options.choose ?? (async () => 0);
  const project = options.cwd;
  if (!searchable(project)) {
    throw new RunnerError(`${project} isn't a project folder (no package.json or .git). Run npx usepilot in your project's folder.`);
  }
  // Run by hand (`npx usepilot`): Pilot is set up on this computer for the project, so its dev server starts it from now on (dev.ts).
  if (!options.waitForAgent) markSetUp(project, options.configFile);

  // The agent: ready now, or (waitForAgent) the one Pilot waits for and what to do about it.
  let state = options.waitForAgent ? await readiness(options, choose) : { ready: await pickAgent(options, choose, out) };
  const first = state.ready?.cli ?? state.target;
  const agent: AgentInfo = {
    id: randomUUID(),
    label: `${first?.label ?? "Pilot"} · ${basename(project)}`,
    folder: project,
    ...(first ? { kind: first.kind } : {}),
    ...(state.ready ? {} : { setup: state.setup }),
  };
  const bridge = new Bridge(agent, options.port ?? (Number(process.env.PILOT_PORT) || DEFAULT_BRIDGE_PORT));

  let origin: string;
  try {
    origin = await pickSite(bridge, options, out);
    if (options.signal?.aborted) throw new RunnerStopped("stopped");
  } catch (error) {
    await bridge.close();
    throw error;
  }
  await bridge.launch(origin);
  out(
    state.ready
      ? `Pilot is on ${origin}, every page, with ${state.ready.cli.label}. Send from the toolbar; jobs show here. Ctrl+C stops.`
      : `Pilot is on ${origin}, every page. ${setupLine(state.setup)}`,
  );
  // Reads the project's files for the code search and its stylesheets now, not when the first job is waiting for them.
  setImmediate(() => {
    warmSources(project);
    warmStyles(project);
  });

  const stop = new AbortController();
  const runs = new Set<Promise<void>>();
  let picked: { cli: AgentCli; bin: string } | null = state.ready ?? null;

  /** The runs: `slots` loops, each taking the site's next job and running the agent for it. */
  const start = ({ cli, bin }: { cli: AgentCli; bin: string }) => {
    // Whether the installed tool knows the flags Pilot runs it with (missingFlags): said at start, and checked again when a run
    // fails (the designer may have updated it since). In plain words first: whoever reads it may be a designer; the flags last.
    // Not for a stand-in (`bin`: tests, trying states by hand): it isn't the agent's tool.
    const checkFlags = options.bin ? undefined : () => missingFlags(cli, bin).catch(() => null);
    void checkFlags?.().then((missing) => {
      if (missing?.length) out(outdatedNote(cli, missing));
    });
    const pool = new SessionPool(project, cli.kind, options.configFile);
    const slots = options.slots ?? SLOTS;
    for (let i = 0; i < slots; i++) {
      const loop = (async () => {
        while (!stop.signal.aborted) {
          let job: Job | null = null;
          try {
            ({ job } = await bridge.wait(origin, WAIT_MS, stop.signal));
          } catch (error) {
            if (stop.signal.aborted) break;
            out(`The hub is unreachable (${(error as Error).message}); trying again.`);
            await sleep(2_000, stop.signal);
            continue;
          }
          if (job && !stop.signal.aborted) await runJob(job, { bridge, cli, bin, project, out, signal: stop.signal, pool, checkFlags });
        }
      })();
      runs.add(loop);
    }
  };

  let ready: Promise<void>;
  if (state.ready) {
    start(state.ready);
    ready = Promise.resolve();
  } else {
    // Waiting for the agent: look again every few seconds (and sign in when the designer asks, from the page). Once it's
    // ready, the page hears it (no setup), and the jobs that waited in the hub's queue run.
    const waiting = (async () => {
      const poll = options.setupPollMs ?? SETUP_TICK_MS;
      let signingIn: Promise<void> | null = null;
      let url: string | undefined;
      let signInError: string | undefined;
      const say = async (setup: AgentSetup) => {
        const shown: AgentSetup = signingIn
          ? { ...setup, state: "signing-in", canSignIn: false, ...(url ? { url } : {}) }
          : { ...setup, ...(signInError ? { error: signInError } : {}) };
        // The agent it waits for may have changed too (none installed, then one was): the page names it.
        const label = `${state.target?.label ?? "Pilot"} · ${basename(project)}`;
        if (JSON.stringify(agent.setup) === JSON.stringify(shown) && agent.label === label) return;
        const before = agent.setup;
        agent.setup = shown;
        agent.label = label;
        if (state.target) agent.kind = state.target.kind;
        else delete agent.kind;
        if (before?.state !== shown.state || before?.agent !== shown.agent || before?.error !== shown.error) out(setupLine(shown));
        await bridge.register().catch(() => {});
      };
      // A sign-in asked from the page is looked for every tick; the agent's state (a sign-in check per agent, about a
      // second each) every few.
      const lookEvery = options.setupPollMs ? 1 : Math.round(SETUP_POLL_MS / SETUP_TICK_MS);
      for (let tick = 1; !stop.signal.aborted && !state.ready; tick++) {
        await sleep(poll, stop.signal);
        if (stop.signal.aborted) return;
        const asked = !signingIn && state.setup?.canSignIn && state.target ? await bridge.signInAsked().catch(() => false) : false;
        if (asked && state.target && state.bin) {
          const cli = state.target;
          out(`Signing in to ${cli.label}: its page opens in your browser.`);
          url = undefined;
          signInError = undefined;
          signingIn = (options.signIn ?? signIn)(cli, state.bin, (u) => {
            url = u;
            if (state.setup) void say(state.setup);
          })
            .catch(() => {})
            .finally(() => {
              signingIn = null;
              // Looked at right after: still not signed in, it didn't finish (closed, or it wanted a code typed).
              signInError = `The sign-in didn't finish. Run ${cli.signIn} in a terminal, then send again.`;
            });
        }
        // Right after a sign-in started (it shows as signing in at once), and every few ticks.
        if (!asked && tick % lookEvery !== 0) continue;
        state = await readiness(options, choose);
        if (state.ready) break;
        if (state.setup) await say(state.setup);
      }
      if (stop.signal.aborted || !state.ready) return;
      picked = state.ready;
      const { cli } = state.ready;
      agent.label = `${cli.label} · ${basename(project)}`;
      agent.kind = cli.kind;
      delete agent.setup;
      await bridge.register().catch(() => {});
      out(`${cli.label} is ready: Pilot runs it for each job (the ones that waited go now).`);
      start(state.ready);
    })();
    runs.add(waiting);
    ready = waiting;
  }

  return {
    origin,
    get agent() {
      return picked?.cli ?? null;
    },
    ready,
    async close() {
      stop.abort();
      await Promise.allSettled(runs);
      await bridge.close();
    },
  };
}

/** How often Pilot looks again for its agent while it waits for one (waitForAgent): each look asks the tool if it's signed in. */
const SETUP_POLL_MS = 3_000;
/** How often it looks for a sign-in asked from the page meanwhile: the designer just sent something. */
const SETUP_TICK_MS = 1_000;
/** How long a sign-in started from the page may take: the designer signs in in the browser. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

/**
 * How the agent stands, for waitForAgent: ready (installed and signed in),
 * or the one Pilot waits for (`target`, with its executable when it's
 * installed) and what to do (`setup`). The agent given or saved for the
 * project, else one signed in (asked when several), else the first one
 * installed, else none: any of them, once installed.
 */
async function readiness(
  options: RunnerOptions,
  choose: NonNullable<RunnerOptions["choose"]>,
): Promise<{ ready?: { cli: AgentCli; bin: string }; target?: AgentCli; bin?: string; setup?: AgentSetup }> {
  const wanted = options.agent ?? savedAgent(options.cwd, options.configFile);
  if (wanted && options.bin) return { ready: { cli: AGENTS[wanted], bin: options.bin } };
  const found = await (options.detect ?? detectAgents)();
  const waitFor = (cli: AgentCli, it?: FoundAgent) => ({ target: cli, ...(it ? { bin: it.bin } : {}), setup: setupFor(cli, it) });
  if (wanted) {
    const it = found.find((a) => a.kind === wanted);
    if (it?.signedIn) {
      if (options.agent) saveAgent(options.cwd, wanted, options.configFile);
      return { ready: { cli: AGENTS[wanted], bin: it.bin } };
    }
    return waitFor(AGENTS[wanted], it);
  }
  const signedIn = found.filter((a) => a.signedIn);
  if (signedIn.length) {
    const index = signedIn.length > 1 ? await choose("Which agent should Pilot run for this project?", signedIn.map((a) => AGENTS[a.kind].label)) : 0;
    const it = signedIn[index] ?? (signedIn[0] as FoundAgent);
    saveAgent(options.cwd, it.kind, options.configFile);
    return { ready: { cli: AGENTS[it.kind], bin: options.bin ?? it.bin } };
  }
  const installed = found[0];
  if (installed) return waitFor(AGENTS[installed.kind], installed);
  return {
    setup: {
      state: "not-installed",
      command: `Install your coding agent's command-line tool and sign in: ${Object.values(AGENTS)
        .map((cli) => `${cli.label}: ${installCommand(cli)}, then ${cli.signIn}`)
        .join(". ")}.`,
    },
  };
}

/** What to do to get `cli` ready: install it and sign in, or sign in (which Pilot can start, from the page). */
export function setupFor(cli: AgentCli, found?: FoundAgent): AgentSetup {
  if (!found) return { state: "not-installed", agent: cli.label, command: `${installCommand(cli)}, then ${cli.signIn}` };
  return { state: "not-signed-in", agent: cli.label, command: cli.signIn, canSignIn: true };
}

/** One line for the terminal about a setup: what Pilot waits for, and what to do. */
function setupLine(setup: AgentSetup | undefined): string {
  if (!setup) return "";
  const name = setup.agent ?? "your coding agent";
  if (setup.state === "signing-in") return `Waiting for you to sign in to ${name} in the browser${setup.url ? ` (${setup.url})` : ""}.`;
  if (setup.error) return `! ${setup.error}`;
  if (setup.state === "not-signed-in")
    return `${name} isn't signed in: click Send in Pilot to sign in (its page opens in your browser), or run ${setup.command} in a terminal. Jobs wait until then.`;
  return setup.agent
    ? `${name}'s command-line tool isn't installed: ask your agent to install it, or run ${setup.command} in a terminal. Jobs wait until then.`
    : `${setup.command} (Or ask your agent to install its own.) Jobs wait until then.`;
}

/**
 * Starts `cli`'s own sign-in (its `login`): it opens the agent's sign-in page
 * in the browser and ends once the designer signed in there (or after
 * SIGN_IN_TIMEOUT_MS). Nothing is typed into it: one that asks for a code in
 * the terminal ends at once, and the page says to run it in a terminal. The
 * page's address, when it prints one, goes to `onUrl`.
 */
export async function signIn(cli: AgentCli, bin: string, onUrl: (url: string) => void): Promise<void> {
  let seen = "";
  const look = (chunk: string) => {
    seen += chunk;
    const url = /https:\/\/[^\s"'<>]+/.exec(seen)?.[0];
    if (url) onUrl(url);
  };
  await exec(bin, cli.login, { timeoutMs: SIGN_IN_TIMEOUT_MS, onStdout: look, onStderr: look });
}

/** The agent: given, else saved for the project, else found signed in (asked when several). */
async function pickAgent(
  options: RunnerOptions,
  choose: NonNullable<RunnerOptions["choose"]>,
  out: (line: string) => void,
): Promise<{ cli: AgentCli; bin: string }> {
  const wanted = options.agent ?? savedAgent(options.cwd, options.configFile);
  if (wanted && options.bin) return { cli: AGENTS[wanted], bin: options.bin };
  const found = await (options.detect ?? detectAgents)();
  if (wanted) {
    const cli = AGENTS[wanted];
    const it = found.find((a) => a.kind === wanted);
    if (!it) throw new RunnerError(`${cli.label}'s command-line tool isn't installed. Install it (${installCommand(cli)}), sign in (${cli.signIn}), then run npx usepilot again.`);
    if (!it.signedIn) throw new RunnerError(`${cli.label} isn't signed in. Run ${cli.signIn}, then npx usepilot again.`);
    if (options.agent) saveAgent(options.cwd, wanted, options.configFile);
    return { cli, bin: it.bin };
  }
  const ready = found.filter((a) => a.signedIn);
  if (!ready.length) {
    const installed = found.map((a) => `${AGENTS[a.kind].label} isn't signed in: run ${AGENTS[a.kind].signIn}.`);
    throw new RunnerError(
      [
        "Pilot runs your coding agent's command-line tool, and none is ready here.",
        ...(installed.length
          ? installed
          : Object.values(AGENTS).map((cli) => `- ${cli.label}: ${installCommand(cli)}, then ${cli.signIn}`)),
        "Then run npx usepilot again.",
      ].join("\n"),
    );
  }
  const index = ready.length > 1 ? await choose("Which agent should Pilot run for this project?", ready.map((a) => AGENTS[a.kind].label)) : 0;
  const picked = ready[index] ?? (ready[0] as FoundAgent);
  saveAgent(options.cwd, picked.kind, options.configFile);
  if (ready.length > 1) out(`${AGENTS[picked.kind].label} it is, for this project (npx usepilot --agent <name> changes it).`);
  return { cli: AGENTS[picked.kind], bin: options.bin ?? picked.bin };
}

/**
 * The site: given (`--url`), else the one where Pilot is open on a page of
 * this project, told by the name its loader carries (`mountPilot({ project })`,
 * see projectName). Never another project's page: each one Pilot sees and
 * leaves is said once, with why, and it waits for this project's.
 */
async function pickSite(bridge: Bridge, options: RunnerOptions, out: (line: string) => void): Promise<string> {
  if (options.url) {
    const origin = originOf(options.url);
    if (!origin) throw new RunnerError(`"${options.url}" isn't a page address. Pass your dev server's, e.g. http://localhost:5173.`);
    return originKey(origin);
  }
  const name = projectName(options.cwd);
  const told = new Set<string>();
  const say = (key: string, line: string) => {
    if (told.has(key)) return;
    told.add(key);
    out(line);
  };
  for (;;) {
    if (options.signal?.aborted) throw new RunnerStopped("stopped");
    // Pages connect to the hub as they load: a moment for them to (re)connect to a new one.
    const local = (await bridge.pages()).filter((p) => {
      try {
        return isLocalHost(new URL(p.origin).hostname);
      } catch {
        return false;
      }
    });
    const mine = local.find((p) => p.project === name);
    if (mine) return mine.origin;
    for (const page of local) {
      if (page.project)
        say(`${page.origin} ${page.project}`, `Pilot is open on ${page.origin} for ${page.project}, not ${name}: run npx usepilot in that project's folder for it.`);
      else
        say(
          page.origin,
          `Pilot is open on ${page.origin}, but its loader doesn't say which project it is (set up before 0.15). If it's this one, ask your agent to run npx usepilot@latest update here, or start with npx usepilot --url ${page.origin}.`,
        );
    }
    say("none", `Waiting for a page of ${name}: open your app in the browser (with its dev server running).`);
    await sleep(1_000, options.signal);
  }
}

interface RunContext {
  bridge: Bridge;
  cli: AgentCli;
  bin: string;
  /** Checks the flags Pilot runs it with that its tool's help doesn't list (missingFlags; null: unknown). None for a stand-in. */
  checkFlags?: () => Promise<string[] | null>;
  project: string;
  out(line: string): void;
  signal: AbortSignal;
  /** The sessions kept for the editor's jobs (pool.ts); without it, each edit starts a new session. */
  pool?: SessionPool;
}

/** A job from the editor (Send): edits, not a comment or a task, nor an answer to the agent's question. */
export function isEditorJob(job: Job): boolean {
  return !job.changeSet.request && !job.answer;
}

/** Runs the agent for one job and reports it done (or why it couldn't). */
export async function runJob(job: Job, ctx: RunContext): Promise<void> {
  const { bridge, cli, out } = ctx;
  const started = Date.now();
  out(`▸ ${describeJob(job)}`);
  const stop = new AbortController();
  const onStop = () => stop.abort();
  ctx.signal.addEventListener("abort", onStop, { once: true });
  // The designer took it back: stop the run.
  const watch = setInterval(() => {
    bridge
      .job(job.id)
      .then((j) => {
        if (j?.status === "cancelled") stop.abort();
      })
      .catch(() => {});
  }, CANCEL_POLL_MS);
  // The editor's jobs resume a free session of the pool (its follow-up, its own session, once free).
  let lease: Lease | undefined;
  let ended: string | undefined;
  try {
    if (ctx.pool && isEditorJob(job)) {
      const own = sessionOf(job.session);
      if (job.attempt !== 2) lease = ctx.pool.take();
      else if (own?.agent === cli.kind) lease = await ctx.pool.takeOwn(own.id);
    }
    const resume = lease ? lease.resume : sessionToResume(job, cli.kind);
    // A session of the pool has read the edit guidelines: they're one line.
    const known = !!lease?.resume && job.attempt !== 2;
    const prompt = await promptFor(job, ctx.project, cli, { guidelinesKnown: known });
    const images = newAttachments(job)
      .map((f) => f.path as string)
      .filter((p) => /\.(png|jpe?g|gif|webp)$/i.test(p));
    const active = activityOf(bridge, job.id);
    let result = await runAgent(ctx, prompt, { resume, images, signal: stop.signal, onOutput: active });
    // A run that failed with no reply: once more (a session gone, a hiccup), without the session, the guidelines in full.
    if (!stop.signal.aborted && !result.reply && !signInProblem(result.error)) {
      result = await runAgent(ctx, known ? await promptFor(job, ctx.project, cli) : prompt, { images, signal: stop.signal, onOutput: active });
    }
    if (stop.signal.aborted) {
      ended = lease?.resume;
      out(`■ Stopped: ${describeJob(job)}`);
      return;
    }
    if (result.reply) ended = result.session;
    const seconds = Math.round((Date.now() - started) / 1000);
    if (!result.reply) {
      const error = errorFor(cli, result.error, (await ctx.checkFlags?.()) ?? undefined);
      await bridge.done(job.id, undefined, undefined, undefined, { error });
      // The whole error here (the page has its most telling line): what the agent printed last, a few lines.
      const said = (result.error ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-8);
      out(`✗ ${error.title}. ${error.detail}${said.length && !signInProblem(result.error) ? `\n${said.map((l) => `  ${l}`).join("\n")}` : ""}`);
      return;
    }
    const reply = replyOf(result.reply);
    const session: AgentSession | undefined = result.session ? { agent: cli.kind, id: result.session } : undefined;
    // What it was refused: said after its reply; what can be allowed safely, a request the thread copies with a button.
    const refused = refusedNote(cli, [...(result.refused ?? []), ...(reply.refused ?? [])]);
    const notes = refused ? [reply.notes, refused.note].filter(Boolean).join("\n\n") : reply.notes;
    await bridge.done(job.id, notes, reply.question, reply.props, { session, ...(refused?.allow ? { allow: refused.allow } : {}) });
    out(`✓ ${seconds}s · ${firstLine(reply.notes) || "Done."}`);
    if (refused) out(`! ${[refused.note, refused.allow].filter(Boolean).join(" ").replaceAll("**", "").replaceAll("`", "")}`);
  } catch (error) {
    if (!stop.signal.aborted) {
      const jobError = { title: `Pilot couldn't run ${cli.label}`, detail: (error as Error).message };
      await bridge.done(job.id, undefined, undefined, undefined, { error: jobError }).catch(() => {});
      out(`✗ ${jobError.title}: ${jobError.detail}`);
    }
  } finally {
    lease?.release(ended);
    clearInterval(watch);
    ctx.signal.removeEventListener("abort", onStop);
  }
}

/**
 * What a run's output calls: tells the hub the agent is at work on `jobId`
 * (Job.activeAt), at once, then at most every ACTIVITY_EVERY_MS. The page
 * says a run that has gone quiet is stuck (PilotSession.stuck).
 */
export function activityOf(bridge: Pick<Bridge, "activity">, jobId: string, every = ACTIVITY_EVERY_MS, now = Date.now): () => void {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    if (now() - last < every) return;
    last = now();
    bridge.activity(jobId).catch(() => {});
  };
}

async function runAgent(
  ctx: RunContext,
  prompt: string,
  options: { resume?: string; images: string[]; signal: AbortSignal; onOutput?: () => void },
): Promise<RunOutput> {
  const { cli } = ctx;
  if (!existsSync(ctx.bin)) return { error: `${cli.label}'s command-line tool isn't installed any more.` };
  options.onOutput?.(); // Started: the run's quiet time counts from here.
  const run = await exec(ctx.bin, cli.args({ resume: options.resume, readDirs: [attachmentsDir()], images: options.images }), {
    cwd: ctx.project,
    input: prompt,
    signal: options.signal,
    timeoutMs: RUN_TIMEOUT_MS,
    ...(options.onOutput ? { onStdout: options.onOutput } : {}),
  });
  const parsed = cli.parse(run.stdout);
  if (!parsed.reply && !parsed.error) parsed.error = run.stderr.trim().split("\n").slice(-3).join("\n") || `exit code ${run.code}`;
  if (!parsed.reply && run.stderr && !parsed.error?.includes(run.stderr.trim().slice(0, 40))) parsed.error = `${parsed.error}\n${run.stderr.trim().slice(-500)}`;
  // Nothing on either stream: the exit code is all there is to say.
  if (!parsed.reply && !run.stderr.trim() && parsed.error === NOTHING_PRINTED) parsed.error = `${NOTHING_PRINTED} (exit code ${run.code}${run.killed ? ", stopped" : ""})`;
  return parsed;
}

/**
 * The prompt of a run: the job's, where its code probably is, the project's
 * facts (its Tailwind and the class for each value: facts.ts), and the text
 * files attached; first, the skill the designer picked, started the way the
 * agent's chat starts one (`invokeSkill`).
 */
export async function promptFor(job: Job, project: string, cli: AgentCli, options: PromptOptions = {}): Promise<string> {
  const j = withComponentFiles(job, project);
  // A follow-up resumes the job's session: it has these already.
  const located = j.attempt === 2 ? [] : jobLocations(j, project);
  const where = j.attempt === 2 ? "" : [whereSection(j, project, located), factsSection(j, project, located.map((l) => l.at.file))].filter(Boolean).join("\n\n");
  const texts = (await attachmentBlocks(j)).flatMap((b) => (b.type === "text" ? [b.text] : []));
  const skill = skillOf(j);
  return [...(skill ? [cli.invokeSkill(skill)] : []), jobPrompt(j, where, options), ...texts].join("\n\n");
}


/** The session to resume: the job's own (its follow-up, an answer), else its comment thread's; only this agent's. */
export function sessionToResume(job: Job, agent: AgentKind): string | undefined {
  const request = job.changeSet.request;
  const own = sessionOf(job.session);
  const thread = request?.kind === "comment" ? sessionOf(request.session) : undefined;
  const session = (job.attempt === 2 || job.answer ? own : undefined) ?? thread ?? own;
  return session?.agent === agent ? session.id : undefined;
}

/**
 * The agent's reply, read: its notes, and a question or props from the
 * `pilot` block at its end (see prompt.ts), which isn't part of the notes.
 */
export function replyOf(reply: string): { notes?: string; question?: Job["question"]; props?: Job["props"]; refused?: Refused[] } {
  const blocks = [...reply.matchAll(/```pilot\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1);
  let notes = reply;
  let data: { question?: unknown; props?: unknown; refused?: unknown } = {};
  if (last) {
    notes = reply.replace(last[0], "");
    try {
      data = JSON.parse(last[1] ?? "") as typeof data;
    } catch {
      // Not JSON: keep the notes, ask nothing.
    }
  }
  notes = notes.trim();
  const refused = refusedOf(data.refused);
  return { notes: notes || undefined, question: questionOf(data.question), props: propsOf(data.props), ...(refused.length ? { refused } : {}) };
}

function signInProblem(error: string | undefined): boolean {
  return !!error && /not (logged|signed) in|log ?in required|please (run )?\/?login|authenticat|unauthori[sz]ed|\b401\b|api key/i.test(error);
}

/**
 * What the terminal says when the agent's tool is older than Pilot's flags:
 * what to do first, in plain words (a designer may be reading), the flags
 * last, for whoever wants to know why.
 */
export function outdatedNote(cli: AgentCli, missing: string[]): string {
  return [`! ${cli.label} needs an update to work with Pilot. In a terminal, run:`, `    ${cli.update}`, `  (This version doesn't support ${missing.join(", ")}, which Pilot uses.)`].join("\n");
}

/** A run's error for the designer: what's wrong and what to do. */
export function errorFor(cli: AgentCli, error: string | undefined, missing?: string[]): JobError {
  if (signInProblem(error)) return { title: `${cli.label} isn't signed in`, detail: `Run ${cli.signIn} in a terminal, then send again.` };
  // Its tool doesn't know flags Pilot runs it with: every run fails until it's updated.
  if (missing?.length)
    return {
      title: `${cli.label} needs an update`,
      detail: `This version of ${cli.label} can't work with Pilot yet. In a terminal, run ${cli.update}, then send again.`,
    };
  // The line that says what went wrong: not the generic one when the agent's own error follows it.
  const lines = (error ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const telling = lines.find((l) => !l.startsWith(NOTHING_PRINTED)) ?? lines[0] ?? "It stopped without a reply.";
  return {
    title: `${cli.label} couldn't do this job`,
    detail: `${telling.slice(0, 300)} The terminal running npx usepilot has the details. Send again to retry.`,
  };
}

/** One line about a job, for the log. */
function describeJob(job: Job): string {
  const request = job.changeSet.request;
  const follow = job.attempt === 2 ? "follow-up: " : job.answer ? "answer: " : "";
  if (request?.kind === "comment") {
    const latest = request.thread.at(-1)?.text.trim().replace(/\s+/g, " ") ?? "";
    return `${follow}comment on ${nameOf(request.target)}: "${latest.length > 60 ? `${latest.slice(0, 60)}…` : latest}"`;
  }
  if (request) return `${follow}${request.kind} on ${requestTargets(request).map(nameOf).join(", ")}`;
  const changes = job.changeSet.edits.reduce((n, e) => n + e.changes.length + (e.texts?.length ?? 0), 0);
  return `${follow}${changes} change${changes === 1 ? "" : "s"} on ${job.changeSet.edits.map((e) => nameOf(e.target)).join(", ")}`;
}

/** A reply's first line, for the log (the page shows it all). */
function firstLine(text: string | undefined): string {
  const line = text?.trim().split("\n")[0]?.trim() ?? "";
  return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}

function nameOf(target: { tag: string; text?: string }): string {
  return target.text ? `${target.tag} "${target.text.length > 30 ? `${target.text.slice(0, 30)}…` : target.text}"` : target.tag;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
