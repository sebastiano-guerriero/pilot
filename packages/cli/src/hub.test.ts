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
  it("an agent not ready yet: pages see its setup, checked, and hear when it changes (signed in: gone)", () => {
    const hub = new Hub();
    const p = page(hub);
    const agentsSeen = () => p.events.filter((e): e is Extract<PageEvent, { type: "agents" }> => e.type === "agents").map((e) => e.agents);
    const setup = { state: "not-signed-in" as const, agent: "Claude Code", command: "claude auth login", canSignIn: true };
    hub.register({ ...a, folder: "/app", kind: "claude", setup }, APP);
    expect(agentsSeen().at(-1)).toEqual([{ ...a, setup }]);
    // The same again (a heartbeat): nothing new to tell.
    const before = p.events.length;
    hub.register({ ...a, setup }, APP);
    expect(p.events.length).toBe(before);
    // A setup that isn't one (from another process: never trusted as is) is dropped; a url only when https.
    hub.register({ ...a, setup: { state: "weird", command: "x" } as never }, APP);
    expect(agentsSeen().at(-1)).toEqual([a]);
    hub.register({ ...a, setup: { ...setup, state: "signing-in", url: "javascript:alert(1)" } }, APP);
    expect(agentsSeen().at(-1)?.[0]?.setup?.url).toBeUndefined();
    hub.register({ ...a, setup: { ...setup, state: "signing-in", url: "https://claude.ai/oauth?x=1" } }, APP);
    expect(agentsSeen().at(-1)?.[0]?.setup?.url).toBe("https://claude.ai/oauth?x=1");
    // Ready: no setup.
    hub.register(a, APP);
    expect(agentsSeen().at(-1)).toEqual([a]);
  });

  it("signing in from the page: only an agent that can, taken once by its runner", () => {
    const hub = new Hub();
    const setup = { state: "not-signed-in" as const, agent: "Claude Code", command: "claude auth login", canSignIn: true };
    expect(hub.requestSignIn(APP)).toBe(0);
    hub.register({ ...a, setup: { ...setup, canSignIn: false } }, APP);
    expect(hub.requestSignIn(APP)).toBe(0);
    hub.register({ ...a, setup }, APP);
    // Another site's page can't ask for this one.
    expect(hub.requestSignIn("http://localhost:3000")).toBe(0);
    expect(hub.requestSignIn(APP)).toBe(1);
    // Kept through a heartbeat, then taken once.
    hub.register({ ...a, setup }, APP);
    expect(hub.takeSignIn("a")).toBe(true);
    expect(hub.takeSignIn("a")).toBe(false);
    // Asked, then the agent got ready another way: nothing left to take.
    hub.requestSignIn(APP);
    hub.register(a, APP);
    expect(hub.takeSignIn("a")).toBe(false);
  });

  it("a /props job's answer keeps its props for the page; other jobs' are dropped", async () => {
    const hub = new Hub();
    const props = [{ name: "tone", type: "options" as const, options: ["light", "dark"] }];
    const request = { kind: "props" as const, target: { selector: "a", path: "a", tag: "a", classes: [] }, breakpoints: [], component: "Card", current: {} };
    hub.postJob(APP, { id: "p", changeSet: { ...changeSet("p"), request } });
    hub.postJob(APP, { id: "e", changeSet: changeSet("e") });
    await hub.wait(a, APP, 100);
    await hub.wait(a, APP, 100);
    expect(hub.done("a", "p", "Card has 1 prop.", undefined, props)?.props).toEqual(props);
    expect(hub.done("a", "e", "Done.", undefined, props)?.props).toBeUndefined();
  });

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

  it("stamps when an agent takes a job and reports it done, to see where its time goes", async () => {
    let t = 1_000;
    const hub = new Hub(() => (t += 1_000));
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    const { job } = await hub.wait(a, APP, 10);
    expect(job?.takenAt).toBeDefined();
    const done = hub.done(a.id, "j1", "ok");
    expect(Date.parse(done?.doneAt as string)).toBeGreaterThan(Date.parse(job?.takenAt as string));
  });

  it("the agent at work: its job's last activity, for the page to tell a quiet run; only its own running job's", async () => {
    let t = 1_000;
    const hub = new Hub(() => (t += 1_000));
    const p = page(hub);
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    const { job } = await hub.wait(a, APP, 10);
    expect(job?.activeAt).toBeUndefined();
    hub.activity("a", "j1");
    const first = hub.job("j1")?.activeAt;
    expect(first).toBeDefined();
    const last = p.events.filter((e) => e.type === "job").at(-1);
    expect(last?.type === "job" && last.job.activeAt).toBe(first);
    // Another agent's word changes nothing; nor does a job done.
    hub.activity("b", "j1");
    expect(hub.job("j1")?.activeAt).toBe(first);
    hub.done("a", "j1", "ok");
    hub.activity("a", "j1");
    expect(hub.job("j1")?.activeAt).toBe(first);
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

  it("the agent's named conditions are kept on the job; a follow-up for unnamed ones carries them", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 10);
    const conditions = [{ element: 1, words: "the card is hovered", label: "group-hover", selector: ".card:hover &" }];
    expect(hub.done("a", "j1", "Done.", undefined, undefined, { conditions })?.conditions).toEqual(conditions);
    const unnamed = [{ element: 1, words: "on sale" }];
    expect(hub.retry(APP, "j1", [], undefined, unnamed)?.unnamed).toEqual(unnamed);
  });

  it("a question: the job is done with it; the designer's answer sends it back once, preferably to the agent that asked", async () => {
    const hub = new Hub();
    const p = page(hub);
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 10);
    // No question, nothing to answer.
    expect(hub.answer(APP, "j1", "All of them")).toBeNull();
    const question = { text: "Every card, or only this one?", choices: ["All of them", "Only this one"] };
    hub.done("a", "j1", "Did the padding", question);
    const last = p.events.at(-1);
    expect(last?.type === "job" && [last.job.status, last.job.question]).toEqual(["done", question]);
    // Another page's origin can't answer it.
    expect(hub.answer("http://localhost:3000", "j1", "All of them")).toBeNull();
    const other = hub.wait(b, APP, 50);
    const same = hub.wait(a, APP, 50);
    expect(hub.answer(APP, "j1", "All of them")?.status).toBe("working");
    const { job } = await same;
    expect([job?.id, job?.answer, job?.question?.text, job?.attempt]).toEqual(["j1", "All of them", question.text, 1]);
    expect((await other).job).toBeNull();
    // Once: answered, a new question is dropped, and it can't be answered again.
    hub.done("a", "j1", "", { text: "And the footer?" });
    expect(hub.job("j1")?.question?.text).toBe(question.text);
    expect(hub.answer(APP, "j1", "Yes")).toBeNull();
  });

  it("an agent that leaves mid-job: its job goes back to the queue, and to another chat waiting", async () => {
    const hub = new Hub();
    const p = page(hub);
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 10);
    expect(hub.job("j1")?.status).toBe("working");
    const other = hub.wait(b, APP, 50);
    hub.unregister("a");
    expect((await other).job?.id).toBe("j1");
    expect(p.events.some((e) => e.type === "job" && e.job.id === "j1" && e.job.status === "queued")).toBe(true);
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

  it("a width check: the job's pages get a check event, the page's answer goes to the agent", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    const p = page(hub);
    const other = page(hub, "http://localhost:3000");
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    const asked = hub.check("j1", 5_000);
    const event = p.events.find((e) => e.type === "check");
    expect(event).toEqual(expect.objectContaining({ type: "check", jobId: "j1" }));
    expect(other.events.some((e) => e.type === "check")).toBe(false);
    const requestId = (event as { requestId: string }).requestId;
    const check = { selector: ".card", designerWidth: 1200, widths: [], problems: 0 };
    // Another origin can't answer it.
    expect(hub.checkResult("http://localhost:3000", requestId, check)).toBe(false);
    expect(hub.checkResult(APP, requestId, check)).toBe(true);
    expect(await asked).toEqual(check);
    // Answered once.
    expect(hub.checkResult(APP, requestId, check)).toBe(false);
  });

  it("a width check with no page open, or for an unknown job, is null at once", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    expect(await hub.check("j1", 5_000)).toBeNull();
    page(hub);
    expect(await hub.check("nope", 5_000)).toBeNull();
  });

  it("a task's follow-up carries the width check's problems", async () => {
    const hub = new Hub();
    hub.register(a, APP);
    hub.postJob(APP, { id: "j1", changeSet: changeSet("j1") });
    await hub.wait(a, APP, 1_000);
    hub.done("a", "j1");
    const job = hub.retry(APP, "j1", [], ["375px: `div` sticks out of the viewport by 40px."]);
    expect(job).toEqual(expect.objectContaining({ status: "queued", attempt: 2, issues: ["375px: `div` sticks out of the viewport by 40px."] }));
  });
});
