import type { Job } from "@pilot/protocol";
import { describe, expect, it } from "vitest";
import { jobPrompt } from "./prompt.ts";

const target = (selector: string) => ({ selector, path: selector, tag: "div", classes: [] });
const edit = (selector: string) => ({ target: target(selector), changes: [{ property: "color", from: "", to: "red" }] });
const jobOf = (...selectors: string[]) =>
  ({ id: "j", changeSet: { page: { url: "http://localhost:5173/", title: "Home", viewport: { width: 1280, height: 800 } }, edits: selectors.map(edit) } }) as unknown as Job;

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
