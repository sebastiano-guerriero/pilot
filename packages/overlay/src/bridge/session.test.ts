// @vitest-environment happy-dom
import { BRIDGE_VERSION, type Job, type PageEvent } from "@pilot/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uniqueSelector } from "../dom/target.ts";
import { EditHistory } from "../edits/history.ts";
import { inlinePreview } from "../test/inlinePreview.ts";
import { DEFAULT_BRIDGE_URL, olderHub } from "./client.ts";
import { PilotSession, timings } from "./session.ts";

// The instance's props, as the framework would give them (componentProps reads React's or Vue's internals).
const instance = vi.hoisted(() => ({ props: null as Record<string, string | number | boolean> | null }));
vi.mock("../dom/component.ts", async (actual) => {
  const real = await actual<typeof import("../dom/component.ts")>();
  return { ...real, componentProps: () => (instance.props ? { component: "ProductCard", props: instance.props, usedIn: "src/App.jsx" } : null) };
});

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

  it("a job on an element: jobOn and busy find it until it's finished", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    expect(s.jobOn(el)).toBeNull();
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    expect(s.jobOn(el)?.id).toBe(sent.id);
    expect(s.busy).toEqual([{ element: el, job: expect.objectContaining({ id: sent.id }) }]);
    // Another kind of job can't go to it meanwhile.
    expect(s.request(el, "responsive")).toBeNull();
    sheet.textContent = ".card { padding-top: 20px; }";
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.jobOn(el)).toBeNull();
    expect(s.busy).toEqual([]);
  });

  it("changes sent for an element a job is on wait, and go as a job of their own once it's finished", async () => {
    vi.useFakeTimers();
    const other = document.createElement("p");
    other.className = "other";
    document.body.append(other);
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const first = s.send() as { id: string };
    // The designer goes on: the same element, and another one.
    history.apply(el, "margin-top", "8px");
    history.apply(other, "color", "red");
    const second = s.send() as { id: string };
    const posted = posts.at(-1)?.body as { id: string; changeSet: { edits: Array<{ changes: Array<{ property: string }> }> } };
    expect(posted.id).toBe(second.id);
    expect(posted.changeSet.edits.flatMap((e) => e.changes.map((c) => c.property))).toEqual(["color"]);
    expect(s.heldCount).toBe(1);
    expect(s.unsent).toBe(1);
    // Edits made after Send on a free element aren't swept along when the held ones go.
    const later = document.createElement("span");
    later.className = "later";
    document.body.append(later);
    history.apply(later, "color", "blue");
    // The first job finishes: margin-top goes, alone.
    sheet.textContent = ".card { padding-top: 20px; }";
    hub().emit({ type: "job", job: job({ id: first.id, status: "done", agent }) });
    await vi.advanceTimersByTimeAsync(0);
    const released = posts.at(-1)?.body as { id: string; changeSet: { edits: Array<{ changes: Array<{ property: string }> }> } };
    expect(released.id).not.toBe(second.id);
    expect(released.changeSet.edits.flatMap((e) => e.changes.map((c) => c.property))).toEqual(["margin-top"]);
    expect(s.heldCount).toBe(0);
    expect(s.unsent).toBe(1); // the later one, for the next Send
    other.remove();
    later.remove();
  });

  it("held changes survive a reload; a cancelled job leaves them for the next Send, with its own", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const first = s.send() as { id: string };
    history.apply(el, "margin-top", "8px");
    expect(s.send()).toBeNull();
    expect(s.heldCount).toBe(1);
    s.destroy();
    const reloaded = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    expect(reloaded.heldCount).toBe(1);
    const before = posts.length;
    reloaded.cancel(first.id);
    // Nothing goes by itself: the job's own changes are unsent again, with the held one.
    expect(posts.slice(before).filter((p) => p.url === "http://hub/jobs")).toHaveLength(0);
    expect(reloaded.heldCount).toBe(0);
    expect(reloaded.unsent).toBe(2);
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

  it("Make responsive again on an element whose task isn't finished: nothing new is sent", async () => {
    vi.useFakeTimers();
    widths.checks = [{ problems: 0 }];
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const twin = el.cloneNode() as HTMLElement; // looks the same: its own task
    document.body.append(twin);
    const first = s.request(el, "responsive") as { id: string };
    const jobs = () => posts.filter((p) => p.url === "http://hub/jobs").length;
    expect(s.openTask(el, "responsive")?.id).toBe(first.id);
    expect(s.request(el, "responsive")).toBeNull();
    expect(jobs()).toBe(1);
    expect(s.request(twin, "responsive")).not.toBeNull();
    expect(jobs()).toBe(2);
    // Still open while the agent works and while Pilot checks it…
    hub().emit({ type: "job", job: job({ id: first.id, status: "working", agent }) });
    expect(s.openTask(el, "responsive")).not.toBeNull();
    hub().emit({ type: "job", job: job({ id: first.id, status: "done", agent }) });
    expect(s.openTask(el, "responsive")).not.toBeNull();
    // …finished once checked: another pass is fine.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(s.openTask(el, "responsive")).toBeNull();
    expect(s.request(el, "responsive")).not.toBeNull();
    twin.remove();
  });

  it("after a reload, an open task is found again by its element's selector", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    s.request(el, "responsive");
    s.destroy();
    const reloaded = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    expect(reloaded.openTask(el, "responsive")).not.toBeNull();
    expect(reloaded.request(el, "responsive")).toBeNull();
  });

  it("a comment goes to the agent at once, with its thread; the agent's notes come back as its reply", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const { thread, job: sent } = s.comment(el, "  Make it the brand green ");
    expect(sent).not.toBeNull();
    expect(s.threadFor(el)?.id).toBe(thread.id);
    const posted = posts.at(-1)?.body as { changeSet: { request: { kind: string; thread: Array<{ text: string }> } } };
    expect(posted.changeSet.request.kind).toBe("comment");
    expect(posted.changeSet.request.thread.map((m) => m.text)).toEqual(["Make it the brand green"]);
    expect(s.threadJob(thread)?.status).toBe("queued");
    expect(s.attention).toEqual([]); // with the agent
    hub().emit({ type: "job", job: job({ id: (sent as { id: string }).id, status: "done", agent, notes: "Done: text-brand." }) });
    await vi.advanceTimersByTimeAsync(0);
    // The agent spoke last: the designer's turn.
    expect(s.attention.map((t) => t.id)).toEqual([thread.id]);
    const replied = s.threadFor(el);
    expect(replied?.messages.map((m) => [m.from, m.text])).toEqual([
      ["designer", "Make it the brand green"],
      ["agent", "Done: text-brand."],
    ]);
    // The reply goes in the next comment's thread; replying takes it off the designer's list.
    s.comment(el, "A bit lighter");
    expect(s.attention).toEqual([]);
    const next = posts.at(-1)?.body as { changeSet: { request: { thread: Array<{ from: string; text: string }> } } };
    expect(next.changeSet.request.thread.map((m) => m.from)).toEqual(["designer", "agent", "designer"]);
    // Resolved: the thread goes.
    s.resolve(thread.id);
    expect(s.threadFor(el)).toBeNull();
  });

  it("a comment takes its element's unsent edits along when asked: one job, the edits checked like Send's, the reply in the thread", async () => {
    vi.useFakeTimers();
    const other = document.createElement("p");
    other.className = "other";
    document.body.append(other);
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    history.apply(other, "color", "red"); // another element's: stays for Send
    const { thread, job: sent } = s.comment(el, "Like this, on mobile too", [], undefined, [], [], true);
    const posted = posts.at(-1)?.body as { changeSet: { edits: Array<{ changes: Array<{ property: string }> }>; request: { kind: string } } };
    expect(posted.changeSet.request.kind).toBe("comment");
    expect(posted.changeSet.edits.flatMap((e) => e.changes.map((c) => c.property))).toEqual(["padding-top"]);
    expect(s.unsent).toBe(1);
    expect(s.threadFor(el)?.messages[0]?.edits).toEqual({ styles: 1, texts: 0 });
    // Done, and the edit is in the page's CSS: it settles, and the notes are the reply.
    sheet.textContent = ".card { padding-top: 20px; }";
    hub().emit({ type: "job", job: job({ id: (sent as { id: string }).id, status: "done", agent, notes: "Done, and on mobile." }) });
    await vi.advanceTimersByTimeAsync(3000);
    expect(history.changes({ job: (sent as { id: string }).id })).toEqual([]);
    expect(s.threadFor(el)?.messages.map((m) => m.text)).toEqual(["Like this, on mobile too", "Done, and on mobile."]);
    s.resolve(thread.id);
  });

  it("without the chip (or with an action), a comment leaves the edits for Send", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const { thread } = s.comment(el, "Calmer", [], undefined, [], [], false);
    expect((posts.at(-1)?.body as { changeSet: { edits: unknown[] } }).changeSet.edits).toEqual([]);
    expect(s.unsent).toBe(1);
    s.resolve(thread.id);
  });

  it("after a reload, a thread finds its element even when its classes changed (a variant picked), and keeps its new selector", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const { thread } = s.comment(el, "Calmer");
    el.className = "card--dark";
    // A new page load: the session from what the tab saved.
    const reloaded = session();
    expect(reloaded.threadFor(el)?.id).toBe(thread.id);
    expect(reloaded.threads.find((t) => t.id === thread.id)?.target.selector).toBe(uniqueSelector(el));
  });

  it("a thread whose selector now finds another element first (classes swapped between two) finds its own, by its text", () => {
    const other = document.createElement("div");
    other.className = "other";
    other.textContent = "Two";
    el.textContent = "One";
    document.body.prepend(other);
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const { thread } = s.comment(el, "Calmer");
    [el.className, other.className] = ["other", "card"];
    const reloaded = session();
    expect(reloaded.threadElement(reloaded.threads.find((t) => t.id === thread.id) as never)).toBe(el);
    other.remove();
  });

  it("stopped, a thread's job leaves a note where the reply would be: not a reply to read, and the agent reads it as not done", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const { thread, job: sent } = s.comment(el, "Calmer");
    s.cancel((sent as { id: string }).id);
    const stopped = s.threadFor(el);
    expect(stopped?.messages.at(-1)).toMatchObject({ from: "agent", text: "Stopped. Write again to pick it up.", stopped: true });
    expect(s.attention).toEqual([]);
    // Written again: the thread so far tells the agent the stopped one may not be done.
    s.comment(el, "Calmer, please");
    const posted = posts.at(-1)?.body as { changeSet: { request: { thread: Array<{ from: string; text: string }> } } };
    expect(posted.changeSet.request.thread.map((m) => m.text)).toEqual([
      "Calmer",
      "(The designer stopped this job before you reported it done: it may not be done.)",
      "Calmer, please",
    ]);
    s.resolve(thread.id);
  });

  it("/props: a job with the instance's props now; the agent's list comes back in the thread", async () => {
    vi.useFakeTimers();
    instance.props = { tone: "light" };
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const { thread, job: sent } = s.comment(el, "", [], "props");
    const posted = posts.at(-1)?.body as { changeSet: { request: { kind: string; component: string; current: object; usedIn: string } } };
    expect(posted.changeSet.request).toMatchObject({ kind: "props", component: "ProductCard", current: { tone: "light" }, usedIn: "src/App.jsx" });
    const props = [{ name: "tone", type: "options" as const, options: ["light", "dark"] }];
    hub().emit({ type: "job", job: job({ id: (sent as { id: string }).id, status: "done", agent, notes: "ProductCard has 1 prop.", props }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.threadFor(el)?.messages.at(-1)).toMatchObject({ from: "agent", text: "ProductCard has 1 prop.", propList: props });
    s.resolve(thread.id);
    instance.props = null;
  });

  it("/props again on a component listed before: its list at once, then the agent's reply updates it (new props show)", async () => {
    vi.useFakeTimers();
    instance.props = { tone: "light" };
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const first = s.comment(el, "", [], "props");
    const before = [{ name: "tone", type: "options" as const, options: ["light", "dark"] }];
    hub().emit({ type: "job", job: job({ id: (first.job as { id: string }).id, status: "done", agent, notes: "1 prop.", props: before }) });
    await vi.advanceTimersByTimeAsync(0);
    // Again: the list from before shows right away, while the agent checks.
    const again = s.comment(el, "", [], "props");
    const early = s.threadFor(el)?.messages.at(-1);
    expect(early).toMatchObject({ from: "agent", early: true, propList: before });
    expect(s.attention).toEqual([]); // not a reply to read: the agent is still on it
    const after = [...before, { name: "badge", type: "text" as const }];
    hub().emit({ type: "job", job: job({ id: (again.job as { id: string }).id, status: "done", agent, notes: "2 props.", props: after }) });
    await vi.advanceTimersByTimeAsync(0);
    const replies = s.threadFor(el)?.messages.filter((m) => m.from === "agent") ?? [];
    expect(replies.map((m) => [m.text, m.propList?.length, !!m.early])).toEqual([
      ["1 prop.", 1, false],
      ["2 props.", 2, false],
    ]);
    s.resolve(first.thread.id);
    instance.props = null;
  });

  it("a prop set from the list: the next message, checked on the page; not there yet, back to the agent once", async () => {
    vi.useFakeTimers();
    instance.props = { tone: "light" };
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const set = { component: "ProductCard", usedIn: "src/App.jsx", set: [{ name: "tone", from: "light", to: "dark" }] };
    const { thread, job: sent } = s.comment(el, "", [], undefined, [], [], false, set);
    const id = (sent as { id: string }).id;
    const posted = posts.at(-1)?.body as { changeSet: { request: { thread: Array<{ props?: unknown }> } } };
    expect(posted.changeSet.request.thread.at(-1)?.props).toEqual(set);
    // Done, but the page still says light after the wait: a follow-up.
    hub().emit({ type: "job", job: job({ id, status: "done", agent, notes: "Set." }) });
    await vi.advanceTimersByTimeAsync(7000);
    const retry = posts.find((p) => p.url.endsWith(`/jobs/${id}/retry`))?.body as { issues: string[] };
    expect(retry.issues).toEqual(['`tone` is `"light"`, the designer picked `"dark"`']);
    // Done again, and hot reload brings it: accepted.
    hub().emit({ type: "job", job: job({ id, status: "done", agent, notes: "Set.", attempt: 2 }) });
    instance.props = { tone: "dark" };
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.jobs.find((j) => j.id === id)?.checked).toBe(true);
    s.resolve(thread.id);
    instance.props = null;
  });

  it("what a comment mentions with @ goes with it, to the agent and in the thread; with an action, in the task", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const token = { kind: "token" as const, name: "--color-accent", value: "#1cf69e" };
    const { thread } = s.comment(el, "Use --color-accent", [], undefined, [], [token]);
    const posted = posts.at(-1)?.body as { changeSet: { request: { thread: Array<{ references?: unknown[] }> } } };
    expect(posted.changeSet.request.thread[0]?.references).toEqual([token]);
    expect(thread.messages[0]?.references).toEqual([token]);
    s.resolve(thread.id);
    const other = document.createElement("p");
    document.body.append(other);
    s.comment(other, "Use --color-accent", [], "responsive", [], [token]);
    const task = posts.at(-1)?.body as { changeSet: { request: { kind: string; references?: unknown[] } } };
    expect(task.changeSet.request).toMatchObject({ kind: "responsive", references: [token] });
  });

  it("an action from the comment box (/responsive) goes as that task, with the words and files, and the agent's notes come back in the thread", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const { thread, job: sent } = s.comment(el, " Two columns on tablet ", [{ id: `${"a".repeat(64)}.png`, name: "sketch.png", thumb: "data:," }], "responsive");
    expect(sent).not.toBeNull();
    const posted = posts.at(-1)?.body as { id: string; changeSet: { note?: string; request: { kind: string; attachments?: unknown[] } } };
    expect(posted.changeSet.request.kind).toBe("responsive");
    expect(posted.changeSet.note).toBe("Two columns on tablet");
    // By id only: the preview stays on the page.
    expect(posted.changeSet.request.attachments).toEqual([{ id: `${"a".repeat(64)}.png`, name: "sketch.png" }]);
    expect(s.threadFor(el)?.messages[0]).toMatchObject({ from: "designer", action: "responsive", jobId: posted.id });
    expect(s.jobOn(el)?.id).toBe(posted.id);
    // Done: the notes are the reply, while Pilot checks the widths.
    hub().emit({ type: "job", job: job({ id: posted.id, status: "done", agent, notes: "Stacks below 768px." }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.threadFor(el)?.messages.map((m) => [m.from, m.text])).toEqual([
      ["designer", "Two columns on tablet"],
      ["agent", "Stacks below 768px."],
    ]);
    expect(s.attention.map((t) => t.id)).toEqual([thread.id]);
  });

  it("a comment on an element a job is on waits, and goes with the thread once the job is finished", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    const before = posts.length;
    const first = s.comment(el, "Make the icon match");
    const second = s.comment(el, "And a bit bolder");
    expect(first.waiting && second.waiting).toBe(true);
    expect(first.job).toBeNull();
    expect(posts.length).toBe(before); // nothing posted yet
    expect(s.threadFor(el)?.messages.map((m) => m.waiting)).toEqual([true, true]);
    // The job on the element finishes: both go, as one job with the thread.
    sheet.textContent = ".card { padding-top: 20px; }";
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent }) });
    await vi.advanceTimersByTimeAsync(0);
    const posted = posts.at(-1)?.body as { id: string; changeSet: { request: { kind: string; thread: Array<{ text: string }> } } };
    expect(posted.changeSet.request.kind).toBe("comment");
    expect(posted.changeSet.request.thread.map((m) => m.text)).toEqual(["Make the icon match", "And a bit bolder"]);
    const messages = s.threadFor(el)?.messages ?? [];
    expect(messages.every((m) => m.jobId === posted.id && !m.waiting)).toBe(true);
    expect(s.jobOn(el)?.id).toBe(posted.id);
  });

  it("a comment on several elements: one job about all of them, the thread on the first, a job on each; a task asked there too", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    const second = document.createElement("div");
    second.id = "second";
    document.body.append(second);
    const { thread, job: sent } = s.comment(el, "Same height", [], undefined, [second]);
    const posted = posts.at(-1)?.body as { id: string; changeSet: { request: { kind: string; target: { selector: string }; others?: Array<{ selector: string }> } } };
    expect(posted.changeSet.request.others?.map((t) => t.selector)).toEqual(["#second"]);
    expect(s.threadFor(el)?.id).toBe(thread.id);
    expect(s.threadFor(second)).toBeNull();
    expect(s.threadOthers(thread)).toEqual([second]);
    expect(s.jobOn(el)?.id).toBe(sent?.id);
    expect(s.jobOn(second)?.id).toBe(sent?.id);
    hub().emit({ type: "job", job: job({ id: posted.id, status: "done", agent, notes: "Both 120px." }) });
    await vi.advanceTimersByTimeAsync(0);
    // The next message in the thread is about the same elements; an action goes as a task on all of them.
    s.comment(el, "", [], "responsive", s.threadOthers(thread));
    const task = posts.at(-1)?.body as { id: string; changeSet: { request: { kind: string; others?: unknown[] } } };
    expect(task.changeSet.request.kind).toBe("responsive");
    expect(task.changeSet.request.others).toHaveLength(1);
    expect(s.jobOn(second)?.id).toBe(task.id);
    // While it's on the second element, a comment about both waits.
    expect(s.comment(el, "Bolder too", [], undefined, [second]).waiting).toBe(true);
    // Written with only the first selected, the thread is about that one alone from then on.
    s.resolve(thread.id);
    const alone = s.comment(second, "Just this one");
    expect(alone.waiting).toBe(true);
    expect(alone.thread.others).toBeUndefined();
    // After a reload, the job is found again on both elements, by their selectors.
    s.destroy();
    const reloaded = session();
    expect(reloaded.jobOn(second)?.id).toBe(task.id);
    expect(reloaded.jobOn(el)?.id).toBe(task.id);
    second.remove();
  });

  it("the agent asks: the question goes in a thread on the job's element, the job waits unchecked, and the answer sends it back", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 1 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    const question = { text: "Every card, or only this one?", choices: ["All of them", "Only this one"] };
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, question }) });
    await vi.advanceTimersByTimeAsync(2_000);
    // Not checked: the change is still previewed, and the job still on the element.
    expect(s.jobs.find((j) => j.id === sent.id)?.checked).toBeFalsy();
    expect(s.jobOn(el)?.id).toBe(sent.id);
    const thread = s.threadFor(el) as NonNullable<ReturnType<typeof s.threadFor>>;
    expect(thread.messages).toMatchObject([{ from: "agent", text: question.text, asks: sent.id, choices: question.choices }]);
    expect(s.attention.map((t) => t.id)).toEqual([thread.id]);
    expect(s.openQuestion(thread)?.id).toBe(sent.id);
    // The designer's next message in the thread is the answer: no new job.
    const before = posts.filter((p) => p.url === "http://hub/jobs").length;
    const answered = s.comment(el, "All of them");
    expect(answered.job?.id).toBe(sent.id);
    expect(answered.waiting).toBe(false);
    expect(posts.filter((p) => p.url === "http://hub/jobs").length).toBe(before);
    expect(posts.at(-1)).toEqual({ url: `http://hub/jobs/${sent.id}/answer`, body: { answer: "All of them" } });
    expect(s.jobs.find((j) => j.id === sent.id)).toMatchObject({ status: "queued", answer: "All of them" });
    expect(s.openQuestion(thread)).toBeNull();
    // Done again: checked as usual, and the notes are the reply in the thread.
    hub().emit({ type: "job", job: job({ id: sent.id, status: "working", agent, question, answer: "All of them" }) });
    sheet.textContent = ".card { padding-top: 20px; }";
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, question, answer: "All of them", notes: "Card padding is 20px now." }) });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(s.jobs.find((j) => j.id === sent.id)?.checked).toBe(true);
    expect(s.threadFor(el)?.messages.map((m) => [m.from, m.text])).toEqual([
      ["agent", question.text],
      ["designer", "All of them"],
      ["agent", "Card padding is 20px now."],
    ]);
  });

  it("stuck: Pilot not running for the site, said once it has lasted; a job queued or being run isn't stuck", async () => {
    vi.useFakeTimers();
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    // Queued, then run: not stuck, however long it takes.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(s.stuck).toBeNull();
    hub().emit({ type: "job", job: job({ id: sent.id, status: "working", agent }) });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.stuck).toBeNull();
    // Pilot stopped running for the site (npx usepilot closed, another took over the hub).
    hub().emit({ type: "agents", agents: [], waiting: 0 });
    expect(s.stuck).toBeNull(); // not yet: it may be restarting
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.stuck).toMatchObject({ kind: "no-agent", title: "Pilot isn't running for this site", detail: "Run npx usepilot in your project's folder", jobs: [sent.id] });
    expect(s.isStuck(s.jobs[0] as never)).toBe(true);
    // The hub is gone.
    hub().readyState = 2;
    hub().onerror?.();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(s.stuck).toMatchObject({ kind: "offline", title: "Pilot isn't running for this site" });
    s.destroy();
  });

  it("a run that failed: said at once with what to do, its changes unsent again (still previewed), until the designer sends again", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    history.apply(el, "padding-top", "20px");
    const sent = s.send() as { id: string };
    expect(history.changes({ unsent: true })).toEqual([]);
    const error = { title: "Claude Code isn't signed in", detail: "Run claude auth login in a terminal, then send again." };
    hub().emit({ type: "job", job: job({ id: sent.id, status: "done", agent, error }) });
    expect(s.stuck).toEqual({ kind: "agent-error", ...error, jobs: [sent.id] });
    // Back as unsent changes, still on the page: the next Send has them.
    expect(history.changes({ unsent: true }).map((c) => c.property)).toEqual(["padding-top"]);
    expect(getComputedStyle(el).paddingTop).toBe("20px");
    // Sent again: no longer said.
    s.send();
    expect(s.stuck).toBeNull();
    expect(s.jobs.map((j) => j.id)).not.toContain(sent.id);
    s.destroy();
  });

  it("a comment thread keeps the agent's session: its next message resumes it", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    const first = s.comment(el, "Bigger").job as { id: string };
    const session1 = { agent: "claude", id: "aaaaaaaa-1111-2222-3333-444444444444" };
    hub().emit({ type: "job", job: job({ id: first.id, status: "done", agent, notes: "Bigger now.", session: session1 }) });
    expect(s.threadFor(el)?.session).toEqual(session1);
    posts = [];
    s.comment(el, "a bit more");
    const posted = posts.find((p) => p.url === "http://hub/jobs")?.body as { changeSet: { request: { session?: unknown } } };
    expect(posted.changeSet.request.session).toEqual(session1);
    s.destroy();
  });

  it("with no agent, a comment is kept and its prompt is there to copy; threads survive a reload", () => {
    const s = session();
    const { job: sent, changeSet } = s.comment(el, "Swap these two");
    expect(sent).toBeNull();
    expect(changeSet.request?.kind).toBe("comment");
    expect(posts.some((p) => p.url === "http://hub/jobs")).toBe(false);
    s.destroy();
    const reloaded = session();
    expect(reloaded.threadFor(el)?.messages.map((m) => m.text)).toEqual(["Swap these two"]);
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

describe("timings", () => {
  it("where a job's time went: waiting for an agent, the agent, Pilot's check", () => {
    expect(
      timings({
        createdAt: "2026-11-18T10:00:00.000Z",
        takenAt: "2026-11-18T10:00:00.400Z",
        doneAt: "2026-11-18T10:00:12.700Z",
        checkedAt: "2026-11-18T10:00:13.300Z",
      }),
    ).toEqual({ waiting: 0.4, agent: 12.3, check: 0.6, total: 13.3 });
    expect(timings({ createdAt: "2026-11-18T10:00:00.000Z" })).toEqual({ waiting: null, agent: null, check: null, total: null });
  });
});

describe("an agent on an older Pilot", () => {
  it("its own hub not there, an older one answering on its port: said on the toolbar, with no job", async () => {
    vi.useFakeTimers();
    const asked: string[] = [];
    // Only the previous version's port answers (no-cors: the page can't read it, only that it's there).
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(url);
      if (url.endsWith(`:${4747 + BRIDGE_VERSION - 1}/`) && init?.mode === "no-cors") return new Response(null);
      throw new TypeError("refused");
    });
    const s = new PilotSession(history, { bridge: DEFAULT_BRIDGE_URL, onLaunch: () => {} });
    (s.bridge as unknown as { EventSourceImpl: unknown }).EventSourceImpl = FakeEventSource;
    s.start();
    hub().readyState = 2;
    hub().onerror?.();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(asked[0]).toBe(`http://127.0.0.1:${4747 + BRIDGE_VERSION - 1}/`);
    expect(s.stuck).toMatchObject({ kind: "older-agent", title: "Pilot isn't running for this site", jobs: [] });
    s.destroy();
    vi.unstubAllGlobals();
  });

  it("nothing answers: no older Pilot", async () => {
    expect(await olderHub(async () => Promise.reject(new TypeError("refused")))).toBeNull();
  });
});

describe("closing Pilot", () => {
  it("tells the hub (the site's other tabs close too), and leaves the jobs alone: Pilot keeps running them", () => {
    const s = session();
    hub().emit({ type: "agents", agents: [agent], waiting: 0 });
    history.apply(el, "padding-top", "20px");
    const queued = s.send() as { id: string };
    s.quit();
    expect(s.jobs.map((j) => j.id)).toEqual([queued.id]);
    expect(posts.map((p) => p.url)).toContain("http://hub/quit");
    expect(posts.some((p) => p.url.includes("/cancel"))).toBe(false);
    s.destroy();
  });

  it("quit in another tab of the site: this one closes too", () => {
    let quits = 0;
    const s = new PilotSession(history, { bridge: "http://hub", onLaunch: () => {}, onQuit: () => quits++ });
    (s.bridge as unknown as { EventSourceImpl: unknown }).EventSourceImpl = FakeEventSource;
    s.start();
    hub().emit({ type: "quit" });
    expect(quits).toBe(1);
    s.destroy();
  });
});
