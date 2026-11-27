#!/usr/bin/env node
// Checks what each agent's sign-in does when Pilot starts it from the page (docs/handoff.md, *Before the agent is
// ready*): its command (`login` in packages/cli/src/agents.ts) run the way Pilot runs it, with no terminal and nothing
// typed in, while the designer would sign in in the browser. Pilot can only help when the sign-in prints its page's
// address (https://…, shown on the page in case the browser didn't open) and keeps waiting for the browser instead of
// asking for a code in the terminal. Each sign-in is stopped after a moment: nobody signs in here.
//
//   node scripts/sign-in-check.mjs [--agents claude,codex,cursor] [--wait 20]
//
// Run where the agents are installed and NOT signed in (`.github/workflows/agent-runs.yml` runs it before signing
// them in): on a machine you use, it would start a real sign-in in your browser.

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const WIN = process.platform === "win32";
const args = process.argv.slice(2);
const wanted = args.includes("--agents") ? args[args.indexOf("--agents") + 1].split(",") : ["claude", "codex", "cursor"];
const waitMs = Number(args.includes("--wait") ? args[args.indexOf("--wait") + 1] : 20) * 1000;

// The same commands as `login` in AGENTS (packages/cli/src/agents.ts).
const AGENTS = {
  claude: { label: "Claude Code", bins: ["claude"], login: ["auth", "login"] },
  codex: { label: "Codex", bins: ["codex"], login: ["login"] },
  cursor: { label: "Cursor", bins: ["cursor-agent", "agent"], login: ["login"] },
};

/** As Pilot finds it (findBin in agents.ts): on PATH, with PATHEXT on Windows, or in ~/.local/bin. */
function findBin(names) {
  const exts = WIN ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").filter(Boolean) : [""];
  const dirs = [...(process.env.PATH ?? process.env.Path ?? "").split(WIN ? ";" : delimiter), join(homedir(), ".local", "bin")].filter(Boolean);
  for (const name of names)
    for (const dir of dirs)
      for (const ext of exts) {
        try {
          if (statSync(join(dir, name + ext)).isFile()) return join(dir, name + ext);
        } catch {}
      }
  return null;
}

/** Runs the sign-in as Pilot does (stdin closed at once, a .cmd through a shell), for `waitMs` at most. */
function signIn(bin, loginArgs) {
  return new Promise((done) => {
    const shell = WIN && /\.(cmd|bat)$/i.test(bin);
    // A designer's machine: no API key in the environment (that's what signing in is for).
    const env = { ...process.env };
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CURSOR_API_KEY"]) delete env[key];
    const child = shell
      ? spawn([bin, ...loginArgs].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { shell: true, env, windowsHide: true, detached: !WIN })
      : spawn(bin, loginArgs, { env, windowsHide: true, detached: !WIN });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.stdin.end("");
    child.on("error", (e) => (output += String(e)));
    const timer = setTimeout(() => {
      if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    }, waitMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ output, code });
    });
  });
}

const rows = [];
let failed = false;
for (const kind of wanted) {
  const agent = AGENTS[kind];
  if (!agent) continue;
  const bin = findBin(agent.bins);
  if (!bin) {
    rows.push({ agent: agent.label, result: "not installed", detail: "" });
    continue;
  }
  const started = Date.now();
  const { output, code } = await signIn(bin, agent.login);
  const seconds = Math.round((Date.now() - started) / 1000);
  const url = /https:\/\/[^\s"'<>]+/.exec(output)?.[0];
  // Still waiting when stopped (it ran the whole time): it waits for the browser, as Pilot needs.
  const waited = seconds * 1000 >= waitMs - 1000;
  const ok = !!url && waited;
  if (!ok) failed = true;
  const tail = output.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").trim().split("\n").slice(-4).join(" ⏎ ").slice(0, 300);
  rows.push({
    agent: agent.label,
    result: ok ? "✅ prints its page's address, waits for the browser" : !url ? "❌ no sign-in address printed" : "❌ ended by itself (it may want a code typed)",
    detail: `${url ? `address: ${url.slice(0, 60)}… · ` : ""}${waited ? `still waiting after ${seconds}s` : `ended after ${seconds}s (exit ${code})`} · ${tail}`,
  });
}

const lines = [`### Sign-in from the page (${process.platform})`, "", "| Agent | Result | What it did |", "| --- | --- | --- |", ...rows.map((r) => `| ${r.agent} | ${r.result} | ${r.detail.replace(/\|/g, "\\|")} |`)];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n\n`);
process.exit(failed ? 1 : 0);
