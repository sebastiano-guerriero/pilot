#!/usr/bin/env node
// Checks that Pilot can run each agent's command-line tool for a job, on this
// machine: a job, a follow-up resuming its session, and that a run keeps the
// agent's own permissions: what its chat would ask about (a file written outside
// the project, by default) is refused, without the run hanging, since no one is
// there to answer. The internet and shell commands are as the agent's settings
// say (shown, not judged). And a skill the designer picked, started as the
// agent's chat starts one, reading its other files. Run it on every
// platform Pilot supports (`.github/workflows/agent-runs.yml` does Windows and
// Linux). See docs/handoff.md.
//
//   node scripts/agent-runs-check.mjs [--agents claude,codex,cursor] [--dir <folder>]
//
// The prompt goes in on stdin, never as an argument: no quoting or length limits
// on Windows. Costs a few agent runs per agent.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const WIN = process.platform === "win32";
const RUN_TIMEOUT_MS = 4 * 60_000;

const AGENTS = {
  claude: {
    label: "Claude Code",
    bins: ["claude"],
    status: { args: ["auth", "status"], ok: (out) => /"loggedIn"\s*:\s*true/.test(out) },
    args: (resume) => [
      "-p", "--output-format", "json", "--permission-mode", "acceptEdits",
      "--allowedTools", "Read(~/.claude/skills/**)",
      ...(resume ? ["--resume", resume] : []),
    ],
    parse: jsonResult,
    // Where its project's skills are, and how a run starts one (AGENTS in packages/cli/src/agents.ts).
    skill: { dir: ".claude/skills", invoke: (name) => `/${name}` },
  },
  codex: {
    label: "Codex",
    bins: ["codex"],
    status: { args: ["login", "status"], ok: (_out, code) => code === 0 },
    // On Windows, Codex's sandbox needs a mode, or a headless run is read-only
    // (every command "blocked by policy"). "unelevated" needs no admin rights.
    // CODEX_CONFIG adds `-c` settings, `;`-separated (e.g. windows.sandbox="elevated").
    args: (resume) => [
      "exec", "--json", "-s", "workspace-write",
      ...(WIN ? ["-c", 'windows.sandbox="unelevated"'] : []),
      ...(process.env.CODEX_CONFIG ?? "").split(";").filter(Boolean).flatMap((c) => ["-c", c]),
      ...(resume ? ["resume", resume] : []), "-",
    ],
    parse: (out) => {
      let session, reply, error;
      for (const line of out.split("\n")) {
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (e.type === "thread.started") session = e.thread_id;
        if (e.type === "item.completed" && e.item?.type === "agent_message") reply = e.item.text;
        if (e.type === "error" || e.type === "turn.failed") error = e.message ?? e.error?.message ?? line;
      }
      return { session, reply, error };
    },
    skill: { dir: ".agents/skills", invoke: (name) => "$" + name },
  },
  cursor: {
    label: "Cursor",
    bins: ["cursor-agent", "agent"],
    // Its status says "Not logged in" with an API key, which runs use: the key counts.
    status: { args: ["status"], ok: (out) => /logged in/i.test(out) && !/not logged in/i.test(out) || !!process.env.CURSOR_API_KEY },
    // Its allowlist mode, as Pilot runs it (its sandbox isn't on Windows); CURSOR_SANDBOX=on tries the sandbox.
    args: (resume) => [
      "-p", "--output-format", "json", "--trust",
      "--sandbox", process.env.CURSOR_SANDBOX === "on" ? "enabled" : "disabled",
      ...(resume ? ["--resume", resume] : []),
    ],
    parse: jsonResult,
    skill: { dir: ".agents/skills", invoke: (name) => `/${name}` },
  },
};

function jsonResult(out) {
  const text = out.trim();
  const start = text.lastIndexOf("\n{") + 1;
  try {
    const d = JSON.parse(text.slice(start));
    return { session: d.session_id, reply: d.result, error: d.is_error ? (d.result ?? "error") : undefined };
  } catch {
    return { error: text.slice(0, 400) || "no output" };
  }
}

/** The agent's executable: on PATH (with PATHEXT on Windows) or in ~/.local/bin. */
function findBin(names) {
  const exts = WIN ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase()) : [""];
  const dirs = [...(process.env.PATH ?? "").split(delimiter), join(homedir(), ".local", "bin")].filter(Boolean);
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const file = join(dir, name + ext);
        try { if (statSync(file).isFile()) return file; } catch {}
      }
    }
  }
  return null;
}

/**
 * Runs a binary with its prompt on stdin. A `.cmd`/`.bat` shim (npm's global
 * installs on Windows) needs a shell; its arguments are only fixed flags and
 * session ids here, never the prompt, so nothing needs quoting.
 */
function run(bin, args, { cwd, input, timeout = RUN_TIMEOUT_MS }) {
  return new Promise((done) => {
    const shell = WIN && /\.(cmd|bat)$/i.test(bin);
    const child = spawn(shell ? `"${bin}"` : bin, args, { cwd, shell, windowsHide: true, env: process.env });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => child.kill(), timeout);
    child.on("error", (e) => { clearTimeout(timer); done({ code: -1, out, err: String(e) }); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, out, err }); });
    child.stdin.end(input ?? "");
  });
}

function git(cwd, ...args) {
  spawnSync("git", args, { cwd, stdio: "ignore" });
}

const CSS = ".button { padding: 4px 8px; border-radius: 4px; }\n";
const HTML = '<!doctype html>\n<link rel="stylesheet" href="styles.css">\n<button class="button">Refill</button>\n';

function paddingOf(project) {
  return /\.button\s*\{[^}]*padding:\s*([^;]+);/.exec(readFileSync(join(project, "styles.css"), "utf8"))?.[1]?.trim() ?? "";
}

async function check(id, root) {
  const agent = AGENTS[id];
  const rows = [];
  const label =
    id === "codex" && process.env.CODEX_CONFIG
      ? `${agent.label} (${process.env.CODEX_CONFIG})`
      : id === "cursor" && process.env.CURSOR_SANDBOX === "on"
        ? `${agent.label} (sandbox)`
        : agent.label;
  const row = (step, pass, detail, seconds) => rows.push({ agent: label, step, pass, detail, seconds });

  const bin = process.env[`${id.toUpperCase()}_BIN`] || findBin(agent.bins);
  if (!bin) {
    row("installed", false, `none of ${agent.bins.join(", ")} found`);
    return rows;
  }
  const status = await run(bin, agent.status.args, { cwd: root, timeout: 60_000 });
  const signedIn = agent.status.ok(status.out + status.err, status.code);
  row("signed in", signedIn, `${bin}: ${(status.out + status.err).trim().split("\n")[0]?.slice(0, 120) ?? ""}`);
  if (!signedIn) return rows;

  // The project, and an outside folder next to it (outside the OS temp folder:
  // sandboxes may allow writing there).
  const base = join(root, id);
  rmSync(base, { recursive: true, force: true });
  const project = join(base, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "styles.css"), CSS);
  writeFileSync(join(project, "index.html"), HTML);
  git(project, "init", "-q");
  git(project, "add", "-A");
  git(project, "-c", "user.name=Pilot", "-c", "user.email=pilot@example.com", "commit", "-qm", "base");

  const ask = async (prompt, resume) => {
    const t = Date.now();
    const r = await run(bin, agent.args(resume), { cwd: project, input: prompt });
    const parsed = agent.parse(r.out);
    // A run that printed nothing: what it said on stderr (and its exit code) is the reason.
    if (parsed.error && !parsed.reply) parsed.error = `${parsed.error} | exit ${r.code} | ${r.err.trim().slice(-300) || "no stderr"}`;
    return { ...parsed, seconds: Math.round((Date.now() - t) / 100) / 10, raw: (r.out + r.err).slice(-400), code: r.code };
  };

  // 1. A job.
  const job = await ask(
    'Pilot design edits. The designer changed this on the page; apply it in the code. Element `.button` (the "Refill" button, styles.css): padding: 8px 16px. Then reply in one short sentence for the designer.',
  );
  const after1 = paddingOf(project);
  const jobOk = after1 === "8px 16px" && !!job.session;
  row("job", jobOk, jobOk ? `padding ${after1}, session ${job.session}` : `padding "${after1}", session ${job.session}, ${job.error ?? job.raw}`, job.seconds);

  // 2. A follow-up in the same session, naming nothing: it must remember.
  if (job.session) {
    const follow = await ask("Designer, in the same thread: a bit more. Reply in one short sentence.", job.session);
    const after2 = paddingOf(project);
    const sameSession = !follow.session || follow.session === job.session;
    const ok = after2 !== after1 && after2 !== "" && sameSession;
    row("follow-up, resumed", ok, ok ? `padding ${after2}` : `padding "${after2}", session ${follow.session}, ${follow.error ?? follow.raw}`, follow.seconds);
  }

  // 3. A file outside the project: every agent's chat asks first (by default),
  // so a run must refuse it, and say so. A run that failed proves nothing (no
  // file either), so it needs a reply.
  const outside = join(base, "outside.txt");
  const o = await ask("Create the file ../outside.txt (one folder above this project) containing the word hi, by any means you have. If you can't, say so in one sentence.");
  const wrote = existsSync(outside);
  row("can't write outside", !wrote && !!o.reply, wrote ? "the file was written" : o.reply ? o.reply.slice(0, 160) : `the run failed: ${o.error ?? o.raw}`, o.seconds);

  // 4. The internet: as the agent's settings say (Codex searches the web by
  // default, Claude Code and Cursor ask first). Informational; it needs a reply,
  // so a run that hangs or fails waiting for an answer still fails.
  const n = await ask("Fetch https://example.com by any means you have and write its page title into net-proof.txt in this project. If you can't reach the network, say so in one sentence and write nothing.");
  const proof = join(project, "net-proof.txt");
  const fetched = existsSync(proof) && /example domain/i.test(readFileSync(proof, "utf8"));
  row("internet (info)", n.reply ? null : false, n.reply ? `${fetched ? "reached it" : "refused"}: ${n.reply.slice(0, 160)}` : `the run failed: ${n.error ?? n.raw}`, n.seconds);

  // 5. A shell command: as the agent's settings say. Informational.
  const c = await ask("Run this exact shell command: echo hi > cmd-proof.txt   If you can't run commands, say so in one sentence and create nothing.");
  const ran = existsSync(join(project, "cmd-proof.txt"));
  row("shell command (info)", null, ran ? "ran, inside the project" : "not run", c.seconds);

  // 6. A skill the designer picked (docs/handoff.md, *Skills*): the run starts
  // with it as the agent's chat would, one only its user may start, whose code
  // word is in another of its files, so the reply proves it loaded the skill
  // and read that file.
  const word = `HERON-${Math.floor(1000 + Math.random() * 9000)}`;
  const folder = join(project, agent.skill.dir, "pilot-check");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "SKILL.md"), "---\nname: pilot-check\ndescription: Pilot's agent-runs check.\ndisable-model-invocation: true\n---\n\nOpen [details.md](details.md) in this skill's folder and reply with the code word written there, and nothing else.\n");
  writeFileSync(join(folder, "details.md"), `The code word is ${word}.\n`);
  const k = await ask(`${agent.skill.invoke("pilot-check")}\n\nThis is a comment from Pilot about the \`.button\` element in index.html.`);
  row("uses a skill", !!k.reply?.includes(word), k.reply ? k.reply.slice(0, 160) : `the run failed: ${k.error ?? k.raw}`, k.seconds);

  return rows;
}

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const ids = opt("agents", "claude,codex,cursor").split(",").map((s) => s.trim()).filter(Boolean);
const root = resolve(opt("dir", join(process.cwd(), ".agent-runs-check")));
mkdirSync(root, { recursive: true });

const unknown = ids.filter((id) => !AGENTS[id]);
if (unknown.length) {
  console.error(`Unknown agent: ${unknown.join(", ")}. Known: ${Object.keys(AGENTS).join(", ")}`);
  process.exit(2);
}

const results = (await Promise.all(ids.map((id) => check(id, root).catch((e) => [{ agent: AGENTS[id].label, step: "crashed", pass: false, detail: String(e) }])))).flat();

const mark = (p) => (p === null ? "ℹ️" : p ? "✅" : "❌");
// Results may be shown publicly (a CI summary): no email addresses.
const cell = (s) => String(s ?? "").replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>").replace(/\b(sk|key|crsr)[-_][\w*-]+/gi, "<key>").replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = [
  `### Agent runs on ${process.platform} (${process.arch})`,
  "",
  "| Agent | Step | | Time | Detail |",
  "| --- | --- | --- | --- | --- |",
  ...results.map((r) => `| ${r.agent} | ${r.step} | ${mark(r.pass)} | ${r.seconds != null ? `${r.seconds}s` : ""} | ${cell(r.detail)} |`),
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, table + "\n");
process.exit(results.some((r) => r.pass === false) ? 1 : 0);
