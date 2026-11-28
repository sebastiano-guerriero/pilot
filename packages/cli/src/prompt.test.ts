import type { Job } from "@pilot/protocol";
import { describe, expect, it } from "vitest";
import { jobPrompt } from "./prompt.ts";

const target = (selector: string) => ({ selector, path: selector, tag: "div", classes: [] });
const edit = (selector: string) => ({ target: target(selector), changes: [{ property: "color", from: "", to: "red" }] });
const jobOf = (...selectors: string[]) =>
  ({ id: "j", changeSet: { page: { url: "http://localhost:5173/", title: "Home", viewport: { width: 1280, height: 800 } }, edits: selectors.map(edit) } }) as unknown as Job;

describe("conditions", () => {
  it("a job with a When asks for each condition back, labelled, with its CSS; a label only, not a hint about the code", () => {
    const job = jobOf(".card");
    (job.changeSet.edits[0]!.changes[0] as { condition?: unknown }).condition = { words: "the card is hovered" };
    const prompt = jobPrompt(job);
    expect(prompt).toContain('{"conditions": [{"element": 1, "words": "the When, as given", "label": "group-hover", "selector": ".card:hover &"}]}');
    expect(prompt).toContain("a label only, not a hint about the code, which follows the project's own way");
    expect(jobPrompt(jobOf(".card"))).not.toContain('"conditions"');
  });

  it("a follow-up for conditions it didn't name: asks for them only, without touching the code; with differences, both", () => {
    const job = jobOf(".card");
    (job.changeSet.edits[0]!.changes[0] as { condition?: unknown }).condition = { words: "the card is hovered" };
    const naming = jobPrompt({ ...job, attempt: 2, unnamed: [{ element: 1, words: "the card is hovered" }] } as Job);
    expect(naming).toContain("didn't give back these conditions (When) in your `conditions`");
    expect(naming).toContain('- Element 1: "the card is hovered"');
    expect(naming).toContain("don't change the code again");
    expect(naming).toContain('{"conditions": [{"element": 1');
    const both = jobPrompt({
      ...job,
      attempt: 2,
      differences: [{ selector: ".card", property: "color", expected: "red", actual: "blue", outcome: "differs" }],
      unnamed: [{ element: 1, words: "the card is hovered" }],
    } as unknown as Job);
    expect(both).toContain("these changes don't give the designer's value yet");
    expect(both).toContain("And give back these conditions (When)");
  });
});

describe("a follow-up", () => {
  const differences = [{ selector: ".card", property: "margin-bottom", expected: "4px", actual: "40px", ok: false }];

  it("of a comment's edits: where the agent followed the comment instead, it keeps it", () => {
    const base = jobOf(".card");
    const comment = {
      ...base,
      attempt: 2,
      differences,
      changeSet: { ...base.changeSet, request: { kind: "comment", target: target(".card"), thread: [{ from: "designer", text: "10× the spacing", at: "" }], breakpoints: [] } },
    } as unknown as Job;
    const prompt = jobPrompt(comment);
    expect(prompt).toContain("# Pilot design edits: follow-up");
    expect(prompt).toContain("keep it, don't switch to the edit's value");
  });

  it("of a Send's edits: no comment to follow", () => {
    const prompt = jobPrompt({ ...jobOf(".card"), attempt: 2, differences } as unknown as Job);
    expect(prompt).toContain("# Pilot design edits: follow-up");
    expect(prompt).not.toContain("don't switch to the edit's value");
  });
});

describe("the run's footer", () => {
  it("on several elements, a question says which one it's about (asked there)", () => {
    const prompt = jobPrompt(jobOf(".card", "footer a"));
    expect(prompt).toContain('"element": 2');
    expect(prompt).toContain("`element`: the number of the element it's about");
  });

  it("on one, no element to name", () => {
    const prompt = jobPrompt(jobOf(".card"));
    expect(prompt).not.toContain('"element"');
  });

  it("every agent is asked to list what it was refused, so Pilot can say how to allow it", () => {
    const prompt = jobPrompt(jobOf(".card"));
    expect(prompt).toContain("list it in that block as `refused`");
    expect(prompt).toContain('{"refused": [{"mcp": ');
  });

  it("every agent reads with its own file tools and leaves the page to Pilot: what runs were refused most, for nothing", () => {
    const prompt = jobPrompt(jobOf(".card"));
    expect(prompt).toContain("Read and search files with your own file tools, not shell commands");
    expect(prompt).toContain("don't fetch or open the page");
  });
});
