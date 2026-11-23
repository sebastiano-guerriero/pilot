// @vitest-environment happy-dom
/**
 * How well Pilot's code search (the CLI's locate.ts) finds real pages'
 * elements in their projects: right, wrong, or no hint. Not part of the
 * usual run: LOCATE_PAGES="<project folder>|<page.html>@<its url>,…;…" runs it,
 * on pages saved from the project's dev server (`curl <url> > page.html`: a
 * PHP site, a static page; one rendered in the browser, saved from it). Each element is described as the page does it
 * (describeElement), and checked against the code's own lines with its tag
 * and exact class list (an element whose classes aren't written as they are
 * in the code, or are in several places, is counted apart; copies in other
 * folders than the page's, `web-2` for a `web-3` page, don't count).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { candidates, locate } from "../../../cli/src/locate.ts";
import { markupSources } from "../../../cli/src/sources.ts";
import { describeElement } from "./target.ts";

const PAGES = process.env.LOCATE_PAGES;
const OUT = process.env.LOCATE_OUT;
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "path", "g", "circle", "rect", "line", "polyline", "polygon", "defs", "use", "symbol", "mask", "clippath", "lineargradient", "radialgradient", "stop", "head", "meta", "link", "title", "base", "br", "html", "body"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe.skipIf(!PAGES)("locate accuracy", () => {
  it("scores the search on real pages", async () => {
    const report: string[] = [];
    const totals = { right: 0, two: 0, wrong: 0, silent: 0, unknownAnswered: 0, unknownSilent: 0 };
    const samples: string[] = [];
    const ms: number[] = [];
    let twins = 0;
    for (const spec of (PAGES as string).split(";")) {
      const [root, urls] = spec.split("|") as [string, string];
      const byFile = new Map(markupSources(root).sources.map((f) => [f.rel, f.lines]));
      for (const page of urls.split(",")) {
        const [saved, url] = page.split("@") as [string, string | undefined];
        const folder = url ? new URL(url).pathname.split("/").filter(Boolean) : [];
        // A saved page (happy-dom's fetch keeps to the same origin): `curl <url> > page.html`.
        const html = readFileSync(saved, "utf8");
        const doc = new DOMParser().parseFromString(html, "text/html");
        document.body.innerHTML = doc.body.innerHTML;
        // A page rendered from a labeled copy of the project (every tag's `data-src=<file>:<line>`) says where each
        // element really is; the labels go before Pilot describes the elements, so the search never sees them.
        const labels = new Map<Element, { file: string; line: number }>();
        for (const el of document.body.querySelectorAll("[data-src]")) {
          const m = /^(.*):(\d+)$/.exec(el.getAttribute("data-src") ?? "");
          if (m) labels.set(el, { file: m[1] as string, line: Number(m[2]) });
          el.removeAttribute("data-src");
        }
        const elements = [...document.body.querySelectorAll("*")].filter((el) => {
          const tag = el.tagName.toLowerCase();
          if (SKIP.has(tag) || el.closest("svg")) return false;
          return el.classList.length > 0 || !!el.id;
        });
        const tally = { right: 0, two: 0, wrong: 0, silent: 0, unknownAnswered: 0, unknownSilent: 0 };
        for (const el of elements.slice(0, 1500)) {
          const target = describeElement(el);
          const classString = [...el.classList].join(" ");
          const name = `<${target.tag} class="${classString.slice(0, 80)}"> text="${(target.text ?? "").slice(0, 40)}"`;
          const t0 = Date.now();
          const at = locate(target, root, { url });
          ms.push(Date.now() - t0);
          const t = labels.get(el);
          // LOCATE_DEBUG=<part of a class list>: the best places for those elements, and why.
          const debug = process.env.LOCATE_DEBUG;
          if (debug && classString.includes(debug) && samples.length < 200) {
            const found = candidates(target, root, { url });
            samples.push(`DEBUG ${name} really ${t?.file}:${t?.line} context=${JSON.stringify(target.context)}`);
            if (found && "list" in found)
              for (const c of found.list.slice(0, 6)) samples.push(`  ${c.file.rel}:${c.index + 1} ${c.score.toFixed(1)} classes ${c.classScore.toFixed(1)} [${[...c.kinds].join(",")}]`);
          }
          if (!t) {
            // Made by a script, or a page without labels: where it is isn't known.
            if (at) tally.unknownAnswered++;
            else tally.unknownSilent++;
            continue;
          }
          const near = (p: { file: string; line: number }) => p.file === t.file && Math.abs(p.line - t.line) <= 1;
          if (!at) {
            tally.silent++;
            // A line just like it elsewhere in its file: copies no search can tell apart by their own code.
            const lines = byFile.get(t.file) ?? [];
            const own = (lines[t.line - 1] ?? "").trim();
            if (own && lines.filter((l) => l.trim() === own).length > 1) twins++;
            else if (samples.length < 120) samples.push(`SILENT ${saved.split("/").pop()} ${name}, really ${t.file}:${t.line}`);
          } else if (near(at) && !at.also) tally.right++;
          else if (near(at) || (at.also && near(at.also))) tally.two++;
          else {
            tally.wrong++;
            report.push(`WRONG ${saved.split("/").pop()} ${name} → ${at.file}:${at.line}${at.also ? ` or ${at.also.file}:${at.also.line}` : ""}, really ${t.file}:${t.line}`);
          }
        }
        report.unshift(`${saved.split("/").pop()}: ${elements.length} elements · right ${tally.right}, one of two ${tally.two}, wrong ${tally.wrong}, silent ${tally.silent} · unlabeled: answered ${tally.unknownAnswered}, silent ${tally.unknownSilent}`);
        for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += tally[k];
      }
    }
    ms.sort((a, b) => a - b);
    report.unshift(
      `TOTAL · right ${totals.right}, one of two ${totals.two}, wrong ${totals.wrong}, silent ${totals.silent} (${twins} with a twin line) · unlabeled: answered ${totals.unknownAnswered}, silent ${totals.unknownSilent} · ms median ${ms[ms.length >> 1]}, max ${ms[ms.length - 1]}`,
    );
    if (OUT) writeFileSync(OUT, [...report, "", ...samples].join("\n"));
    expect(totals.right + totals.two + totals.wrong + totals.silent).toBeGreaterThan(0);
  }, 600_000);
});
