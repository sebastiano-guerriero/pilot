import { describe, expect, it } from "vitest";
import { actionAt, actionName, matchActions, matchSkills, withoutQuery } from "./actions.ts";

describe("the comment box's / menu", () => {
  it("open with / at the start of any word, up to the caret; not inside a word (and/or, URLs, paths in a word)", () => {
    expect(actionAt("/", 1)).toEqual({ start: 0, query: "" });
    expect(actionAt("/resp", 5)).toEqual({ start: 0, query: "resp" });
    expect(actionAt("then /resp", 10)).toEqual({ start: 5, query: "resp" });
    expect(actionAt("/responsive now", 15)).toBeNull(); // past a space: done
    expect(actionAt("and/or", 6)).toBeNull();
    expect(actionAt("see https://x.com/a", 19)).toBeNull();
    expect(actionAt("", 0)).toBeNull();
  });

  it("picked, the /word leaves the text, one space kept where it was", () => {
    expect(withoutQuery("/resp", { start: 0, query: "resp" })).toEqual({ text: "", caret: 0 });
    expect(withoutQuery("on tablets /resp please", { start: 11, query: "resp" })).toEqual({ text: "on tablets please", caret: 11 });
    expect(withoutQuery("/resp two columns", { start: 0, query: "resp" })).toEqual({ text: "two columns", caret: 0 });
  });

  it("Pilot's own two: Make responsive always, Props only on a component's instance (and first there); Break and fix and the previews left", () => {
    expect(matchActions("").map((a) => a.id)).toEqual(["responsive"]);
    expect(matchActions("", { component: true }).map((a) => a.id)).toEqual(["props", "responsive"]);
    expect(matchActions("prop").map((a) => a.id)).toEqual([]);
    expect(matchActions("prop", { component: true }).map((a) => a.id)).toEqual(["props"]);
    expect(matchActions("make").map((a) => a.id)).toEqual(["responsive"]);
    expect(matchActions("break")).toEqual([]);
    expect(matchActions("container")).toEqual([]);
    expect(actionName("responsive")).toBe("Make responsive");
  });

  it("the agent's skills: by name or a word of it, those that start with it first; not by description", () => {
    const skills = [{ name: "better-ui", description: "Polishes surfaces" }, { name: "build-design" }, { name: "variant", description: "Builds UI variants" }];
    expect(matchSkills(skills, "").map((s) => s.name)).toEqual(["better-ui", "build-design", "variant"]);
    expect(matchSkills(skills, "ui").map((s) => s.name)).toEqual(["better-ui", "build-design"]);
    expect(matchSkills(skills, "b").map((s) => s.name)).toEqual(["better-ui", "build-design"]);
    expect(matchSkills(skills, "ant").map((s) => s.name)).toEqual(["variant"]);
    expect(matchSkills(skills, "polish")).toEqual([]);
  });
});
