import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Library build: `pilot.js` (ESM API) and `pilot-auto.js` (self-mounting,
// for a plain <script type="module"> tag). Everything, Preact included, is
// bundled so the overlay never depends on the host app's dependencies.
export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {
      entry: { pilot: "src/index.ts", "pilot-auto": "src/auto.ts" },
      formats: ["es"],
    },
  },
});
