/**
 * How well Pilot finds a value's rule in the project's source stylesheets
 * (styles.ts), on a real project whose compiled CSS sits beside its Sass:
 * every rule of a compiled `css/X.css` should be found in a Sass file of the
 * same folder (`scss/X.scss` and what it includes), never in the compiled CSS
 * or another site's copy. Not part of the usual run: STYLES_ROOT=<project
 * folder> runs it, with the report in the file STYLES_OUT names.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { styleFiles } from "./sources.ts";
import { parseStylesheet, ruleSource } from "./styles.ts";

const ROOT = process.env.STYLES_ROOT;
/** Queries per compiled stylesheet: a few each, so no one file decides. */
const PER_FILE = 40;

describe.skipIf(!ROOT)("rule source accuracy", () => {
  it("finds compiled rules in their Sass sources", () => {
    const root = ROOT as string;
    const pairs = styleFiles(root).filter((f) => f.endsWith(".css") && existsSync(join(dirname(dirname(f)), "scss", `${basename(f, ".css")}.scss`)));
    const tally = { right: 0, ruleOnly: 0, wrong: 0, none: 0 };
    const report: string[] = [];
    const ms: number[] = [];
    for (const css of pairs) {
      const folder = relative(root, dirname(dirname(css)));
      let queries = 0;
      for (const rule of parseStylesheet(readFileSync(css, "utf8"), relative(root, css))) {
        if (queries >= PER_FILE) break;
        const selector = rule.selectors[0];
        const declaration = rule.declarations[0];
        if (!selector || !declaration) continue;
        queries++;
        const t0 = Date.now();
        const found = ruleSource(selector, declaration.property, root, [relative(root, css)], rule.media);
        ms.push(Date.now() - t0);
        // Rules a Sass loop or mixin generates have no line of their own: none is right for them.
        if (!found) tally.none++;
        else if (!found.rule.file.endsWith(".css") && found.rule.file.startsWith(`${folder}/`)) found.declaration ? tally.right++ : tally.ruleOnly++;
        else {
          tally.wrong++;
          report.push(`WRONG ${folder} ${selector} ${declaration.property} → ${found.rule.file}:${found.rule.line}`);
        }
      }
    }
    ms.sort((a, b) => a - b);
    report.unshift(`${pairs.length} compiled stylesheets · right ${tally.right}, rule only ${tally.ruleOnly}, wrong ${tally.wrong}, none ${tally.none} · ms median ${ms[ms.length >> 1]}, max ${ms[ms.length - 1]}`);
    if (process.env.STYLES_OUT) writeFileSync(process.env.STYLES_OUT, report.join("\n"));
    expect(tally.right + tally.ruleOnly + tally.wrong + tally.none).toBeGreaterThan(0);
  }, 900_000);
});
