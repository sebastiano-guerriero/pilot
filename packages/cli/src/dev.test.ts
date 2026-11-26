import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { devGuard, projectFolder, RUNNER_ENV, startWithDevServer } from "./dev.ts";

let nextPort = 51000 + Math.floor(Math.random() * 900);
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

/** A project folder (a package.json) with a subfolder, like Vite's `root` can be. */
function project() {
  const dir = mkdtempSync(join(tmpdir(), "pilot-dev-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app" }));
  mkdirSync(join(dir, "src"));
  return dir;
}

/** The runner's options for a test: its own port, no agent found (it waits), the app's address, its own config file. */
function runnerFor(dir: string) {
  return { port: nextPort++, url: "http://localhost:5173", detect: async () => [], setupPollMs: 50, configFile: join(dir, "c.json") };
}

describe("Pilot started with the dev server", () => {
  it("never in production or CI", () => {
    expect(devGuard({ NODE_ENV: "production" })).toMatch(/NODE_ENV is production/);
    expect(devGuard({ CI: "true" })).toBe("Pilot doesn't start in CI.");
    expect(devGuard({ CI: "false", NODE_ENV: "development" })).toBeNull();
    const lines: string[] = [];
    expect(startWithDevServer({ env: { NODE_ENV: "production" }, out: (l) => lines.push(l) })).toBeNull();
    expect(lines).toEqual(["Pilot doesn't start: NODE_ENV is production (Pilot only runs in development)."]);
  });

  it("runs the project's runner, waiting for its agent: never fails the dev server", async () => {
    const dir = project();
    const env: NodeJS.ProcessEnv = {};
    const lines: string[] = [];
    const dev = startWithDevServer({ cwd: join(dir, "src"), env, out: (l) => lines.push(l), runner: runnerFor(dir) });
    cleanup.push(() => dev?.close());
    const runner = await dev?.started;
    expect(runner?.agent).toBeNull();
    expect(lines[0]).toMatch(/^Pilot is on http:\/\/localhost:5173, every page\. Install your coding agent's command-line tool/);
    // Its child processes (Next.js's workers) see it's running.
    expect(env[RUNNER_ENV]).toBe(String(process.pid));
  });

  it("once per process, and again after the last one closed (a dev server restarting)", async () => {
    const dir = project();
    const env: NodeJS.ProcessEnv = {};
    const first = startWithDevServer({ cwd: dir, env, out: () => {}, runner: runnerFor(dir) });
    expect(startWithDevServer({ cwd: dir, env, out: () => {}, runner: runnerFor(dir) })).toBe(first);
    await first?.started;
    await first?.close();
    expect(env[RUNNER_ENV]).toBeUndefined();
    const second = startWithDevServer({ cwd: dir, env, out: () => {}, runner: runnerFor(dir) });
    cleanup.push(() => second?.close());
    expect(second).not.toBe(first);
    expect(await second?.started).not.toBeNull();
  });

  it("not in a child of a process that runs it", () => {
    // The parent: this test's own parent process, alive.
    expect(startWithDevServer({ env: { [RUNNER_ENV]: String(process.ppid) }, out: () => {} })).toBeNull();
  });

  it("closed before a page of the project opened (the dev server ended first): it stops waiting, quietly", async () => {
    const dir = project();
    const lines: string[] = [];
    const { url: _url, ...noUrl } = runnerFor(dir);
    const dev = startWithDevServer({ cwd: dir, env: {}, out: (l) => lines.push(l), runner: noUrl });
    for (let i = 0; i < 100 && !lines.some((l) => l.startsWith("Waiting for a page of app")); i++) await new Promise((r) => setTimeout(r, 20));
    expect(lines.some((l) => l.startsWith("Waiting for a page of app"))).toBe(true);
    await dev?.close();
    expect(await dev?.started).toBeNull();
    expect(lines.some((l) => l.includes("couldn't start"))).toBe(false);
  });

  it("what went wrong is said, not thrown", async () => {
    const dir = project();
    const lines: string[] = [];
    const dev = startWithDevServer({ cwd: dir, env: {}, out: (l) => lines.push(l), runner: { ...runnerFor(dir), url: "not an address" } });
    cleanup.push(() => dev?.close());
    expect(await dev?.started).toBeNull();
    expect(lines.at(-1)).toMatch(/isn't a page address/);
  });

  it("the project is the closest folder up with a package.json", () => {
    const dir = project();
    expect(projectFolder(join(dir, "src"))).toBe(dir);
  });
});
