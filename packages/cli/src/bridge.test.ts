import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangeSet, PageEvent } from "@pilot/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { Bridge } from "./agent.ts";
import { startHub, type HubServer } from "./server.ts";

const APP = "http://localhost:5173";
const changeSet = (id: string): ChangeSet => ({
  id,
  createdAt: new Date().toISOString(),
  page: { url: `${APP}/`, title: "App", viewport: { width: 1200, height: 800 } },
  edits: [
    {
      target: { selector: ".btn", path: "main > a.btn", tag: "a", classes: ["btn"], text: "Get started" },
      changes: [{ property: "padding-top", from: "10px", to: "22px" }],
    },
  ],
});

/** A free port for one test, shared by its hub and agents. */
let nextPort = 47000 + Math.floor(Math.random() * 2000);
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

/** The overlay's side: posts jobs and reads events, with the browser's Origin header. */
function fakePage(port: number, origin = APP) {
  const events: PageEvent[] = [];
  const abort = new AbortController();
  const ready = fetch(`http://127.0.0.1:${port}/events`, { headers: { origin }, signal: abort.signal }).then(async (res) => {
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end >= 0) {
          const chunk = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (data) events.push(JSON.parse(data.slice(6)));
          end = buffer.indexOf("\n\n");
        }
      }
    })();
    return res.status;
  });
  cleanup.push(() => abort.abort());
  const post = (path: string, body: object) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { events, ready, post };
}

const until = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe("the hub's HTTP server", () => {
  let hub: HubServer;
  const start = async () => {
    hub = await startHub(0);
    cleanup.push(() => hub.close());
    return hub;
  };

  it("takes jobs only from a page an agent works on", async () => {
    const { port, hub: state } = await start();
    const evil = fakePage(port, "https://evil.example");
    expect((await evil.post("/jobs", { id: "x", changeSet: changeSet("x") })).status).toBe(403);
    state.register({ id: "a", label: "A" }, APP);
    const app = fakePage(port);
    expect((await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") })).status).toBe(202);
    expect((await evil.post("/jobs", { id: "y", changeSet: changeSet("y") })).status).toBe(403);
  });

  it("refuses the agent routes to browsers (any request with an Origin)", async () => {
    const { port } = await start();
    const res = await fetch(`http://127.0.0.1:${port}/agents/wait`, {
      method: "POST",
      headers: { origin: APP, "content-type": "application/json" },
      body: JSON.stringify({ agent: { id: "x", label: "x" }, origin: APP }),
    });
    expect(res.status).toBe(403);
  });

  it("streams the page's events: agents on connect, then job updates", async () => {
    const { port, hub: state } = await start();
    const app = fakePage(port);
    expect(await app.ready).toBe(200);
    await until(() => app.events.length > 0);
    expect(app.events[0]).toEqual({ type: "agents", agents: [], waiting: 0 });
    state.register({ id: "a", label: "A" }, APP);
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    await until(() => app.events.some((e) => e.type === "job"));
  });
});

describe("the bridge between Pilot's processes and the page", () => {
  const agentOn = (port: number, folder?: string) => {
    const bridge = new Bridge({ id: `a${Math.random()}`, label: "Claude Code · app", ...(folder ? { folder } : {}) }, port);
    cleanup.push(() => bridge.close());
    return bridge;
  };

  it("the page asks for the project's components (the `@` list): read from the runner's folder, which pages never see", async () => {
    const project = await mkdtemp(join(tmpdir(), "pilot-app-"));
    cleanup.push(() => rm(project, { recursive: true, force: true }));
    await writeFile(join(project, "package.json"), "{}");
    await mkdir(join(project, "src"));
    await writeFile(join(project, "src/Pricing.tsx"), "export function PricingTable() {\n  return <table />;\n}\n");
    const port = nextPort++;
    await agentOn(port, project).launch(APP);
    const app = fakePage(port);
    await app.ready;
    const res = await app.post("/components", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ components: [{ name: "PricingTable", file: "src/Pricing.tsx", line: 1 }] });
    // Another site gets nothing.
    expect((await fakePage(port, "https://evil.example").post("/components", {})).status).toBe(403);
    // The tokens in its files too (tokenFiles.ts).
    await mkdir(join(project, "tokens"));
    await writeFile(join(project, "tokens/colors.json"), JSON.stringify({ brand: { $value: "#1cf69e" } }));
    const tokens = await (await app.post("/tokens", {})).json();
    expect(tokens).toEqual({ tokens: [{ name: "brand", value: "#1cf69e", file: "tokens/colors.json", line: 1 }] });
    // The folder stays in the hub: the page's events (agents, launch) never carry it.
    await until(() => app.events.some((e) => e.type === "agents" && e.agents.length > 0));
    expect(JSON.stringify(app.events)).not.toContain(project);
  });

  it("the page asks for the agent's skills (the `/` list): names and descriptions from its folders, which pages never see", async () => {
    const project = await mkdtemp(join(tmpdir(), "pilot-app-"));
    cleanup.push(() => rm(project, { recursive: true, force: true }));
    await writeFile(join(project, "package.json"), "{}");
    await mkdir(join(project, ".agents/skills/better-ui"), { recursive: true });
    await writeFile(join(project, ".agents/skills/better-ui/SKILL.md"), "---\nname: better-ui\ndescription: Polishes surfaces.\n---\n");
    // A Claude Code skill: not Cursor's, so not listed.
    await mkdir(join(project, ".claude/skills/only-claude"), { recursive: true });
    await writeFile(join(project, ".claude/skills/only-claude/SKILL.md"), "---\nname: only-claude\n---\n");
    const port = nextPort++;
    const bridge = new Bridge({ id: `a${Math.random()}`, label: "Cursor · app", folder: project, kind: "cursor" }, port);
    cleanup.push(() => bridge.close());
    await bridge.launch(APP);
    const app = fakePage(port);
    await app.ready;
    // The user's own (this machine's home folder) may be listed too.
    const { skills } = (await (await app.post("/skills", {})).json()) as { skills: Array<{ name: string }> };
    expect(skills).toContainEqual({ name: "better-ui", description: "Polishes surfaces." });
    expect(skills.map((s) => s.name)).not.toContain("only-claude");
    expect((await fakePage(port, "https://evil.example").post("/skills", {})).status).toBe(403);
    await until(() => app.events.some((e) => e.type === "agents" && e.agents.length > 0));
    expect(JSON.stringify(app.events)).not.toContain(project);
    expect(JSON.stringify(app.events)).not.toContain('"kind"');
  });

  it("launch opens Pilot in the pages already open, and closing it closes the site's other tabs", async () => {
    const port = nextPort++;
    const runner = agentOn(port);
    await runner.launch(APP);
    const app = fakePage(port);
    const other = fakePage(port);
    await app.ready;
    await other.ready;
    await runner.launch(APP);
    await until(() => app.events.some((e) => e.type === "launch"));
    await app.post("/quit", {});
    await until(() => other.events.some((e) => e.type === "quit"));
  });

  it("two share one hub; when the hub's process ends, the other takes over, and the page's job reaches it", async () => {
    const port = nextPort++;
    const first = agentOn(port);
    const second = agentOn(port);
    await first.launch(APP);
    await second.launch(APP);
    expect(first.isHub).toBe(true);
    expect(second.isHub).toBe(false);
    const waiting = second.wait(APP, 5000);
    await new Promise((r) => setTimeout(r, 100));
    await first.close(); // the hub's process ended
    await until(() => second.isHub, 3000);
    // The page reconnects to the new hub and posts its job (again).
    const app = fakePage(port);
    await app.ready;
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    expect((await waiting).job?.id).toBe("j1");
  });

  it("a job done carries the agent's session and a run's error", async () => {
    const port = nextPort++;
    const runner = agentOn(port);
    await runner.launch(APP);
    const app = fakePage(port);
    await app.ready;
    await app.post("/jobs", { id: "j1", changeSet: changeSet("j1") });
    expect((await runner.wait(APP, 2000)).job?.id).toBe("j1");
    await runner.done("j1", "Done.", undefined, undefined, { session: { agent: "claude", id: "aaaaaaaa-1111-2222-3333-444444444444" } });
    expect((await runner.job("j1"))?.session?.id).toBe("aaaaaaaa-1111-2222-3333-444444444444");
    await app.post("/jobs", { id: "j2", changeSet: changeSet("j2") });
    await runner.wait(APP, 2000);
    await runner.done("j2", undefined, undefined, undefined, { error: { title: "Codex isn't signed in", detail: "Run codex login." } });
    expect((await runner.job("j2"))?.error?.title).toBe("Codex isn't signed in");
  });
});

describe("Bridge", () => {
  it("names a port taken by something else", async () => {
    const port = nextPort++;
    const { createServer } = await import("node:http");
    const other = createServer((_, res) => res.end("hello"));
    await new Promise<void>((r) => other.listen(port, "127.0.0.1", () => r()));
    cleanup.push(() => new Promise<void>((r) => other.close(() => r())));
    const bridge = new Bridge({ id: "a", label: "A" }, port);
    await expect(bridge.launch(APP)).rejects.toThrow(/PILOT_PORT/);
  });
});
