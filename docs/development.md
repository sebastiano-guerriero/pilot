# Developing Pilot

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
```

```bash
pnpm dev
```

| Script | What it does |
| --- | --- |
| `pnpm dev` | The playground at http://localhost:5180, with the overlay loaded from source (HMR) |
| `pnpm build` | Builds `packages/*` (`overlay` with Vite, `cli` with tsup) |
| `pnpm test` | Vitest across packages, plus the docs' links |
| `pnpm typecheck` | `tsc` in every workspace package |
| `pnpm dev:experiments` | The overlay's source on :5199 and the CLI rebuilt on change, for linked projects (below) |
| `pnpm link-experiment <folder>` | Links another project to this checkout (below) |

Before finishing a change, run `pnpm typecheck` and `pnpm test`.

**Stack:** TypeScript (strict, ESM), Preact (small, bundled into the overlay, so it never conflicts with the host app's framework), Vite, Vitest, tsup for the CLI.

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@pilot/overlay` | [packages/overlay](../packages/overlay) | The in-page editor: Shadow DOM mount, launch/quit, toolbar, property search, editors, the bridge client. Builds `pilot.js` (API) and `pilot-auto.js` (self-mounting). |
| `@pilot/protocol` | [packages/protocol](../packages/protocol) | Shared `ChangeSet` types, `formatPrompt()`, `BRIDGE_VERSION`. |
| `@pilot/cli` | [packages/cli](../packages/cli) | The `usepilot` command: `init` (sets Pilot up in a project for any agent: [init.ts](../packages/cli/src/init.ts)), `mcp` (the MCP server agents start, and the hub the page talks to) and `setup` (the `/pilot` skill and MCP server for Claude Code, for this machine or, with `--project`, for the repo: [setup.ts](../packages/cli/src/setup.ts)). Bundled into one file by tsup, dependencies included. |
| `usepilot` | [packages/usepilot](../packages/usepilot) | The one published package: the overlay's build (`dist/`) and the CLI's (`cli/`), copied in by its `build` script (which `prepack` runs), hand-written types (`types/`), and npm's README. Exports `usepilot` (`mountPilot`) and `usepilot/auto` (mounts with defaults). |
| `playground` | [apps/playground](../apps/playground) | A plain Vite page for developing Pilot. |
| `/pilot` skill | [skills/pilot](../skills/pilot) | What Claude Code follows to launch Pilot and apply jobs (`/pilot`). `init` and `setup` install it; other agents get the same loop from the MCP server's instructions. |

The workspace packages (`@pilot/overlay`, `@pilot/protocol`, `@pilot/cli`) are internal and never published under those names: `usepilot` bundles them.

## The playground

`pnpm dev` starts it at http://localhost:5180 (not Vite's default 5173, which other projects may use). Launch Pilot with Option+P or the dashed **Simulate /pilot** button.

**Designing the dialog.** Saving a CSS file reloads the page, which normally closes everything. To keep the dialog on screen while styling it, the playground mounts Pilot with a `dev` option ([apps/playground/src/main.ts](../apps/playground/src/main.ts)):

```ts
mountPilot({ dev: { select: ".button--primary" } });
```

On every load this launches Pilot (even after a Quit), turns on select mode, and selects the first element matching `select`. Add `query: "padding"` to pre-fill the search and open that editor. Remove `dev` for the real flow.

## Trying Pilot in your own projects, unreleased

To use the Pilot you're working on in another project without publishing a version:

1. **Link the project, once:** `pnpm link-experiment <project folder>` ([scripts/link-experiment.mjs](../scripts/link-experiment.mjs)). Its `.mcp.json` then starts Pilot's MCP server from this repo's build (`node packages/cli/dist/index.js mcp`, other servers kept), and its `/pilot` skill becomes a link to [skills/pilot](../skills/pilot). It prints the loader line for the app:

   ```js
   if (import.meta.env.DEV) {
     import(/* @vite-ignore */ "http://localhost:5199/src/auto.ts").catch(() => import("usepilot/auto"));
   }
   ```

   The app loads the overlay from this repo when its dev server runs, the npm package when it doesn't, so the line can stay. Keep a single Pilot loader in the app: two would mount whichever loads first.
2. **While you work:** `pnpm dev:experiments` here. It serves the overlay's source on port 5199 (the overlay's own Vite config, with CORS) and rebuilds the CLI on every change (`tsup --watch`).
   - Page changes (toolbar, editors, dialog) show in the project on save, with hot reload.
   - Server changes (hub, tools) need the agent to reconnect the `pilot` MCP server, or a new chat. The watcher only sees the CLI's own files: after a change in `packages/protocol` (the prompts), run `pnpm --filter @pilot/cli build`.
   - Skill changes apply from the next chat. A user-wide skill (`~/.claude/skills/pilot`, from `usepilot setup`) is loaded instead of the project's, so while you develop, make it a link too: `ln -s <this repo>/skills/pilot ~/.claude/skills/pilot`. `usepilot setup` later replaces the link with a copy of the published skill (it never writes through a link into this repo).
3. **Back to the published package:** `pnpm link-experiment <project folder> --unlink` (`npx -y usepilot mcp`, and a copy of the skill), and drop the `5199` import from the loader.

**The responsive lab.** `../pilot-lab-responsive`, next to this repo (its own git repository, linked as above): a small Vite + Tailwind marketing page designed for a 1280px desktop only, to try **Make responsive**. Only its Features grid is responsive (`sm:` / `lg:`), the pattern an agent should find and follow; the header, hero, stats, pricing, dashboard (fixed sidebar, wide table), team, call to action and footer break below desktop widths. Start it with the `lab-responsive` entry in `.claude/launch.json` (port 5183) or `npm run dev` there; `npm run reset` there puts the page back after a test. Run `/pilot` in a chat opened in that folder.

## Releasing `usepilot`

The published package is [packages/usepilot](../packages/usepilot). Publishing builds it first (`prepack` runs the build and copies `dist/`, `cli/` and the license in).

1. Bump the version in [packages/usepilot/package.json](../packages/usepilot/package.json) (0.x for now: a patch for fixes, a minor for new features and for a new bridge version, which older Pilots can't join), or run `npm version patch --no-git-tag-version` there. Set the same version on the MCP server in [mcp.ts](../packages/cli/src/mcp.ts) (`new McpServer({ name: "pilot", version })`).
2. Publish, from that folder (it asks for your npm security key):

   ```bash
   cd packages/usepilot && npm publish
   ```

3. Commit the version bump.

npm can take a minute or two to show a new version. Users update with `npm install -D usepilot@latest`. A published version can't be changed or reused: fix forward with a new version. To try the package before publishing, `npm pack` makes the tarball, and a separate app installs it with `npm install -D <path to the .tgz>`.

**Install steps live in two places:** the root [README](../README.md) (GitHub) and [packages/usepilot/README.md](../packages/usepilot/README.md) (npm's page). Change both together.

**Names:** Pilot is published as one package, `usepilot` (the plain `pilot` name on npm is an abandoned 2011 library). The npm organization `usepilot` reserves the `@usepilot/…` scope in case Pilot is ever split into several packages. The site will be `usepilot.design`.

## Styling

Pilot's styles are plain CSS, one file per component, combined at build time into a single `<style>` injected into Pilot's Shadow DOM.

```
packages/overlay/src/ui/
  App.tsx           composes the UI
  fonts.ts          registers Geist and Geist Mono
  px.ts             inline-style unit helper
  styles/
    index.css       entry: layer order + @imports
    tokens.css      design tokens (the project owner's)
    base.css        resets + shared building blocks (.surface, .field-box)
  components/
    <Name>/         <Name>.tsx + <Name>.css, one folder per component
```

To add a component, create `components/<Name>/<Name>.tsx` and `<Name>.css`, then add one `@import` line to [styles/index.css](../packages/overlay/src/ui/styles/index.css). Editors follow the same pattern under `src/editors/<name>/`.

- **Tokens are the project owner's.** [tokens.css](../packages/overlay/src/ui/styles/tokens.css) holds every `--plt-*` token, declared on `.root` (Pilot's container inside the Shadow DOM): color themes (light, plus dark via `prefers-color-scheme`), type scale, spacing, radius, shadow, sizes, z-index. Agents ask before any edit to it. Tokens hold only the shared part of a value: `--plt-shadow-lg` is drop shadows only, and each component adds its own inset ring.
- **Use only defined tokens, otherwise raw values.** A component may use a `var(--plt-*)` only if `tokens.css` defines it; when no token fits, write the raw value (`8px`). An undefined token causes no error, the property just silently gets no value, so `pnpm test` fails on any `var(--plt-…)` that `tokens.css` doesn't define ([tokens.test.ts](../packages/overlay/src/ui/styles/tokens.test.ts)).
- **Layers decide which rule wins.** The order is `@layer tokens, base, components`, and later layers win: a component rule always beats a base rule, whatever the specificity.
- **`@scope` isolates components.** Each component file wraps its rules in `@scope (.component-root) { … }`, so inner class names can stay short (`.button`, `.label`). Containers that host editors stop at the editor boundary, `@scope (.property-search) to (.editor)`, so their rules never leak into an editor.
- **Variants are attributes**, e.g. `data-variant="hover"` or `aria-pressed="true"`, styled as `:scope[data-variant="hover"]`.
- **Tokens are protected from the page.** CSS variables inherit into a Shadow DOM, and page CSS can set them on the `<pilot-root>` host, which beats `:host` declarations. So tokens are declared on `.root`, which page CSS can't reach. The short `--plt-` prefix (like Tailwind's `--tw-`) also means no site variable shares a name, so a missing token can't silently pick up a page value.
- **Sizes are in px, not rem.** Inside a Shadow DOM, `rem` still follows the host page's `<html>` font size, which Pilot doesn't control. Preact 11 doesn't add `px` to numeric inline styles: pass strings, with `px()` from `ui/px.ts`.
- **Native CSS nesting** (`&:hover`) is fine. The build flattens it.
- **Typography is set once on `.root`** (family, size, line height, OpenType features); components only change what differs.
- **No Tailwind**, for now. If revisited: Tailwind v4's `@property` rules are ignored inside a Shadow DOM, so shadow, ring and transform utilities need a workaround.

### Fonts

Pilot's font is **Geist** (variable). It replaced Geist Mono, which made the UI read like code; Geist reads as UI text and fits more of a label in a row. **Geist Mono** (`--plt-font-mono`) is for code only: inline code and code blocks in the agent's replies.

- **No network request.** The woff2 files are vendored in [packages/overlay/src/assets/fonts](../packages/overlay/src/assets/fonts) and inlined into the bundle as a data URL: no Google Fonts or CDN. They come from Vercel's `geist` npm package (v1.9.2) under the SIL Open Font License, whose file sits next to them.
- **Registered from JavaScript, not CSS.** [ui/fonts.ts](../packages/overlay/src/ui/fonts.ts) registers them with the FontFace API (`document.fonts`): browsers don't reliably apply `@font-face` inside a Shadow DOM, and this way Pilot adds no `<style>` to the host page.
- **Their own family names**, `"PLT Geist"` and `"PLT Geist Mono"`, so they never collide with a Geist the host app loads (maybe another version or subset).
- **OpenType features:** `--plt-font-features` is `normal`, Geist's defaults. Its slashed zero (`ss09`) has no tabular version, so the fields couldn't use it; value fields use tabular figures instead.
