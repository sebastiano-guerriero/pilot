// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildCheck, compareSnapshots, type Measured, pageCopy, problemLines, type StyleSnapshot, widthsToCheck } from "./widths.ts";

describe("widthsToCheck", () => {
  it("a phone, each breakpoint and 1px below it, a wide desktop, and the designer's width", () => {
    expect(widthsToCheck([640, 1024], 1280)).toEqual([375, 639, 640, 1023, 1024, 1280, 1440]);
    expect(widthsToCheck([], 1108)).toEqual([375, 1108, 1440]);
  });

  it("with many breakpoints, drops the ones just below them", () => {
    const widths = widthsToCheck([480, 640, 768, 1024, 1280, 1536], 1200);
    expect(widths).toEqual([375, 480, 640, 768, 1024, 1200, 1280, 1440, 1536]);
  });
});

describe("buildCheck", () => {
  const m = (problems: string[], extra: Partial<Measured> = {}): Measured => ({
    found: true,
    size: "100×20",
    layout: "block",
    problems: problems.map((key) => ({ key, text: `problem ${key}` })),
    notes: [],
    ...extra,
  });

  it("leaves out the problems the designer's width has too: that width is the designer's", () => {
    const measured = new Map([
      [375, m(["viewport:0", "overlap:1:2"])],
      [1280, m(["overlap:1:2"])],
    ]);
    const check = buildCheck(".card", [375, 1280], 1280, measured);
    expect(check.widths[0]?.issues).toEqual(["problem viewport:0"]);
    expect(check.widths[1]?.issues).toEqual([]);
    expect(check.problems).toBe(1);
  });

  it("counts an element not found, and what changed at the designer's width, as problems", () => {
    const measured = new Map([[1280, m([])]]);
    const check = buildCheck(".card", [375, 1280], 1280, measured, ["`div` width: 100px → 90px"]);
    expect(check.widths[0]?.found).toBe(false);
    expect(check.problems).toBe(2);
    expect(problemLines(check)).toEqual([
      "375px: the element isn't found at this width.",
      "At the designer's width (1280px), changed: `div` width: 100px → 90px",
    ]);
  });
});

describe("compareSnapshots", () => {
  const snap = (styles: Array<Record<string, string>>): StyleSnapshot => ({
    width: 1280,
    elements: styles.map((s, i) => ({ label: `\`div\` ${i}`, styles: s })),
  });

  it("lists the styles that changed, element by element", () => {
    const before = snap([{ display: "grid", "grid-template-columns": "100px 100px" }, { width: "50px" }]);
    const after = snap([{ display: "grid", "grid-template-columns": "200px" }, { width: "50px" }]);
    expect(compareSnapshots(before, after)).toEqual(["`div` 0 grid-template-columns: 100px 100px → 200px"]);
  });

  it("says when what's inside changed, or the element is gone", () => {
    expect(compareSnapshots(snap([{}, {}]), snap([{}]))).toEqual(["what's inside the element changed: 2 elements before, 1 now."]);
    expect(compareSnapshots(snap([{}]), null)).toEqual(["the element isn't found there anymore."]);
  });
});

describe("pageCopy", () => {
  it("the page as it is, without scripts, Pilot's UI or its previews, with a base for relative URLs", () => {
    const doc = document.implementation.createHTMLDocument("Page");
    doc.body.innerHTML = `
      <div class="modal" data-open="true" style="width: 300px">Open modal</div>
      <script>track()</script>
      <noscript>No JS</noscript>
      <pilot-root></pilot-root>`;
    const preview = doc.createElement("style");
    preview.setAttribute("data-pilot-preview", "");
    preview.textContent = ".modal { padding: 99px !important; }";
    doc.head.append(preview);
    const own = doc.createElement("style");
    own.textContent = ".modal { color: red; }";
    doc.head.append(own);
    const html = pageCopy(doc);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<div class="modal" data-open="true" style="width: 300px">Open modal</div>');
    expect(html).toContain(".modal { color: red; }");
    for (const gone of ["<script", "track()", "<noscript", "pilot-root", "99px"]) expect(html).not.toContain(gone);
    expect(html).toMatch(/<head><base href=/);
  });
});
