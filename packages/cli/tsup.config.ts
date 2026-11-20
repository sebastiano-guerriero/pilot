import { defineConfig } from "tsup";

/**
 * One self-contained file: the protocol is bundled in, so `usepilot` ships
 * the CLI with no dependencies to install. The banner gives bundled
 * CommonJS code a `require`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/.*/],
  banner: { js: 'import { createRequire as __pilotRequire } from "node:module"; const require = __pilotRequire(import.meta.url);' },
});
