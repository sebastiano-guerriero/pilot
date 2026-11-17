// @vitest-environment happy-dom
import type { Job, PageEvent } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditHistory } from "../edits/history.ts";
import { inlinePreview } from "../test/inlinePreview.ts";
import { PilotSession } from "./session.ts";

// The width checks load the page in frames: the test DOM has no layout, so they're stubbed.
const widths = vi.hoisted(() => ({
  snapshots: 0,
  checks: [] as Array<{ problems: number }>,
}));
vi.mock("../checks/widths.ts", async (actual) => {
  const real = await actual<typeof import("../checks/widths.ts")>();
  return {
    ...real,
    snapshotAt: async () => {
      widths.snapshots++;
      return { width: 1024, elements: [] };
    },
    checkWidths: async (_url: string, selector: string, ws: number[], designerWidth: number) => {
      const problems = widths.checks.shift()?.problems ?? 0;
      return {
        selector,
        designerWidth,
        widths: ws.map((width) => ({ width, found: true, issues: problems && width === 375 ? ["`div` sticks out of the viewport by 40px."] : [], notes: [] })),
        problems,
      };
    },
  };
});

/** A stand-in for the browser's EventSource: the test plays the hub. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly OPEN = 1;
  readyState = 1;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  emit(event: PageEvent) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  close() {
    this.readyState = 2;
  }
}

let el: HTMLElement;
let sheet: HTMLStyleElement;
let history: EditHistory;
let posts: Array<{ url: string; body: Record<string, unknown> }>;
let launched: number;
const agent = { id: "a", label: "Claude Code · app" };

function session() {
  const s = new PilotSession(history, { bridge: "http://hub", onLaunch: () => launched++ });
  (s.bridge as unknown as { EventSourceImpl: unknown }).EventSourceImpl = FakeEventSource;
  s.start();
  return s;
}
const hub = () => FakeEventSource.last as FakeEventSource;
const job = (patch: Partial<Job> & { id: string }): Job => ({
  origin: "http://localhost:3000",
  changeSet: { id: patch.id, createdAt: "", page: { url: "", title: "", viewport: { width: 0, height: 0 } }, edits: [] },
  status: "queued",
  createdAt: "",
  updatedAt: "",
  ...patch,
});

beforeEach(() => {
  sessionStorage.clear();
  sheet = document.createElement("style");
  sheet.textContent = ".card { padding-top: 10px; }";
  document.head.append(sheet);
  el = document.createElement("div");
  el.className = "card";
  document.body.append(el);
  history = new EditHistory(inlinePreview());
  posts = [];
  launched = 0;
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    posts.push({ url, body: JSON.parse(init.body) });
    return { ok: true } as Response;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  el.remove();
  sheet.remove();
});

describe("PilotSession", () => {
  it("Send is offered only once an agent works on this page", () => {
    const s = session();
    history.apply(el, "padding-top", "20px");
    expect(s.canSendToAgent).toBe(false);
    expect(s.send()).toBeNull();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    expect(s.canSendToAgent).toBe(true);
    expect(s.unsent).toBe(1);
  });

  it("a page opened after /pilot finds the agent: Pilot opens by itself, once", () => {
    let arrived = 0;
    const s = new PilotSession(history, { bridge: "http://hub", onLaunch: () => {}, onAgentsArrived: () => arrived++ });
    (s.bridge as unknown as { EventSourceImpl: unknown }).EventSourceImpl = FakeEventSource;
    s.start();
    hub().emit({ type: "agents", agents: [], waiting: 0 });
    expect(arrived).toBe(0);
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    expect(arrived).toBe(1);
    // The agent starting and ending waits doesn't count as arriving again.
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    expect(arrived).toBe(1);
  });

  it("/pilot in the agent launches Pilot", () => {
    session();
    hub().emit({ type: "launch", agent });
    expect(launched).toBe(1);
  });

  it("Send posts the unsent changes as a job; they stay on the page and aren't sent again", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send();
    expect(sent?.status).toBe("queued");
    expect(posts.at(-1)?.url).toBe("http://hub/jobs");
    const posted = posts.at(-1)?.body as { id: string; changeSet: { edits: Array<{ changes: unknown[] }> } };
    expect(posted.id).toBe(sent?.id);
    expect(posted.changeSet.edits[0]?.changes).toEqual([expect.objectContaining({ property: "padding-top", to: "20px" })]);
    expect(s.unsent).toBe(0);
    expect(el.style.paddingTop).toBe("20px");
  });

  it("Make responsive: a job of its own for the element, apart from the changes, with a baseline at the designer's width", async () => {
    vi.useFakeTimers();
    widths.snapshots = 0;
    const s = session();
    expect(s.request(el, "responsive")).toBeNull(); // no agent yet
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.request(el, "responsive") as { id: string };
    const posted = posts.at(-1)?.body as { id: string; changeSet: { edits: unknown[]; request: { kind: string; target: { selector: string } } } };
    expect(posted.id).toBe(sent.id);
    expect(posted.changeSet.edits).toEqual([]);
    expect(posted.changeSet.request).toEqual(expect.objectContaining({ kind: "responsive", breakpoints: expect.any(Array) }));
    expect(posted.changeSet.request.target.selector).toBeTruthy();
    // The designer's change isn't part of it: still waiting for Send.
    expect(s.unsent).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(widths.snapshots).toBe(1);
    expect(s.jobs[0]?.baseline).toEqual({ width: 1024, elements: [] });
  });

  it("the agent asks for a width check: the page that has the job answers it", async () => {
    widths.checks = [{ problems: 0 }];
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const sent = s.request(el, "responsive") as { id: string };
    hub().emit({ type: "check", requestId: "r1", jobId: sent.id });
    hub().emit({ type: "check", requestId: "r2", jobId: "another-tabs-job" });
    await vi.waitFor(() => expect(posts.some((p) => p.url === "http://hub/checks/r1")).toBe(true));
    const answer = posts.find((p) => p.url === "http://hub/checks/r1")?.body as { check: { problems: number; widths: unknown[] } };
    expect(answer.check.problems).toBe(0);
    expect(answer.check.widths.length).toBeGreaterThan(1);
    expect(posts.some((p) => p.url === "http://hub/checks/r2")).toBe(false);
  });

  it("a task done: Pilot checks the widths; problems go back once as a follow-up, then Pilot takes what the code gives", async () => {
    vi.useFakeTimers();
    widths.checks = [{ problems: 1 }, { problems: 1 }];
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const sent = s.request(el, "responsive") as { id: string };
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, notes: "Stacks below 768px" }) });
    await vi.advanceTimersByTimeAsync(1_000);
    const retry = posts.find((p) => p.url.endsWith(`/jobs/${sent.id}/retry`))?.body as { issues: string[] };
    expect(retry.issues).toEqual(["375px: `div` sticks out of the viewport by 40px."]);
    expect(s.jobs[0]).toEqual(expect.objectContaining({ status: "queued", attempt: 2 }));
    // The follow-up done: still a problem, but Pilot takes what the code gives now.
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, attempt: 2 }) });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(s.jobs[0]).toEqual(expect.objectContaining({ status: "done", checked: true }));
    expect(posts.filter((p) => p.url.endsWith("/retry")).length).toBe(1);
  });

  it("the agent's done: the page checks the job, settles what landed, reports how it came out", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    hub().emit({ type: "job", job: job({ id: sent.id, status: "working", agent }) });
    expect(s.jobs[0]?.status).toBe("working");
    sheet.textContent = ".card { padding-top: 20px; }"; // the agent's edit arrived
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, notes: "pt-5" }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(history.changes()).toEqual([]);
    expect(s.jobs[0]).toEqual(expect.objectContaining({ status: "done", notes: "pt-5", checked: true }));
    // Nothing to follow up on.
    expect(posts.some((p) => p.url.endsWith("/retry"))).toBe(false);
    // All landed: it leaves the list after a moment.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.jobs).toEqual([]);
  });

  it("a change that didn't land goes back to the agent once; after the follow-up, Pilot takes what the code gives", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    // The agent says done, but the page still gives 10px.
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent }) });
    await vi.advanceTimersByTimeAsync(16_000);
    const retry = posts.find((p) => p.url === `http://hub/jobs/${sent.id}/retry`);
    expect(retry?.body.differences).toEqual([expect.objectContaining({ property: "padding-top", expected: "20px", actual: "10px" })]);
    expect(s.jobs[0]).toEqual(expect.objectContaining({ status: "queued", attempt: 2 }));
    // Still previewed while the agent fixes it.
    expect(el.style.paddingTop).toBe("20px");
    // The follow-up: the agent kept 12px on purpose. Pilot accepts it.
    hub().emit({ type: "job", job: job({ id: sent.id, status: "working", agent, attempt: 2 }) });
    sheet.textContent = ".card { padding-top: 12px; }";
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, attempt: 2, notes: "kept the 12px step" }) });
    await vi.advanceTimersByTimeAsync(16_000);
    expect(history.changes()).toEqual([]);
    expect(el.style.paddingTop).toBe("");
    expect(s.jobs[0]).toEqual(expect.objectContaining({ checked: true, notes: "kept the 12px step" }));
    expect(posts.filter((p) => p.url.endsWith("/retry")).length).toBe(1);
  });

  it("a stale update from before the follow-up is ignored", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent }) });
    await vi.advanceTimersByTimeAsync(16_000);
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent }) }); // attempt 1 again
    expect(s.jobs[0]?.status).toBe("queued");
  });

  it("cancel takes a job back: its changes are unsent again", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    s.cancel(sent.id);
    expect(posts.at(-1)?.url).toBe(`http://hub/jobs/${sent.id}/cancel`);
    expect(s.jobs).toEqual([]);
    expect(s.unsent).toBe(1);
  });

  it("jobs survive a reload, and the unfinished ones are posted again on connect", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    s.destroy();
    posts = [];
    const after = session();
    expect(after.jobs.map((j) => j.id)).toEqual([sent.id]);
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    expect(posts.map((p) => [p.url, p.body.id])).toEqual([["http://hub/jobs", sent.id]]);
  });

  it("a job already applied before the reload doesn't come back", () => {
    sessionStorage.setItem("pilot:jobs", JSON.stringify([{ ...job({ id: "old", status: "done" }), checked: true }]));
    expect(session().jobs).toEqual([]);
  });

  it("ignores another tab's jobs on the same page", () => {
    const s = session();
    hub().emit({ type: "job", job: job({ id: "other-tab", status: "done" }) });
    expect(s.jobs).toEqual([]);
  });
});
