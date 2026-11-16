import { defineConfig } from "vitest/config";

export default defineConfig({
  // Markdown imported as text, as the CLI's bundle does (tsup's text loader):
  // the /pilot skill that `usepilot setup` installs.
  plugins: [
    {
      name: "markdown-as-text",
      transform(code, id) {
        if (id.endsWith(".md")) return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: {
    include: ["packages/*/src/**/*.test.ts"],
  },
});
