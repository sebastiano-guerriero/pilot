#!/usr/bin/env node
// Checks Pilot started with a dev server, on this machine, as a project installs it: `usepilot` packed from this
// repo and installed with npm into a Vite app (`usepilot/vite`), a Next.js app (`withPilot`) and a plain one
// (`usepilot dev -- <command>`), each run as its dev server would be. With a stand-in for Claude Code's
// command-line tool (no account, no agent run, nothing sent anywhere), and a home folder and PATH of its own, so
// the machine's real agents and Pilot's settings are never touched. Plays the page's side against Pilot's hub:
// - Pilot starts with the dev server, before any agent is installed: the page hears why nothing runs yet, and a job
//   sent waits;
// - the stand-in installed: "not signed in", and Pilot can sign it in; the page asks, the stand-in's sign-in prints
//   its page's address (shown on the page), then signs in; the job that waited runs;
// - only one Pilot per dev server, however many processes it has (Next.js);
// - the dev server stopping stops Pilot; `usepilot dev` passes the dev server's exit code on, runs a command line
//   of several commands through a shell (a `.cmd` on Windows), and never starts Pilot in production.
// Run on every platform Pilot supports (`.github/workflows/tests.yml` does Windows and Linux). See docs/handoff.md,
// *Starting with the dev server*.
//
//   node scripts/dev-server-check.mjs [--only vite,next,dev] [--keep]
//
// Needs the network once per run (npm installs Vite, Next.js and React into temporary projects).

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : ["vite", "next", "dev"];
const keep = args.includes("--keep");

const root = mkdtempSync(join(tmpdir(), "pilot-dev-check-"));
const home = join(root, "home");
mkdirSync(home);
const results = [];
const children = new Set();
const log = (line) => console.log(line);

// ── The pieces ──────────────────────────────────────────────────────────────

/** A free port on this machine. */
function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** Runs a command to its end, its output shown; throws when it fails. */
function sh(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit", shell: WIN });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(" ")} failed in ${cwd} (exit ${result.status})`);
}

/**
 * The environment of a dev server here: its own home folder (HOME, and USERPROFILE on Windows: where Pilot looks for
 * the agents' tools and keeps its settings), and a PATH with Node's folder and the system's only, so no agent
 * installed on this machine is found. Pilot's hub on a port of its own.
 */
function devEnv(hubPort, extra = {}) {
  const system = WIN ? [join(process.env.SystemRoot ?? "C:\\Windows", "System32"), process.env.SystemRoot ?? "C:\\Windows"] : ["/usr/bin", "/bin"];
  const keep = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => /^(SystemRoot|ComSpec|PATHEXT|TEMP|TMP|TMPDIR|LANG|windir|SYSTEMDRIVE)$/i.test(k)),
  );
  return {
    ...keep,
    HOME: home,
    USERPROFILE: home,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: join(home, ".config"),
    PATH: [dirname(process.execPath), ...system, ...(extra.PATH ? [extra.PATH] : [])].join(WIN ? ";" : ":"),
    PILOT_PORT: String(hubPort),
    NODE_ENV: extra.NODE_ENV ?? "development",
    NEXT_TELEMETRY_DISABLED: "1",
    BROWSER: "none",
    CI: "",
  };
}

/** Starts a dev server (a Node script and its arguments, never a shell: its process is the one Pilot runs in). */
function start(name, cwd, nodeArgs, env) {
  // Its own process group off Windows, so stopping it stops its children too, as Ctrl+C in a terminal does.
  const child = spawn(process.execPath, nodeArgs, { cwd, env, detached: !WIN, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.output = "";
  const take = (d) => {
    child.output += d;
    for (const line of String(d).split("\n")) if (line.trim()) log(`    ${name} │ ${line.replace(/\x1b\[[0-9;]*m/g, "")}`);
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  child.exited = new Promise((done) => child.on("exit", (code, signal) => done({ code, signal })));
  child.exited.then(() => children.delete(child));
  return child;
}

/** Stops a dev server and everything it started, the way Ctrl+C does in its terminal. */
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-child.pid, "SIGINT");
    } catch {}
  }
  const timer = setTimeout(() => {
    try {
      WIN ? spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]) : process.kill(-child.pid, "SIGKILL");
    } catch {}
  }, 10_000);
  await child.exited;
  clearTimeout(timer);
}

async function until(what, check, ms = 30_000) {
  const startAt = Date.now();
  for (;;) {
    let ok = false;
    try {
      ok = await check();
    } catch {}
    if (ok) return log(`  ✓ ${what}`);
    if (Date.now() - startAt > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** The page's side, as the overlay talks to the hub: its events, and its posts, from the app's origin. */
function page(hubPort, origin, project) {
  const hub = `http://127.0.0.1:${hubPort}`;
  const events = [];
  const abort = new AbortController();
  let connected = false;
  (async () => {
    for (; !abort.signal.aborted; await new Promise((r) => setTimeout(r, 300))) {
      try {
        const res = await fetch(`${hub}/events?project=${encodeURIComponent(project)}`, { headers: { origin }, signal: abort.signal });
        connected = true;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const data = buffer.slice(0, end).split("\n").find((l) => l.startsWith("data: "));
            buffer = buffer.slice(end + 2);
            if (data) events.push(JSON.parse(data.slice(6)));
          }
        }
      } catch {
        // The hub isn't up yet, or went: the page keeps trying, as the overlay does.
      }
      connected = false;
    }
  })();
  const agents = () => events.filter((e) => e.type === "agents").at(-1)?.agents ?? [];
  return {
    hub,
    agents,
    get connected() {
      return connected;
    },
    job: (id) => events.filter((e) => e.type === "job" && e.job.id === id).at(-1)?.job,
    post: (path, body) => fetch(`${hub}${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }),
    close: () => abort.abort(),
  };
}

async function hubUp(hubPort) {
  try {
    return (await fetch(`http://127.0.0.1:${hubPort}/health`)).ok;
  } catch {
    return false;
  }
}

/**
 * The stand-in for Claude Code's command-line tool, put where its installer puts it (`~/.local/bin`): signed in once
 * `~/.stand-in-signed-in` exists; `auth login` prints its sign-in page's address, then signs in after a moment; a run
 * (`-p`) answers like one, and edits nothing. A script with a shebang off Windows, a `.cmd` running it with Node on
 * Windows (a run then goes through a shell, as with a tool npm installed).
 */
function installStandIn() {
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const script = `const fs = require("node:fs");
const path = require("node:path");
const flag = path.join(require("node:os").homedir(), ".stand-in-signed-in");
const args = process.argv.slice(2);
if (args[0] === "--help") console.log("-p --output-format --verbose --include-partial-messages --permission-mode --allowedTools --add-dir --resume");
else if (args[0] === "auth" && args[1] === "status") console.log(JSON.stringify({ loggedIn: fs.existsSync(flag) }));
else if (args[0] === "auth" && args[1] === "login") {
  console.log("Opening your browser to sign in: https://claude.ai/oauth/authorize?stand-in=1");
  setTimeout(() => fs.writeFileSync(flag, "yes"), 2000);
} else if (args.includes("-p")) {
  let prompt = "";
  process.stdin.on("data", (d) => (prompt += d));
  process.stdin.on("end", () => {
    const say = (o) => console.log(JSON.stringify({ ...o, session_id: "11111111-2222-3333-4444-555555555555" }));
    say({ type: "system", subtype: "init" });
    say({ type: "assistant", message: { content: [{ type: "text", text: "Stand-in: done (nothing edited)." }] } });
    say({ type: "result", is_error: false, result: "Done." });
  });
}
`;
  if (WIN) {
    writeFileSync(join(bin, "claude.cjs"), script);
    writeFileSync(join(bin, "claude.cmd"), `@"${process.execPath}" "%~dp0claude.cjs" %*\r\n`);
  } else {
    writeFileSync(join(bin, "claude"), `#!/usr/bin/env node\n${script}`);
    spawnSync("chmod", ["755", join(bin, "claude")]);
  }
}

function uninstallStandIn() {
  rmSync(join(home, ".local"), { recursive: true, force: true });
  rmSync(join(home, ".stand-in-signed-in"), { force: true });
  rmSync(join(home, ".config"), { recursive: true, force: true });
  rmSync(join(home, "AppData"), { recursive: true, force: true });
}

/**
 * The flow every dev server goes through, from a page of the app: Pilot runs for it before any agent is installed,
 * a job waits, the stand-in installed and signed in from the page, the job runs.
 */
async function setupFlow(p, appUrl) {
  await until("Pilot runs for the page, before any agent is installed: the page hears why", () => p.agents()[0]?.setup?.state === "not-installed", 120_000);
  const changeSet = {
    id: "check-1",
    createdAt: new Date().toISOString(),
    page: { url: `${appUrl}/`, title: "App", viewport: { width: 1200, height: 800 } },
    edits: [{ target: { selector: "h1", path: "body > h1", tag: "h1", classes: [], text: "Hello" }, changes: [{ property: "padding-top", from: "0px", to: "8px" }] }],
  };
  const posted = await p.post("/jobs", { id: "check-1", changeSet });
  if (posted.status !== 202) throw new Error(`POST /jobs: ${posted.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  if (p.job("check-1")?.status !== "queued") throw new Error(`the job should wait, it's ${p.job("check-1")?.status}`);
  log("  ✓ a job sent meanwhile waits");
  installStandIn();
  await until("the agent installed, not signed in: Pilot can sign it in", () => p.agents()[0]?.setup?.state === "not-signed-in" && p.agents()[0]?.setup?.canSignIn);
  const asked = await p.post("/setup/sign-in", {});
  if (asked.status !== 202) throw new Error(`POST /setup/sign-in: ${asked.status}`);
  await until("signing in from the page: the sign-in page's address shown", () => p.agents()[0]?.setup?.url === "https://claude.ai/oauth/authorize?stand-in=1");
  await until("signed in: the agent is ready", () => p.agents().length === 1 && !p.agents()[0].setup);
  await until("the job that waited ran", () => p.job("check-1")?.status === "done" && /Stand-in: done/.test(p.job("check-1")?.notes ?? ""));
}

/** Installs the packed `usepilot` (and `deps`) into a new project, with npm, as a user's project would have it. */
function project(name, files, deps, tarball) {
  const dir = join(root, name);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), typeof text === "string" ? text : JSON.stringify(text, null, 2));
  }
  sh("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball, ...deps], dir);
  setUpHere(dir);
  return dir;
}

/**
 * Pilot set up for the project on this (stand-in) computer, as `init` leaves it: the dev server starts Pilot only
 * then (config.ts, isSetUp). In the home folder's settings, under the folder as given and as the dev server's own
 * `process.cwd()` reads it (macOS's temp folder is a link: /var → /private/var).
 */
function setUpHere(dir) {
  const file = WIN ? join(home, "AppData", "Roaming", "usepilot", "projects.json") : join(home, ".config", "usepilot", "projects.json");
  let projects = {};
  try {
    projects = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  for (const folder of new Set([resolve(dir), realpathSync(dir)])) projects[folder] = { ...projects[folder], setUp: true };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(projects, null, 2)}\n`);
}

async function check(name, fn) {
  log(`\n▸ ${name}`);
  const startAt = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, seconds: Math.round((Date.now() - startAt) / 1000) });
  } catch (error) {
    log(`  ✗ ${error.message}`);
    results.push({ name, ok: false, error: error.message });
  } finally {
    for (const child of [...children]) await stop(child);
    uninstallStandIn();
  }
}

// ── The checks ──────────────────────────────────────────────────────────────

log(`Packing usepilot from ${repo} (it builds the overlay and the CLI)…`);
const packs = join(root, "packs");
mkdirSync(packs);
sh("pnpm", ["--dir", join(repo, "packages", "usepilot"), "pack", "--pack-destination", packs], repo);
const tarball = join(packs, readdirSync(packs).find((f) => f.endsWith(".tgz")));
log(`  ${tarball}`);

if (only.includes("vite")) {
  await check("Vite: usepilot/vite starts Pilot with the dev server", async () => {
    const hubPort = await freePort();
    const appPort = await freePort();
    const dir = project(
      "vite-app",
      {
        "package.json": { name: "vite-app", private: true, type: "module" },
        "index.html": "<!doctype html><title>App</title><h1>Hello</h1>",
        "vite.config.mjs": 'import { pilot } from "usepilot/vite";\nexport default { plugins: [pilot()] };\n',
      },
      ["vite@8"],
      tarball,
    );
    const app = `http://localhost:${appPort}`;
    const p = page(hubPort, app, "vite-app");
    const vite = start("vite", dir, [join(dir, "node_modules", "vite", "bin", "vite.js"), "--port", String(appPort), "--strictPort"], devEnv(hubPort));
    await until("the app is served", async () => (await fetch(app)).ok, 60_000);
    await until("Pilot says it runs, in Vite's log", () => /\[pilot\] Pilot is on http:\/\/localhost/.test(vite.output));
    await setupFlow(p, app);
    p.close();
    await stop(vite);
    await until("the dev server stopped: Pilot stopped with it", async () => !(await hubUp(hubPort)));
  });
}

if (only.includes("next")) {
  await check("Next.js: withPilot starts Pilot with next dev, once", async () => {
    const hubPort = await freePort();
    const appPort = await freePort();
    const dir = project(
      "next-app",
      {
        "package.json": { name: "next-app", private: true },
        "next.config.mjs": 'import { withPilot } from "usepilot/next";\nexport default withPilot({});\n',
        "app/layout.js": "export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n",
        "app/page.js": "export default function Page() { return <h1>Hello</h1>; }\n",
      },
      ["next@16", "react@19", "react-dom@19"],
      tarball,
    );
    const app = `http://localhost:${appPort}`;
    const p = page(hubPort, app, "next-app");
    const next = start("next", dir, [join(dir, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(appPort)], devEnv(hubPort));
    await until("the app is served (first compile)", async () => (await fetch(app)).ok, 180_000);
    await setupFlow(p, app);
    // Next.js reads its config in more than one process: still one Pilot.
    await new Promise((r) => setTimeout(r, 3000));
    if (p.agents().length !== 1) throw new Error(`one Pilot per dev server: ${p.agents().length} registered`);
    log("  ✓ one Pilot, however many processes next dev has");
    p.close();
    await stop(next);
    await until("next dev stopped: Pilot stopped with it", async () => !(await hubUp(hubPort)));
  });

  await check("Next.js: next build never starts Pilot", async () => {
    const hubPort = await freePort();
    const dir = join(root, "next-app");
    const build = start("next build", dir, [join(dir, "node_modules", "next", "dist", "bin", "next"), "build"], devEnv(hubPort, { NODE_ENV: "production" }));
    const { code } = await build.exited;
    if (code !== 0) throw new Error(`next build failed (exit ${code})`);
    if (/\[pilot\]/.test(build.output)) throw new Error("Pilot printed during next build");
    if (await hubUp(hubPort)) throw new Error("a hub is up after next build");
    log("  ✓ built, and Pilot never started");
  });
}

if (only.includes("dev")) {
  await check("Any dev server: usepilot dev -- <command>", async () => {
    const hubPort = await freePort();
    const appPort = await freePort();
    // A dev server that serves the page, then ends by itself with exit code 7.
    const dir = project(
      "plain-app",
      {
        "package.json": { name: "plain-app", private: true },
        "server.js": `require("node:http").createServer((_q, r) => r.end("<h1>Hello</h1>")).listen(${appPort}, () => console.log("serving"));\nsetTimeout(() => process.exit(7), Number(process.env.SERVE_MS || 60000));\n`,
        "noop.js": "",
        // The dev command as a tool on PATH: a .cmd on Windows (it runs through a shell), a script elsewhere.
        ...(WIN ? { "bin/serve.cmd": `@"${process.execPath}" "%~dp0..\\server.js"\r\n` } : { "bin/serve": `#!/bin/sh\nexec node "$(dirname "$0")/../server.js"\n` }),
      },
      [],
      tarball,
    );
    if (!WIN) spawnSync("chmod", ["755", join(dir, "bin", "serve")]);
    const cli = join(dir, "node_modules", "usepilot", "cli", "index.js");
    const app = `http://localhost:${appPort}`;
    const p = page(hubPort, app, "plain-app");
    const dev = start("usepilot dev", dir, [cli, "dev", "--", "serve"], devEnv(hubPort, { PATH: join(dir, "bin") }));
    await until("the dev command runs (found on PATH, through a shell on Windows)", () => /serving/.test(dev.output));
    await setupFlow(p, app);
    p.close();
    await stop(dev);
    await until("stopped: Pilot stopped with it", async () => !(await hubUp(hubPort)));

    // The dev server's exit code passed on, and a command line of several commands, in quotes, through a shell.
    const several = start("usepilot dev", dir, [cli, "dev", "--", "node noop.js && node server.js"], { ...devEnv(hubPort), SERVE_MS: "3000" });
    const { code } = await several.exited;
    if (!/serving/.test(several.output)) throw new Error("the command line of several commands didn't run");
    if (code !== 7) throw new Error(`usepilot dev should exit with the dev server's code (7), it exited ${code}`);
    log("  ✓ a command line of several commands runs through a shell; the dev server's exit code is passed on");
    if (await hubUp(hubPort)) throw new Error("Pilot is still up after the dev server ended");
    log("  ✓ the dev server ended (no page ever opened): Pilot ended too");

    const production = start("usepilot dev", dir, [cli, "dev", "--", "node", "noop.js"], devEnv(hubPort, { NODE_ENV: "production" }));
    await production.exited;
    if (!/Pilot doesn't start: NODE_ENV is production/.test(production.output)) throw new Error("usepilot dev should refuse to start Pilot in production");
    log("  ✓ never in production");
  });
}

// ── Report ──────────────────────────────────────────────────────────────────

const lines = [`### Pilot with dev servers (${process.platform}, Node ${process.version})`, "", ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.ok ? ` (${r.seconds}s)` : `: ${r.error}`}`)];
log(`\n${lines.join("\n")}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
if (!keep) rmSync(root, { recursive: true, force: true });
else log(`\nKept: ${root}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
