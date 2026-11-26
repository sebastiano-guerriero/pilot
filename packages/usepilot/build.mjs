// Copies the overlay's and the CLI's builds into the package (`dist/`, `cli/`), and, around `npm pack`, the
// repo's license. In Node, so it runs the same on macOS, Linux and Windows (no `rm` or `cp` there).
//
//   node build.mjs            the builds
//   node build.mjs license    the license in (prepack)
//   node build.mjs unlicense  the license out (postpack)
import { cpSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const step = process.argv[2] ?? "builds";

if (step === "builds") {
  for (const [from, to] of [["../overlay/dist", "dist"], ["../cli/dist", "cli"]]) {
    rmSync(join(here, to), { recursive: true, force: true });
    cpSync(join(here, from), join(here, to), { recursive: true });
  }
} else if (step === "license") {
  cpSync(join(here, "../../LICENSE.md"), join(here, "LICENSE.md"));
} else if (step === "unlicense") {
  rmSync(join(here, "LICENSE.md"), { force: true });
} else {
  throw new Error(`Unknown step: ${step}`);
}
