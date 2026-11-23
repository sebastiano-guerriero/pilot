import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { AgentInfo, AgentSession, Job, JobError } from "@pilot/protocol";
import { DEFAULT_BRIDGE_PORT, isLocalHost, originKey, originOf, propsOf, questionOf, requestTargets, sessionOf } from "@pilot/protocol";
import { AGENTS, type AgentCli, type AgentKind, detectAgents, exec, type FoundAgent, type RunOutput } from "./agents.ts";
import { Bridge } from "./agent.ts";
import { attachmentBlocks, attachmentsDir, newAttachments } from "./attachments.ts";
import { projectName, saveAgent, savedAgent } from "./config.ts";
import { factsSection } from "./facts.ts";
import { jobLocations, searchable, whereSection, withComponentFiles } from "./locate.ts";
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

/** Jobs run at once: the page never sends two on one element at once. */
export const SLOTS = 3;
/** How often a run checks that its job wasn't cancelled. */
const CANCEL_POLL_MS = 2_000;
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
}

export interface Runner {
  origin: string;
  agent: AgentCli;
  close(): Promise<void>;
}

/** Why Pilot can't start: what's wrong and what to do (printed as is). */
export class RunnerError extends Error {}

export async function startRunner(options: RunnerOptions): Promise<Runner> {
  const out = options.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const choose = options.choose ?? (async () => 0);
  const project = options.cwd;
  if (!searchable(project)) {
    throw new RunnerError(`${project} isn't a project folder (no package.json or .git). Run npx usepilot in your project's folder.`);
  }

  const { cli, bin } = await pickAgent(options, choose, out);
  const agent: AgentInfo = { id: randomUUID(), label: `${cli.label} · ${basename(project)}`, folder: project, kind: cli.kind };
  const bridge = new Bridge(agent, options.port ?? (Number(process.env.PILOT_PORT) || DEFAULT_BRIDGE_PORT));

  const origin = await pickSite(bridge, options, out);
  await bridge.launch(origin);
  out(`Pilot is on ${origin}, every page, with ${cli.label}. Send from the toolbar; jobs show here. Ctrl+C stops.`);
  // Reads the project's files for the code search and its stylesheets now, not when the first job is waiting for them.
  setImmediate(() => {
    warmSources(project);
    warmStyles(project);
  });

  const stop = new AbortController();
  const runs = new Set<Promise<void>>();
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
        if (job && !stop.signal.aborted) await runJob(job, { bridge, cli, bin, project, out, signal: stop.signal });
      }
    })();
    runs.add(loop);
  }

  return {
    origin,
    agent: cli,
    async close() {
      stop.abort();
      await Promise.allSettled(runs);
      await bridge.close();
    },
  };
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
    if (!it) throw new RunnerError(`${cli.label}'s command-line tool isn't installed. Install it (${cli.install}), sign in (${cli.signIn}), then run npx usepilot again.`);
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
          : Object.values(AGENTS).map((cli) => `- ${cli.label}: ${cli.install}, then ${cli.signIn}`)),
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
    await sleep(1_000);
  }
}

interface RunContext {
  bridge: Bridge;
  cli: AgentCli;
  bin: string;
  project: string;
  out(line: string): void;
  signal: AbortSignal;
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
  try {
    const prompt = await promptFor(job, ctx.project, cli);
    const resume = sessionToResume(job, cli.kind);
    const images = newAttachments(job)
      .map((f) => f.path as string)
      .filter((p) => /\.(png|jpe?g|gif|webp)$/i.test(p));
    let result = await runAgent(ctx, prompt, { resume, images, signal: stop.signal });
    // A run that failed with no reply: once more (a session gone, a hiccup), without the session.
    if (!stop.signal.aborted && !result.reply && !signInProblem(result.error)) {
      result = await runAgent(ctx, prompt, { images, signal: stop.signal });
    }
    if (stop.signal.aborted) {
      out(`■ Stopped: ${describeJob(job)}`);
      return;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    if (!result.reply) {
      const error = errorFor(cli, result.error);
      await bridge.done(job.id, undefined, undefined, undefined, { error });
      out(`✗ ${error.title}. ${error.detail}${result.error && !signInProblem(result.error) ? `\n  ${result.error.split("\n")[0]}` : ""}`);
      return;
    }
    const reply = replyOf(result.reply);
    const session: AgentSession | undefined = result.session ? { agent: cli.kind, id: result.session } : undefined;
    await bridge.done(job.id, reply.notes, reply.question, reply.props, { session });
    out(`✓ ${seconds}s · ${firstLine(reply.notes) || "Done."}`);
  } catch (error) {
    if (!stop.signal.aborted) {
      const jobError = { title: `Pilot couldn't run ${cli.label}`, detail: (error as Error).message };
      await bridge.done(job.id, undefined, undefined, undefined, { error: jobError }).catch(() => {});
      out(`✗ ${jobError.title}: ${jobError.detail}`);
    }
  } finally {
    clearInterval(watch);
    ctx.signal.removeEventListener("abort", onStop);
  }
}

async function runAgent(ctx: RunContext, prompt: string, options: { resume?: string; images: string[]; signal: AbortSignal }): Promise<RunOutput> {
  const { cli } = ctx;
  if (!existsSync(ctx.bin)) return { error: `${cli.label}'s command-line tool isn't installed any more.` };
  const run = await exec(ctx.bin, cli.args({ resume: options.resume, readDirs: [attachmentsDir()], images: options.images }), {
    cwd: ctx.project,
    input: prompt,
    signal: options.signal,
    timeoutMs: RUN_TIMEOUT_MS,
  });
  const parsed = cli.parse(run.stdout);
  if (!parsed.reply && !parsed.error) parsed.error = run.stderr.trim().split("\n").slice(-3).join("\n") || `exit code ${run.code}`;
  if (!parsed.reply && run.stderr && !parsed.error?.includes(run.stderr.trim().slice(0, 40))) parsed.error = `${parsed.error}\n${run.stderr.trim().slice(-500)}`;
  return parsed;
}

/**
 * The prompt of a run: the job's, where its code probably is, the project's
 * facts (its Tailwind and the class for each value: facts.ts), and the text
 * files attached; first, the skill the designer picked, started the way the
 * agent's chat starts one (`invokeSkill`).
 */
export async function promptFor(job: Job, project: string, cli: AgentCli): Promise<string> {
  const j = withComponentFiles(job, project);
  // A follow-up resumes the job's session: it has these already.
  const located = j.attempt === 2 ? [] : jobLocations(j, project);
  const where = j.attempt === 2 ? "" : [whereSection(j, project, located), factsSection(j, project, located.map((l) => l.at.file))].filter(Boolean).join("\n\n");
  const texts = (await attachmentBlocks(j)).flatMap((b) => (b.type === "text" ? [b.text] : []));
  const skill = skillOf(j);
  return [...(skill ? [cli.invokeSkill(skill)] : []), jobPrompt(j, where), ...texts].join("\n\n");
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
export function replyOf(reply: string): { notes?: string; question?: Job["question"]; props?: Job["props"] } {
  const blocks = [...reply.matchAll(/```pilot\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1);
  let notes = reply;
  let data: { question?: unknown; props?: unknown } = {};
  if (last) {
    notes = reply.replace(last[0], "");
    try {
      data = JSON.parse(last[1] ?? "") as typeof data;
    } catch {
      // Not JSON: keep the notes, ask nothing.
    }
  }
  notes = notes.trim();
  return { notes: notes || undefined, question: questionOf(data.question), props: propsOf(data.props) };
}

function signInProblem(error: string | undefined): boolean {
  return !!error && /not (logged|signed) in|log ?in required|please (run )?\/?login|authenticat|unauthori[sz]ed|\b401\b|api key/i.test(error);
}

/** A run's error for the designer: what's wrong and what to do. */
export function errorFor(cli: AgentCli, error: string | undefined): JobError {
  if (signInProblem(error)) return { title: `${cli.label} isn't signed in`, detail: `Run ${cli.signIn} in a terminal, then send again.` };
  return {
    title: `${cli.label} couldn't do this job`,
    detail: `${(error ?? "It stopped without a reply.").split("\n")[0]?.slice(0, 300)} The terminal running npx usepilot has the details. Send again to retry.`,
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
