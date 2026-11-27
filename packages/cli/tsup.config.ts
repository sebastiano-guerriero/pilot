import { defineConfig } from "tsup";

/**
 * Self-contained: the protocol is bundled in, so `usepilot` ships the CLI
 * with no dependencies to install. Three entries, the command,
 * `usepilot/vite` and `usepilot/next`, with their shared code in a chunk
 * beside them (`usepilot` copies the whole folder). The banner gives bundled
 * CommonJS code a `require`.
 */
export default defineConfig({
  entry: ["src/index.ts", "src/vite.ts", "src/next.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/.*/],
  // The user guide (`usepilot guide`) is bundled as text.
  loader: { ".md": "text" },
  banner: { js: 'import { createRequire as __pilotRequire } from "node:module"; const require = __pilotRequire(import.meta.url);' },
});
