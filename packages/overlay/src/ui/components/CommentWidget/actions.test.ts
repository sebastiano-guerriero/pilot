import { describe, expect, it } from "vitest";
import { actionAt, actionName, matchActions, matchSkills, withoutQuery } from "./actions.ts";

describe("the comment box's / actions", () => {
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

  it("match by command or by a word of the name", () => {
    expect(matchActions("").map((a) => a.id)).toEqual(["responsive", "preview-container", "preview-a11y", "preview-variations", "break-and-fix", "preview-tokens", "preview-states", "preview-dark", "preview-motion"]);
    expect(matchActions("resp").map((a) => a.id)).toEqual(["responsive"]);
    expect(matchActions("make").map((a) => a.id)).toEqual(["responsive"]);
    expect(matchActions("break").map((a) => a.id)).toEqual(["break-and-fix"]);
    expect(matchActions("fix").map((a) => a.id)).toEqual(["break-and-fix"]);
    expect(matchActions("zzz")).toEqual([]);
    expect(actionName("responsive")).toBe("Make responsive");
  });

  it("the previews (listed, not built yet) are found like the others: by command or a word of the name", () => {
    expect(matchActions("container").map((a) => a.id)).toEqual(["preview-container"]);
    expect(matchActions("a11y").map((a) => a.id)).toEqual(["preview-a11y"]);
    expect(matchActions("access").map((a) => a.id)).toEqual(["preview-a11y"]);
    expect(matchActions("dark").map((a) => a.id)).toEqual(["preview-dark"]);
    expect(matchActions("").filter((a) => a.preview).length).toBe(7);
  });

  it("Props only for a component's instance", () => {
    expect(matchActions("").map((a) => a.id)).not.toContain("props");
    expect(matchActions("prop").map((a) => a.id)).toEqual([]);
    // First when a component is selected.
    expect(matchActions("", { component: true }).map((a) => a.id)).toEqual(["props", ...["responsive", "preview-container", "preview-a11y", "preview-variations", "break-and-fix", "preview-tokens", "preview-states", "preview-dark", "preview-motion"]]);
    expect(matchActions("prop", { component: true }).map((a) => a.id)).toEqual(["props"]);
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
