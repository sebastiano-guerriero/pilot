import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Preact plugin is here only to compile the overlay's TSX from workspace source.
export default defineConfig({
  plugins: [preact()],
  // Port 5180, not Vite's default 5173, which other projects on the machine
  // use. strictPort: fail if it's taken instead of moving to another port.
  server: { port: 5180, strictPort: true },
});
