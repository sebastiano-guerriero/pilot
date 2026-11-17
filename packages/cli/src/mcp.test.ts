import type { Job } from "@pilot/protocol";
import { describe, expect, it } from "vitest";
import { jobPrompt, taskFollowUp } from "./mcp.ts";

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

  it("a comment's notes are the agent's reply in the thread", () => {
    const comment = job({
      changeSet: { ...job().changeSet, request: { kind: "comment", target, thread: [{ from: "designer", text: "Greener", at: "" }], breakpoints: [] } },
    });
    expect(jobPrompt(comment)).toContain("your reply in the designer's comment thread");
  });
});
