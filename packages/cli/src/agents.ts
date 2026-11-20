import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * The coding agents Pilot runs for a job: each one's command-line tool, run
 * once per job in the project's folder, the prompt on stdin. A comment thread
 * resumes its session, so the agent remembers the thread. The flags keep every
 * run inside the limits Pilot promises: it edits the project's files and
 * nothing else on the machine, and can't reach the internet. Checked on macOS,
 * Linux and Windows by scripts/agent-runs-check.mjs (docs/handoff.md, *Agent runs*).
 */

export type AgentKind = "claude" | "codex" | "cursor";

export const AGENT_KINDS: readonly AgentKind[] = ["claude", "codex", "cursor"];

/** What a run printed, read: the session to resume, the agent's last message, or what went wrong. */
export interface RunOutput {
  session?: string;
  reply?: string;
  error?: string;
}

export interface RunOptions {
  /** The session to resume (a comment thread's, or the job's own for its follow-up). */
  resume?: string;
  /** Folders outside the project the agent may read (the comment's attachments). */
  readDirs?: string[];
  /** Images to show the agent, for the agents that take them as files. */
  images?: string[];
  platform?: NodeJS.Platform;
}

export interface AgentCli {
  kind: AgentKind;
  label: string;
  /** Executable names, first found wins. */
  bins: string[];
  /** How to install it, for the designer (one command or page). */
  install: string;
  /** How to sign in, for the designer. */
  signIn: string;
  /** The sign-in check: its arguments, and whether its output says signed in. */
  status: { args: string[]; ok(output: string, code: number | null): boolean };
  /** An API key in this environment variable signs it in too (its sign-in check may not know: Cursor's says "Not logged in"). */
  keyEnv?: string;
  /** The arguments of a run (the prompt goes on stdin). */
  args(options: RunOptions): string[];
  /** Reads what a run printed. */
  parse(stdout: string): RunOutput;
}

/**
 * Claude Code and Cursor print the same shape of stream: JSON lines,
 * `assistant` messages, then a `result` with the session. The reply is the
 * last assistant message (Cursor's `result` joins all of them).
 */
function parseStream(stdout: string): RunOutput {
  let session: string | undefined;
  let reply: string | undefined;
  let error: string | undefined;
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
    }
  }
  if (!session && !reply && !error) error = lastLines(stdout) || "The agent printed nothing.";
  return { session, reply, error };
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
  if (!session && !reply && !error) error = lastLines(stdout) || "The agent printed nothing.";
  return { session, reply, error };
}

export const AGENTS: Record<AgentKind, AgentCli> = {
  claude: {
    kind: "claude",
    label: "Claude Code",
    bins: ["claude"],
    install: "curl -fsSL https://claude.ai/install.sh | bash",
    signIn: "claude auth login",
    status: { args: ["auth", "status"], ok: (out) => /"loggedIn"\s*:\s*true/.test(out) },
    // Restricted: no tool that runs commands or reaches the web, file tools confined to the project.
    args: ({ resume, readDirs = [] }) => [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--restricted",
      "--strict-mcp-config",
      "--tools", "Read,Edit,Write,Glob,Grep",
      "--permission-mode", "acceptEdits",
      ...readDirs.flatMap((d) => ["--add-dir", d]),
      ...(resume ? ["--resume", resume] : []),
    ],
    parse: parseStream,
  },
  codex: {
    kind: "codex",
    label: "Codex",
    bins: ["codex"],
    install: "npm install -g @openai/codex",
    signIn: "codex login",
    status: { args: ["login", "status"], ok: (_out, code) => code === 0 },
    // Its sandbox: writes only in the project, no network; no web search (it runs outside the sandbox).
    // On Windows the sandbox needs a mode, or a run is read-only; "unelevated" needs no admin rights.
    args: ({ resume, images = [], platform = process.platform }) => [
      "exec",
      "--json",
      "-s", "workspace-write",
      "-c", 'web_search="disabled"',
      ...(platform === "win32" ? ["-c", 'windows.sandbox="unelevated"'] : []),
      "--skip-git-repo-check",
      ...images.flatMap((i) => ["-i", i]),
      ...(resume ? ["resume", resume] : []),
      "-",
    ],
    parse: parseCodex,
  },
  cursor: {
    kind: "cursor",
    label: "Cursor",
    bins: ["cursor-agent", "agent"],
    install: "curl https://cursor.com/install -fsS | bash",
    signIn: "cursor-agent login",
    status: { args: ["status"], ok: (out) => /logged in/i.test(out) && !/not logged in/i.test(out) },
    keyEnv: "CURSOR_API_KEY",
    // Its allowlist mode, not its sandbox: the sandbox doesn't exist on Windows and fails on Ubuntu's
    // default AppArmor settings. Without `--force`, a run is refused what the user's allowlist doesn't
    // allow (it can't ask): writes outside the project, web fetches, shell commands. Checked on all three.
    args: ({ resume }) => ["-p", "--output-format", "stream-json", "--trust", "--sandbox", "disabled", ...(resume ? ["--resume", resume] : [])],
    parse: parseStream,
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

/** An agent found on this machine: its executable, and whether it's signed in. */
export interface FoundAgent {
  kind: AgentKind;
  bin: string;
  signedIn: boolean;
}

/** The agents installed here, each with whether it's signed in (each check takes about a second). */
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
