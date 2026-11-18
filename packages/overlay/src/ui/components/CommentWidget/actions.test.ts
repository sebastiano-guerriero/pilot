import { describe, expect, it } from "vitest";
import { actionName, isActionQuery, matchActions } from "./actions.ts";

describe("the comment box's / actions", () => {
  it("open with / at the start of the message, until a space", () => {
    expect(isActionQuery("/")).toBe(true);
    expect(isActionQuery("/resp")).toBe(true);
    expect(isActionQuery("/responsive now")).toBe(false);
    expect(isActionQuery("see src/app")).toBe(false);
    expect(isActionQuery("")).toBe(false);
  });

  it("match by command or by a word of the name", () => {
    expect(matchActions("/").map((a) => a.id)).toEqual(["responsive", "break-and-fix"]);
    expect(matchActions("/resp").map((a) => a.id)).toEqual(["responsive"]);
    expect(matchActions("/make").map((a) => a.id)).toEqual(["responsive"]);
    expect(matchActions("/break").map((a) => a.id)).toEqual(["break-and-fix"]);
    expect(matchActions("/fix").map((a) => a.id)).toEqual(["break-and-fix"]);
    expect(matchActions("/zzz")).toEqual([]);
    expect(actionName("responsive")).toBe("Make responsive");
  });
});
