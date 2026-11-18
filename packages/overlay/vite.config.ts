import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Library build: `pilot.js` (ESM API) and `pilot-auto.js` (self-mounting,
// for a plain <script type="module"> tag). Everything, Preact included, is
// bundled so the overlay never depends on the host app's dependencies.
//
// `vite` (no build) serves the source instead, for trying Pilot in other
// projects as you change it (`pnpm dev:experiments`): an app loads
// http://localhost:5199/src/auto.ts and gets every save, with hot reload.
// CORS lets those apps, on other localhost ports, import it.
export default defineConfig({
  plugins: [preact()],
  server: { port: 5199, strictPort: true, cors: true },
  build: {
    // esbuild, not lightningcss (this Vite's default): lightningcss rounds
    // big numbers to six digits, so the highlight and UI layers
    // (2147483646, 2147483647 in tokens.css) both became 2147480000, and
    // highlights drew over Pilot's own buttons and panels.
    cssMinify: "esbuild",
    lib: {
      entry: { pilot: "src/index.ts", "pilot-auto": "src/auto.ts" },
      formats: ["es"],
    },
  },
});
