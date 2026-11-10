import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Preact plugin is here only to compile the overlay's TSX from workspace source.
export default defineConfig({
  plugins: [preact()],
});
