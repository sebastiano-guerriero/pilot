// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { changesLabel, countChanges } from "./changesLabel.ts";
import { jobAbout } from "./components/JobList/JobList.tsx";

describe("changes in words", () => {
  it("say what kind they are, never a bare count", () => {
    expect(changesLabel({ styles: 3, texts: 0 })).toBe("3 style changes");
    expect(changesLabel({ styles: 0, texts: 1 })).toBe("1 text change");
    expect(changesLabel({ styles: 2, texts: 1 })).toBe("2 style changes and 1 text change");
    expect(changesLabel(1)).toBe("1 style change");
  });

  it("counts style and text changes apart (text runs: text, text:1)", () => {
    expect(countChanges([{ property: "padding" }, { property: "text" }, { property: "text:1" }, { property: "color" }])).toEqual({
      styles: 2,
      texts: 2,
    });
  });
});

describe("what a job is about (its loader's tooltip)", () => {
  const target = { selector: "a", path: "a", tag: "a", classes: [] };
  const job = (changeSet: object) => ({
    id: "j",
    status: "working" as const,
    createdAt: "",
    changeSet: { id: "j", createdAt: "", page: { url: "", title: "", viewport: { width: 0, height: 0 } }, edits: [], ...changeSet },
  });

  it("a comment by its own words, cut to a line, with the edits that went with it", () => {
    const thread = [{ from: "designer" as const, text: "Make the price   bigger", at: "" }];
    expect(jobAbout(job({ request: { kind: "comment", target, breakpoints: [], thread } }) as never)).toBe("“Make the price bigger”");
    const edits = [{ target, changes: [{ property: "padding", from: "1px", to: "2px" }] }];
    expect(jobAbout(job({ edits, request: { kind: "comment", target, breakpoints: [], thread } }) as never)).toBe(
      "“Make the price bigger”, with 1 style change",
    );
    const long = [{ from: "designer" as const, text: "x".repeat(80), at: "" }];
    expect(jobAbout(job({ request: { kind: "comment", target, breakpoints: [], thread: long } }) as never)).toBe(`“${"x".repeat(59)}…”`);
  });

  it("a task by its name, props by the component, edits by what they are", () => {
    expect(jobAbout(job({ request: { kind: "responsive", target, breakpoints: [] } }) as never)).toBe("Make responsive");
    expect(jobAbout(job({ request: { kind: "props", target, breakpoints: [], component: "ProductCard", current: {} } }) as never)).toBe(
      "Props of ProductCard",
    );
    const edits = [
      {
        target,
        changes: [
          { property: "padding", from: "1px", to: "2px" },
          { property: "color", from: "red", to: "blue" },
        ],
        texts: [{ from: "a", to: "b" }],
      },
    ];
    expect(jobAbout(job({ edits }) as never)).toBe("2 style changes and 1 text change");
  });
});
