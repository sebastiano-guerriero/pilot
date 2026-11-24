import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * The coding agents Pilot runs for a job: each one's command-line tool, run
 * once per job in the project's folder, the prompt on stdin. A comment thread
 * resumes its session, so the agent remembers the thread. A run has the
 * permissions the designer gave that agent, as in its chat, with no one there
 * to answer: what they allowed runs, the project's files can be edited (the
 * job), and what the chat would ask about is refused. Never a flag that skips
 * permissions. Checked on macOS, Linux and Windows by
 * scripts/agent-runs-check.mjs (docs/handoff.md, *Agent runs*).
 */

export type AgentKind = "claude" | "codex" | "cursor";

export const AGENT_KINDS: readonly AgentKind[] = ["claude", "codex", "cursor"];

/** What a run printed, read: the session to resume, the agent's last message, or what went wrong. */
export interface RunOutput {
  session?: string;
  reply?: string;
  error?: string;
  /**
   * What the run was refused (what the agent's chat would have asked about:
   * no one is there to answer), when the agent reports it in its output.
   * Pilot tells the designer how to allow it (refusedNote).
   */
  refused?: Refused[];
}

/**
 * Something a run was refused, the same for every agent: an MCP server's
 * tool (`mcp`: the server's name), a shell command (`command`: as run), a
 * website (`web`: its domain), or another tool (`tool`: its name). The
 * agent says it in its reply's `pilot` block (the prompt asks every agent);
 * Claude Code also lists it in its output.
 */
export type Refused = { mcp: string } | { command: string } | { web: string } | { tool: string };

export interface RunOptions {
  /** The session to resume (a comment thread's, or the job's own for its follow-up). */
  resume?: string;
  /** Folders outside the project the agent may read (the comment's attachments). */
  readDirs?: string[];
  /** Images to show the agent, for the agents that take them as files. */
  images?: string[];
  platform?: NodeJS.Platform;
}

/** A run's error when the agent printed nothing to read (the runner adds the exit code). */
export const NOTHING_PRINTED = "The agent printed nothing.";

export interface AgentCli {
  kind: AgentKind;
  label: string;
  /** Executable names, first found wins. */
  bins: string[];
  /** How to install it, for the designer (one command or page). */
  install: string;
  /** How to sign in, for the designer. */
  signIn: string;
  /** How to update it, for the designer: a tool older than Pilot's flags fails every run (see missingFlags). */
  update: string;
  /** The arguments that print the help of the command Pilot runs, which lists its flags (see missingFlags). */
  help: string[];
  /** The sign-in check: its arguments, and whether its output says signed in. */
  status: { args: string[]; ok(output: string, code: number | null): boolean };
  /** An API key in this environment variable signs it in too (its sign-in check may not know: Cursor's says "Not logged in"). */
  keyEnv?: string;
  /** The arguments of a run (the prompt goes on stdin). */
  args(options: RunOptions): string[];
  /** Reads what a run printed. */
  parse(stdout: string): RunOutput;
  /**
   * Where it reads skills from (each a folder of `<name>/SKILL.md`): in the
   * project (its folder and each above it, up to the repository's root) and
   * in the user's home folder. Pilot lists what's there (skills.ts).
   */
  skills: { project: string[]; home: string[] };
  /**
   * How a run starts with a skill the designer picked: the first line of its
   * prompt, as the designer would type it in the agent's chat. Explicit, so
   * a skill only its user may start (`disable-model-invocation`) starts too.
   */
  invokeSkill(name: string): string;
  /**
   * Its settings for this project only, kept out of the repository where it
   * has such a file: where the request the designer can copy (see
   * refusedNote) asks their agent to allow an MCP server or a site.
   */
  projectSettings: string;
}

/**
 * Claude Code and Cursor print the same shape of stream: JSON lines,
 * `assistant` messages, then a `result` with the session. The reply is the
 * last assistant message (Cursor's `result` joins all of them).
 */
/** What an agent said it was refused, in its reply's `pilot` block (`refused`), checked: the known kinds, plain strings. */
export function refusedOf(value: unknown): Refused[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v): Refused[] => {
    const r = v as Record<string, unknown> | null;
    const text = (k: string) => (typeof r?.[k] === "string" && (r[k] as string).trim() ? (r[k] as string).trim().slice(0, 200) : null);
    const mcp = text("mcp");
    const command = text("command");
    const web = text("web");
    const tool = text("tool");
    return mcp ? [{ mcp }] : command ? [{ command }] : web ? [{ web }] : tool ? [{ tool }] : [];
  });
}

/** One of Claude Code's `permission_denials`, as a Refused: an MCP tool's server, a command, a fetched site, or the tool. */
function denialOf(d: { tool_name?: unknown; tool_input?: unknown }): Refused[] {
  if (typeof d?.tool_name !== "string") return [];
  const input = (d.tool_input && typeof d.tool_input === "object" ? d.tool_input : {}) as Record<string, unknown>;
  const mcp = /^mcp__(.+?)__/.exec(d.tool_name);
  if (mcp?.[1]) return [{ mcp: mcp[1] }];
  if (d.tool_name === "Bash" && typeof input.command === "string" && input.command.trim()) return [{ command: input.command.trim() }];
  const host = typeof input.url === "string" ? /^https?:\/\/([^/:]+)/.exec(input.url)?.[1] : undefined;
  if (d.tool_name === "WebFetch" && host) return [{ web: host }];
  return [{ tool: d.tool_name }];
}

function parseStream(stdout: string): RunOutput {
  let session: string | undefined;
  let reply: string | undefined;
  let error: string | undefined;
  let refused: Refused[] | undefined;
  for (const line of stdout.split("\n")) {
    const event = jsonLine(line);
    if (!event) continue;
    if (typeof event.session_id === "string") session = event.session_id;
    if (event.type === "assistant") {
      const text = textOf(event.message);
      if (text.trim()) reply = text.trim();
    }
    if (event.type === "result") {
      if (event.is_error) error = String(event.result ?? event.error ?? "The agent stopped with an error.");
      else if (!reply && typeof event.result === "string" && event.result.trim()) reply = event.result.trim();
      // Claude Code lists what it was refused (`permission_denials`: each tool's name and input).
      if (Array.isArray(event.permission_denials)) refused = event.permission_denials.flatMap(denialOf);
    }
  }
  if (!session && !reply && !error) error = lastLines(stdout) || NOTHING_PRINTED;
  return { session, reply, error, ...(refused?.length ? { refused } : {}) };
}

/** Codex prints JSON lines: `thread.started` (the session), `agent_message` items, errors. */
function parseCodex(stdout: string): RunOutput {
  let session: string | undefined;
  let reply: string | undefined;
  let error: string | undefined;
  for (const line of stdout.split("\n")) {
    const event = jsonLine(line);
    if (!event) continue;
    if (event.type === "thread.started" && typeof event.thread_id === "string") session = event.thread_id;
    const item = event.item as { type?: string; text?: string } | undefined;
    if (event.type === "item.completed" && item?.type === "agent_message" && item.text?.trim()) reply = item.text.trim();
    if (event.type === "error" || event.type === "turn.failed") {
      const e = event.error as { message?: string } | undefined;
      error = String(event.message ?? e?.message ?? "The agent stopped with an error.");
    }
  }
  if (!session && !reply && !error) error = lastLines(stdout) || NOTHING_PRINTED;
  return { session, reply, error };
}

/**
 * What the designer reads when a run was refused something, as briefly as it
 * can be said, after the agent's reply (`note`), and, for what can be
 * allowed safely, a request for their agent's chat that Pilot's thread copies
 * with a button (`allow`).
 *
 * Safely means narrow, and the designer's own: an MCP server they installed
 * (a skill's tools: Nucleo's), a website to look at; in the project's own
 * settings, not every project's. Never a command: a run's commands can do
 * anything (`curl` sends files anywhere or fetches a script, `node` and
 * `python3` run any code), and allowing one allows every future run whatever
 * a skill, the page's text or an attachment tells it, so the note only names
 * them (most need no allowing: the prompt has the agent read with its own
 * file tools, and leave the page to Pilot). Files outside the project: named,
 * nothing to allow. Pilot never allows anything itself (security first: a
 * button on the page could be clicked by the page's own scripts): the
 * designer pastes the request, their agent edits its settings and asks them
 * to confirm, as it does. An MCP server's request allows all its tools: the
 * note names the server, the designer decides. Null when nothing was refused.
 */
export function refusedNote(cli: AgentCli, refused: Refused[] | undefined): { note: string; allow?: string } | null {
  const servers = new Set<string>();
  const sites = new Set<string>();
  const programs = new Set<string>();
  const files = new Set<string>();
  for (const r of refused ?? []) {
    if ("mcp" in r) servers.add(r.mcp);
    else if ("web" in r) sites.add(r.web);
    else if ("command" in r) programs.add(program(r.command));
    else files.add(FILE_TOOLS[r.tool] ?? `using ${r.tool}`);
  }
  const allowable = [
    ...[...servers].map((m) => ({ ask: `the ${m} MCP server`, said: `the \`${m}\` MCP server` })),
    ...[...sites].map((w) => ({ ask: `fetching ${w}`, said: `fetching \`${w}\`` })),
  ];
  const said = [...allowable.map((a) => a.said), ...(programs.size ? [`running ${list([...programs].map((p) => `\`${p}\``))}`] : []), ...files];
  if (!said.length) return null;
  const head = `**Not allowed in this run** (${cli.label} can't ask you here, as in its chat): ${list(said)}.`;
  if (!allowable.length) return { note: head };
  const them = allowable.length > 1 ? "them" : "it";
  return {
    note: `${head} To allow ${allowable.length > 1 ? "the MCP servers and sites" : servers.size ? "the MCP server" : "the site"}, copy the instructions for ${cli.label}.`,
    allow: `Allow ${list(allowable.map((a) => a.ask))} in this project's ${cli.label} settings (${cli.projectSettings}), so Pilot's runs here can use ${them}.`,
  };
}

/** The file tools a run is refused outside the project, said in words. */
const FILE_TOOLS: Record<string, string> = {
  Write: "writing files outside the project",
  Edit: "editing files outside the project",
  MultiEdit: "editing files outside the project",
  NotebookEdit: "editing files outside the project",
  Read: "reading files outside the project",
};

/** `a`, `a and b`, `a, b and c`. */
function list(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** A command's program: its first word (after any `VAR=value`), the file's name for a path. */
function program(command: string): string {
  const words = command.trim().split(/\s+/);
  const first = words.find((w) => !/^[A-Za-z_]\w*=/.test(w)) ?? words[0] ?? command;
  return (first.split("/").pop() || first).replace(/^["']|["']$/g, "").slice(0, 40);
}

export const AGENTS: Record<AgentKind, AgentCli> = {
  claude: {
    kind: "claude",
    label: "Claude Code",
    bins: ["claude"],
    install: "curl -fsSL https://claude.ai/install.sh | bash",
    signIn: "claude auth login",
    update: "claude update",
    help: ["--help"],
    status: { args: ["auth", "status"], ok: (out) => /"loggedIn"\s*:\s*true/.test(out) },
    // The designer's own settings (allow rules, MCP servers, skills), edits in the project accepted.
    // A run can't prompt: `-p` refuses what would ask (checked; `--permission-prompts none` says the
    // same, but older versions don't know it). Reading the user's skills is allowed, read-only: its
    // chat would ask before a skill reads its other files there, and a run can't answer.
    // Partial messages: its output comes while it thinks too, so Pilot sees a long think isn't a stalled run (Job.activeAt).
    args: ({ resume, readDirs = [] }) => [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode", "acceptEdits",
      "--allowedTools", "Read(~/.claude/skills/**)",
      ...readDirs.flatMap((d) => ["--add-dir", d]),
      ...(resume ? ["--resume", resume] : []),
    ],
    parse: parseStream,
    skills: { project: [".claude/skills"], home: [".claude/skills"] },
    invokeSkill: (name) => `/${name}`,
    projectSettings: ".claude/settings.local.json",
  },
  codex: {
    kind: "codex",
    label: "Codex",
    bins: ["codex"],
    install: "npm install -g @openai/codex",
    signIn: "codex login",
    update: "npm install -g @openai/codex@latest",
    help: ["exec", "--help"],
    status: { args: ["login", "status"], ok: (_out, code) => code === 0 },
    // Its sandbox in the mode its chat uses for a project (writes in the project), with the designer's
    // own settings for the rest (network, web search, rules). `exec` never asks: what would is refused.
    // On Windows the sandbox needs a mode, or a run is read-only; "unelevated" needs no admin rights.
    args: ({ resume, images = [], platform = process.platform }) => [
      "exec",
      "--json",
      "-s", "workspace-write",
      ...(platform === "win32" ? ["-c", 'windows.sandbox="unelevated"'] : []),
      "--skip-git-repo-check",
      ...images.flatMap((i) => ["-i", i]),
      ...(resume ? ["resume", resume] : []),
      "-",
    ],
    parse: parseCodex,
    skills: { project: [".agents/skills"], home: [".agents/skills", ".codex/skills"] },
    invokeSkill: (name) => "$" + name,
    projectSettings: ".codex/config.toml",
  },
  cursor: {
    kind: "cursor",
    label: "Cursor",
    bins: ["cursor-agent", "agent"],
    install: "curl https://cursor.com/install -fsS | bash",
    signIn: "cursor-agent login",
    update: "cursor-agent update",
    help: ["--help"],
    status: { args: ["status"], ok: (out) => /logged in/i.test(out) && !/not logged in/i.test(out) },
    keyEnv: "CURSOR_API_KEY",
    // Its allowlist mode, not its sandbox: the sandbox doesn't exist on Windows and fails on Ubuntu's
    // default AppArmor settings. Without `--force`, a run is refused what the user's allowlist doesn't
    // allow (it can't ask): writes outside the project, web fetches, shell commands. Checked on all three.
    args: ({ resume }) => ["-p", "--output-format", "stream-json", "--trust", "--sandbox", "disabled", ...(resume ? ["--resume", resume] : [])],
    parse: parseStream,
    skills: { project: [".agents/skills", ".cursor/skills"], home: [".cursor/skills"] },
    invokeSkill: (name) => `/${name}`,
    projectSettings: ".cursor/cli.json",
  },
};

export function isAgentKind(value: unknown): value is AgentKind {
  return typeof value === "string" && (AGENT_KINDS as readonly string[]).includes(value);
}

/**
 * An agent's executable: on PATH (with PATHEXT on Windows), or in
 * `~/.local/bin` (where the installers put them, not always on PATH yet).
 */
export function findBin(
  names: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string | null {
  const win = platform === "win32";
  const exts = win ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean).map((e) => e.toLowerCase()) : [""];
  const dirs = [...(env.PATH ?? env.Path ?? "").split(win ? ";" : delimiter), join(home, ".local", "bin")].filter(Boolean);
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const file = join(dir, name + ext);
        try {
          if (statSync(file).isFile()) return file;
        } catch {
          // Not there.
        }
      }
    }
  }
  return null;
}

/**
 * The agent running this process, from what it sets in its shell: `init`
 * runs inside the agent's own chat (the setup prompt), so the agent the
 * designer set Pilot up with is the one Pilot runs. Null when it can't be told.
 */
export function agentFromEnv(env: NodeJS.ProcessEnv = process.env): AgentKind | null {
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return "claude";
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID) return "cursor";
  if (env.CODEX_SANDBOX || env.CODEX_SANDBOX_NETWORK_DISABLED || env.CODEX_MANAGED_BY_NPM || env.CODEX_THREAD_ID) return "codex";
  return null;
}

/** An agent found on this machine: its executable, and whether it's signed in. */
export interface FoundAgent {
  kind: AgentKind;
  bin: string;
  signedIn: boolean;
}

/** The agents installed here, each with whether it's signed in (each check takes about a second). */
/**
 * The long flags Pilot runs this agent with that its installed tool's help
 * doesn't list: a tool older than them fails every run, and Cursor's
 * printed nothing then ("The agent printed nothing", found with a
 * year-old cursor-agent that didn't know `--trust` or `--sandbox`). Null
 * when the help can't be read: then nothing is said. Only ever said, never
 * a reason to refuse to run: a help worded unlike Pilot expects mustn't stop
 * a tool that works.
 */
export async function missingFlags(cli: AgentCli, bin: string, run: typeof exec = exec): Promise<string[] | null> {
  const flags = [...new Set(cli.args({ resume: "session", readDirs: ["dir"], images: ["image.png"] }).filter((a) => a.startsWith("--")))];
  let help: ExecResult;
  try {
    help = await run(bin, cli.help, { timeoutMs: 15_000 });
  } catch {
    return null;
  }
  const text = `${help.stdout}\n${help.stderr}`;
  // A help that names none of them isn't one Pilot can read (another language, an error): nothing to say.
  if (help.killed || !text.trim() || !flags.some((f) => listed(text, f))) return null;
  return flags.filter((f) => !listed(text, f));
}

/** Whether a help text lists `flag` (`--trust`, not `--trusted`). */
function listed(text: string, flag: string): boolean {
  return new RegExp(`(^|[^\\w-])${flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(text);
}

export async function detectAgents(kinds: readonly AgentKind[] = AGENT_KINDS): Promise<FoundAgent[]> {
  const found = await Promise.all(
    kinds.map(async (kind): Promise<FoundAgent | null> => {
      const cli = AGENTS[kind];
      const bin = findBin(cli.bins);
      if (!bin) return null;
      if (cli.keyEnv && process.env[cli.keyEnv]) return { kind, bin, signedIn: true };
      const { stdout, stderr, code } = await exec(bin, cli.status.args, { timeoutMs: 15_000 });
      return { kind, bin, signedIn: cli.status.ok(stdout + stderr, code) };
    }),
  );
  return found.filter((a): a is FoundAgent => !!a);
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  /** Killed: the signal aborted it, or it ran out of time. */
  killed: boolean;
}

/**
 * Runs an executable with `input` on stdin. A `.cmd`/`.bat` (npm's global
 * installs on Windows) can only run through a shell: its arguments are then
 * quoted; they're Pilot's own flags, session ids and paths, never the prompt,
 * which always goes on stdin (no quoting, no length limit).
 */
export function exec(
  bin: string,
  args: string[],
  options: { cwd?: string; input?: string; signal?: AbortSignal; timeoutMs?: number; env?: NodeJS.ProcessEnv; onStdout?(chunk: string): void } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    const child = shell
      ? spawn([bin, ...args].map(quoteForCmd).join(" "), { cwd: options.cwd, shell: true, windowsHide: true, env: options.env ?? childEnv() })
      : spawn(bin, args, { cwd: options.cwd, windowsHide: true, env: options.env ?? childEnv() });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const kill = () => {
      killed = true;
      child.kill();
    };
    child.stdout?.on("data", (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = options.timeoutMs ? setTimeout(kill, options.timeoutMs) : null;
    options.signal?.addEventListener("abort", kill, { once: true });
    const finish = (code: number | null) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", kill);
      resolve({ stdout, stderr, code, killed });
    };
    child.on("error", (e) => {
      stderr += String(e);
      finish(-1);
    });
    child.on("close", finish);
    child.stdin?.on("error", () => {});
    child.stdin?.end(options.input ?? "");
  });
}

/** One argument for cmd.exe: in double quotes when it needs them. */
function quoteForCmd(arg: string): string {
  return /^[\w\-.:\\/=,]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

/**
 * The environment of an agent's run: Pilot's own, without what marks a
 * process as running inside an agent's session (Claude Code won't start
 * inside another one), so `npx usepilot` works from an agent's terminal too.
 */
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { CLAUDECODE: _a, CLAUDE_CODE_ENTRYPOINT: _b, ...rest } = env;
  return rest;
}

function jsonLine(line: string): Record<string, unknown> | null {
  const text = line.trim();
  if (!text.startsWith("{")) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function textOf(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: string; text: string } => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

function lastLines(text: string): string {
  return text.trim().split("\n").slice(-3).join("\n").slice(0, 500);
}
