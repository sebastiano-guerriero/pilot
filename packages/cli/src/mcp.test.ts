import type { Job } from "@pilot/protocol";
import { describe, expect, it } from "vitest";
import { INSTRUCTIONS, jobPrompt, MAX_BATCH, takeQueued, taskFollowUp } from "./mcp.ts";

const target = { selector: ".card", path: "main > div.card", tag: "div", classes: ["card"], text: "BMW M4" };
const job = (patch: Partial<Job> = {}): Job => ({
  id: "job_1",
  origin: "http://localhost:5173",
  changeSet: {
    id: "job_1",
    createdAt: "",
    page: { url: "http://localhost:5173/", title: "App", viewport: { width: 1200, height: 800 } },
    edits: [],
    request: { kind: "responsive", target, breakpoints: [768, 1024] },
  },
  status: "queued",
  createdAt: "",
  updatedAt: "",
  ...patch,
});

describe("jobPrompt", () => {
  it("a Make responsive job: the task's prompt, then the job id and pilot_done", () => {
    const text = jobPrompt(job());
    expect(text).toContain("# Pilot: make responsive");
    expect(text).toContain("768px, 1024px");
    expect(text).toContain('call `pilot_done` with `jobId: "job_1"`');
    expect(text).toContain("what changed at which widths");
  });

  it("a task's follow-up: the width check's problems, then the task again", () => {
    const followUp = job({ attempt: 2, issues: ["375px: `div.card` sticks out of the viewport by 40px."] });
    const text = jobPrompt(followUp);
    expect(text.startsWith(taskFollowUp(followUp))).toBe(true);
    expect(text).toContain("# Pilot: make responsive, follow-up");
    expect(text).toContain("- 375px: `div.card` sticks out of the viewport by 40px.");
    expect(text).toContain("run `pilot_check_widths` to confirm");
    expect(text).toContain("# Pilot: make responsive\n");
  });

  it("a job back with the designer's answer: the question, the answer, then the job again", () => {
    const text = jobPrompt(job({ question: { text: "Every card, or only this one?" }, answer: "Only this one" }));
    expect(text).toContain("# Pilot: the designer answered your question");
    expect(text).toContain("You did this job and asked the designer: Every card, or only this one?");
    expect(text).toContain("> Only this one");
    expect(text).toContain("# Pilot: make responsive\n");
    // A one-click answer is spelled out: what it asks of the code.
    const variant = jobPrompt(job({ question: { text: "All cards, or only this one?" }, answer: "New variant" }));
    expect(variant).toContain("What that means for the code: **New variant**: add a named option");
    expect(text).not.toContain("What that means for the code");
    // Asked but not answered yet (a page posting it again): the job as it is.
    expect(jobPrompt(job({ question: { text: "?" } }))).not.toContain("answered your question");
  });

  it("a comment's notes are the agent's reply in the thread", () => {
    const comment = job({
      changeSet: { ...job().changeSet, request: { kind: "comment", target, thread: [{ from: "designer", text: "Greener", at: "" }], breakpoints: [] } },
    });
    expect(jobPrompt(comment)).toContain("your reply in the designer's comment thread");
  });
});

describe("the MCP server's instructions", () => {
  it("carry the whole loop for any agent, favoring no model", () => {
    expect(INSTRUCTIONS).toContain("design instructions, not code");
    expect(INSTRUCTIONS).toContain("Between jobs keep your messages short");
    expect(INSTRUCTIONS).toContain("a more capable model than the one you run on");
    expect(INSTRUCTIONS).not.toMatch(/opus/i);
  });
});

describe("an edits job's prompt", () => {
  it("doesn't repeat the edit guidelines (the agent read them in the wait tool's description), and carries where the code is", () => {
    const edits = job({
      changeSet: {
        id: "job_1",
        createdAt: "",
        page: { url: "http://localhost:5173/", title: "App", viewport: { width: 1200, height: 800 } },
        edits: [{ target, changes: [{ property: "padding-top", from: "8px", to: "12px" }] }],
      },
    });
    const text = jobPrompt(edits, "## Where the code probably is\n\n- here");
    expect(text).toContain("# Pilot design edits");
    expect(text).not.toContain("Guidelines:");
    expect(text).toContain("Follow Pilot's edit guidelines");
    expect(text).toContain("## Where the code probably is");
  });
});

describe("taking queued jobs along", () => {
  const edits = (id: string): Job => job({ id, changeSet: { ...job().changeSet, id, edits: [], request: undefined } });
  const queue = (...jobs: Job[]) => async () => ({ job: jobs.shift() ?? null });

  it("takes what's queued, up to a batch", async () => {
    const more = await takeQueued(edits("a"), queue(...Array.from({ length: 10 }, (_, i) => edits(`b${i}`))));
    expect(more).toHaveLength(MAX_BATCH - 1);
  });

  it("an advanced task comes alone, and ends a batch", async () => {
    expect(await takeQueued(job({ id: "t" }), queue(edits("x")))).toEqual([]);
    const more = await takeQueued(edits("a"), queue(edits("b"), job({ id: "t" }), edits("c")));
    expect(more.map((j) => j.id)).toEqual(["b", "t"]);
  });
});
