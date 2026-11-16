import { defineConfig } from "tsup";

/**
 * One self-contained file: the protocol, the MCP SDK and zod are bundled in,
 * so `usepilot` ships the CLI with no dependencies to install. The banner
 * gives bundled CommonJS code (the SDK's JSON-schema validator) a `require`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/.*/],
  // The /pilot skill, bundled so `pilot setup` can install it.
  loader: { ".md": "text" },
  banner: { js: 'import { createRequire as __pilotRequire } from "node:module"; const require = __pilotRequire(import.meta.url);' },
});
