// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadSelection, saveSelection } from "./selectionKeep.ts";

const target = { selector: "article", path: "main > article", tag: "article", classes: [] };

describe("the selection kept through a reload", () => {
  beforeEach(() => sessionStorage.clear());

  it("the tool, the elements and the comment being written, for this tab", () => {
    saveSelection({ tool: "comment", targets: [target], draft: "Calmer" });
    expect(loadSelection()).toMatchObject({ tool: "comment", targets: [target], draft: "Calmer" });
  });

  it("nothing selected: nothing kept; an old one (the tab came back much later) isn't restored", () => {
    saveSelection({ tool: "select", targets: [target] });
    saveSelection(null);
    expect(loadSelection()).toBeNull();
    saveSelection({ tool: "select", targets: [target] });
    expect(loadSelection(Date.now() + 11 * 60_000)).toBeNull();
  });
});
