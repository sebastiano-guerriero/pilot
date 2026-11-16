import type { ChangeSet, PageEvent } from "@pilot/protocol";
import { describe, expect, it } from "vitest";
import { AGENT_TTL, Hub } from "./hub.ts";

const changeSet = (id: string): ChangeSet => ({
  id,
  createdAt: "2026-11-16T10:00:00.000Z",
  page: { url: "http://localhost:5173/", title: "App", viewport: { width: 1200, height: 800 } },
  edits: [],
});
const a = { id: "a", label: "Claude Code · app" };
const b = { id: "b", label: "Claude Code · other" };
const APP = "http://localhost:5173";

function page(hub: Hub, origin = APP) {
  const events: PageEvent[] = [];
  const remove = hub.addPage({ origin, send: (e) => events.push(e) });
  return { events, remove, jobs: () => events.filter((e) => e.type === "job").map((e) => e.type === "job" && e.job.status) };
}

describe("Hub", () => {
  it("a waiting agent gets the next job from its page; it's then working, by that agent", async () => {
    let t = 0;
    const hub = new Hub(() => ++t);
    const p = page(hub);
    const waiting = hub.wait(a, APP, 10_000);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    const { job } = await waiting;
    expect(job?.id).toBe("j1");
    expect(job?.status).toBe("working");
    expect(job?.agent).toEqual(a);
    expect(p.jobs()).toEqual(["queued", "working"]);
  });

  it("jobs queue up: an agent that comes back takes the oldest", async () => {
    let t = 0;
    const hub = new Hub(() => ++t);
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    hub.postJob(APP, { id: "j2", changeSet: changeSet("j2") });
    expect((await hub.wait(a, APP, 10)).job?.id).toBe("j1");
    expect((await hub.wait(a, APP, 10)).job?.id).toBe("j2");
    expect((await hub.wait(a, APP, 10)).job).toBeNull();
  });

  it("routes by origin: an agent never gets another page's jobs; 127.0.0.1 is localhost", async () => {
    const hub = new Hub();
    hub.register(b, "http://localhost:3000");
    hub.postJob("http://127.0.0.1:5173", { id: "j1", changeSet: changeSet("j1") });
    expect((await hub.wait(b, "http://localhost:3000", 10)).job).toBeNull();
    expect((await hub.wait(a, "localhost:5173".replace(/^/, "http://"), 10)).job?.id).toBe("j1");
  });

  it("posting a job again changes nothing (pages post their unfinished jobs on every connect)", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 10);
    expect(hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") }).status).toBe("working");
  });

  it("after a takeover, a job the page knows as working stays with its agent if it's still here", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    expect(hub.postJob(APP, { id: "j1", changeSet: changeSet("j1"), status: "working", agent: a }).status).toBe("working");
    // Its agent is gone: queued again, for anyone.
    expect(hub.postJob(APP, { id: "j2", changeSet: changeSet("j2"), status: "working", agent: b }).status).toBe("queued");
  });

  it("done: the page hears it, with the notes", async () => {
    const hub = new Hub();
    const p = page(hub);
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 10);
    hub.done("a", "j1", "  used pt-6 (24px) for 22px ");
    const last = p.events.at(-1);
    expect(last?.type === "job" && [last.job.status, last.job.notes]).toEqual(["done", "used pt-6 (24px) for 22px"]);
  });

  it("retry: a done job comes back once, as a follow-up, preferably to the agent that did it", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 10);
    // Not done yet: no retry.
    const differences = [{ selector: ".btn", property: "padding-top", expected: "22px", outcome: "differs" as const, actual: "24px" }];
    expect(hub.retry(APP, "j1", differences)).toBeNull();
    hub.done("a", "j1");
    // Both agents wait; the follow-up goes to the one that did the job.
    const other = hub.wait(b, APP, 50);
    const same = hub.wait(a, APP, 50);
    expect(hub.retry(APP, "j1", differences)?.attempt).toBe(2);
    const { job } = await same;
    expect([job?.id, job?.attempt, job?.differences]).toEqual(["j1", 2, differences]);
    expect((await other).job).toBeNull();
    // Only once: after the follow-up, Pilot takes what the code gives.
    hub.done("a", "j1");
    expect(hub.retry(APP, "j1", differences)).toBeNull();
  });

  it("launch reaches the open pages of the agent's origin only", () => {
    const hub = new Hub();
    const p = page(hub);
    const other = page(hub, "http://localhost:3000");
    expect(hub.launch(a, APP)).toBe(1);
    expect(p.events.some((e) => e.type === "launch")).toBe(true);
    expect(other.events.some((e) => e.type === "launch")).toBe(false);
  });

  it("pages see which agents work on them and how many are waiting", async () => {
    const hub = new Hub();
    const p = page(hub);
    const waiting = hub.wait(a, APP, 20);
    expect(p.events.at(-1)).toEqual({ type: "agents", agents: [a], waiting: 1 });
    await waiting;
    expect(p.events.at(-1)).toEqual({ type: "agents", agents: [a], waiting: 0 });
    hub.unregister("a");
    expect(p.events.at(-1)).toEqual({ type: "agents", agents: [], waiting: 0 });
  });

  it("cancel takes back a job not done yet; an aborted wait ends", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    expect(hub.cancel(APP, "j1")?.status).toBe("cancelled");
    expect(hub.done("a", "j1")).toBeNull();
    const abort = new AbortController();
    const waiting = hub.wait(a, APP, 10_000, abort.signal);
    abort.abort();
    expect((await waiting).job).toBeNull();
  });

  it("agents not heard from for a while are dropped, unless waiting or in this process", () => {
    let t = 0;
    const hub = new Hub(() => t);
    hub.register(a, APP);
    hub.register(b, APP);
    t = AGENT_TTL + 1;
    hub.sweep(new Set(["a"]));
    expect(hub.hasAgents(APP)).toBe(true);
    hub.sweep();
    expect(hub.hasAgents(APP)).toBe(false);
  });
});
