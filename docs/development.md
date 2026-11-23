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
| `node scripts/agent-runs-check.mjs` | Checks that Pilot can run each agent's command-line tool here: a job, a resumed follow-up, what its chat would ask about (a file written outside the project) refused without the run hanging, and a skill picked from the `/` list used; the internet and shell commands shown, as the agent's settings say. `--agents claude,codex,cursor` picks them. The **Agent runs** workflow (`.github/workflows/agent-runs.yml`) runs it on Windows and Linux, with the repo secrets `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `CURSOR_API_KEY` |

Before finishing a change, run `pnpm typecheck` and `pnpm test`.

**Stack:** TypeScript (strict, ESM), Preact (small, bundled into the overlay, so it never conflicts with the host app's framework), Vite, Vitest, tsup for the CLI.

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@pilot/overlay` | [packages/overlay](../packages/overlay) | The in-page editor: Shadow DOM mount, launch/close, toolbar, property search, editors, the bridge client. Builds `pilot.js` (API) and `pilot-auto.js` (self-mounting). |
| `@pilot/protocol` | [packages/protocol](../packages/protocol) | Shared `ChangeSet` types, `formatPrompt()`, `BRIDGE_VERSION`. |
| `@pilot/cli` | [packages/cli](../packages/cli) | The `usepilot` command: with no command, Pilot for the project in its folder, running the agent's command-line tool for each job (`--agent`, `--url`: [run.ts](../packages/cli/src/run.ts), [agents.ts](../packages/cli/src/agents.ts); [handoff.md](handoff.md), *Agent runs*), `init` (sets Pilot up in a project, checks the agent's tool, removes the old chat setup: [init.ts](../packages/cli/src/init.ts), [legacy.ts](../packages/cli/src/legacy.ts)) and `update` (brings it up to date: [update.ts](../packages/cli/src/update.ts)); `mcp` only tells an old chat setup what to do instead. Bundled into one file by tsup, dependencies included. |
| `usepilot` | [packages/usepilot](../packages/usepilot) | The one published package: the overlay's build (`dist/`) and the CLI's (`cli/`), copied in by its `build` script (which `prepack` runs), hand-written types (`types/`), and npm's README. Exports `usepilot` (`mountPilot`) and `usepilot/auto` (mounts with defaults). |
| `playground` | [apps/playground](../apps/playground) | A plain Vite page for developing Pilot. |

The workspace packages (`@pilot/overlay`, `@pilot/protocol`, `@pilot/cli`) are internal and never published under those names: `usepilot` bundles them.

## The playground

`pnpm dev` starts it at http://localhost:5180 (not Vite's default 5173, which other projects may use). Launch Pilot with Option+P or the dashed **Launch Pilot** button (it opens Pilot as `npx usepilot` starting for the site does). To send jobs, run Pilot for it: `node packages/cli/dist/index.js --url http://localhost:5180` in `apps/playground`, after `pnpm --filter @pilot/cli build` (the agent edits the playground's files: put them back with git after).

**Designing the dialog.** Saving a CSS file reloads the page, which normally closes everything. To keep the dialog on screen while styling it, the playground mounts Pilot with a `dev` option ([apps/playground/src/main.ts](../apps/playground/src/main.ts)):

```ts
mountPilot({ dev: { select: ".button--primary" } });
```

On every load this launches Pilot (even after a Close), turns on select mode, and selects the first element matching `select`. Add `query: "padding"` to pre-fill the search and open that editor. Remove `dev` for the real flow. In the playground, `?select=<selector>` in the URL selects another element instead (`/?select=.review-props`), and stays across reloads.

## Trying Pilot in your own projects, unreleased

To use the Pilot you're working on in another project without publishing a version:

1. **Link the project, once:** `pnpm link-experiment <project folder>` ([scripts/link-experiment.mjs](../scripts/link-experiment.mjs)). It prints the loader line for the app, and the command that runs Pilot for the project from this repo's build (`node <this repo>/packages/cli/dist/index.js`, in place of `npx usepilot`). It also removes the project's links to the old chat setup, if any.

   ```js
   if (import.meta.env.DEV) {
     import(/* @vite-ignore */ "http://localhost:5199/src/auto.ts").catch(() => import("usepilot/auto"));
   }
   ```

   The app loads the overlay from this repo when its dev server runs, the npm package when it doesn't, so the line can stay. Keep a single Pilot loader in the app: two would mount whichever loads first.
2. **While you work:** `pnpm dev:experiments` here. It serves the overlay's source on port 5199 (the overlay's own Vite config, with CORS) and rebuilds the CLI on every change (`tsup --watch`).
   - Page changes (toolbar, editors, dialog) show in the project on save, with hot reload.
   - Changes to Pilot's process (the runner, the hub, the prompts) need that command restarted. The watcher only sees the CLI's own files: after a change in `packages/protocol` (the prompts), run `pnpm --filter @pilot/cli build`.
3. **Back to the published package:** `pnpm link-experiment <project folder> --unlink`, drop the `5199` import from the loader, and run `npx usepilot`.

**The responsive lab.** `../pilot-lab-responsive`, next to this repo (its own git repository, linked as above): a small Vite + Tailwind marketing page designed for a 1280px desktop only, to try **Make responsive**. Only its Features grid is responsive (`sm:` / `lg:`), the pattern an agent should find and follow; the header, hero, stats, pricing, dashboard (fixed sidebar, wide table), team, call to action and footer break below desktop widths. Start it with the `lab-responsive` entry in `.claude/launch.json` (port 5183) or `npm run dev` there; `npm run reset` there puts the page back after a test. Run Pilot for it from that folder (`npx usepilot`, or this repo's build as above).

**The React lab.** `../pilot-lab-react`, next to this repo (its own git repository, linked as above): a studio dashboard made of reusable React 19 components with props, most used several times (`ProjectCard`, `PlanCard`, `StatCard`, `Button`, `Badge`, `NavItem`…). Use it to try what depends on components: the component label, Select similar, `/props`, look-alikes and source hints in jobs. It also has design tokens as CSS variables on scales (spacing, radii, type, colors) and a W3C token file (`tokens/brand.tokens.json`), grid and flex layouts, hover states and text to edit. Pilot's toolbar shows as soon as the page loads (`mountPilot({ launch: true })`), so you can start designing before Pilot runs for it. Start it with the `lab-react` entry in `.claude/launch.json` (port 5187) or `npm run dev` there. `npm run reset` there puts the app back after a test. Run Pilot for it from that folder (`npx usepilot`, or this repo's build as above).

## What each agent does that Pilot relies on

Pilot runs other people's command-line tools, and an update of one can change how it behaves. Two checks keep that in view:

- **Pilot's side, automatically:** [run.test.ts](../packages/cli/src/run.test.ts) (part of `pnpm test`) drives the runner with a stand-in agent through a real hub and a page: a job and its reply, a thread's session resumed, a question from the `pilot` block, a retry, a sign-in error, Stop, two jobs at once. [agents.test.ts](../packages/cli/src/agents.test.ts) reads output recorded from the real tools.
- **The agents' side, on every platform:** `node scripts/agent-runs-check.mjs` here, and the **Agent runs** workflow on Windows and Linux: a job, a resumed follow-up, and what its chat would ask about refused without hanging. A tool that behaves differently gets its entry in `AGENTS` ([agents.ts](../packages/cli/src/agents.ts)) changed.

| What the tool does | Agent | What depends on it |
| --- | --- | --- |
| One task and exit, the prompt on stdin, JSON lines out | `claude -p --output-format stream-json --verbose`; `codex exec --json -`; `cursor-agent -p --output-format stream-json` | `args` and `parse` per agent |
| A session id in its output, resumed by id | `session_id`; `thread.started`'s `thread_id`, `codex exec resume <id>`; `session_id` | thread sessions (`sessionToResume`) |
| The agent's own permissions; what would ask is refused, never skipped | `--permission-mode acceptEdits` (`-p` refuses what would prompt); `-s workspace-write`, on Windows `windows.sandbox="unelevated"`; `--sandbox disabled` (allowlist mode, never `--force`: its sandbox isn't on Windows) | the README's promise |
| Its sign-in check | `claude auth status` (`loggedIn`); `codex login status` (exit code); `cursor-agent status` | `detectAgents`, `init` |
| Runs outside a git repository | yes; only with `--skip-git-repo-check`; yes | Codex's flags |
| Its last message is the reply | the last `assistant` message; the last `agent_message`; the last `assistant` message (its `result` joins them all) | the notes |

**The smoke test, about 5 minutes per agent,** in a project with Pilot (the playground, or a lab), with the version about to be released (`pnpm link-experiment`, or the packed tarball):

1. Set up or update: `npx usepilot init` (or `update`), then do what it prints.
2. Run Pilot for the project (`npx usepilot --agent <agent>`): the toolbar opens in the page.
3. Select, edit, Send: the terminal shows the job, the agent applies it, and the change's preview goes once the code has it.
4. Two Sends on different elements: both run at once.
5. A comment, then "a bit more" in its thread: the second resumes the first's session (same id), and the agent knows what "more" means.
6. Stop a job from its loader: the terminal says it stopped.
7. Sign the agent out (or pass an agent that isn't installed): the toolbar says what to run.

## Measuring the code search

`locate.accuracy.test.ts` (in the overlay's `dom/`) scores Pilot's code search ([handoff.md](handoff.md), *Finding the code, and the time*) on real pages: right, one of two, wrong, or silent, and how long each search takes. It's skipped in `pnpm test`; it runs when `LOCATE_PAGES` names the pages, `"<project folder>|<page.html>@<its url>,…;<another project>|…"`, with the report in the file `LOCATE_OUT` names (each wrong answer, and a sample of silent ones). `LOCATE_DEBUG=<part of a class list>` adds the best places for those elements and what each matched.

The pages are saved HTML, rendered from a copy of the project whose every tag carries its file and line (`data-src=<file>:<line>`, unquoted so PHP strings stay valid). The test removes the labels before Pilot describes the elements, so the search never sees them, and checks each answer against them. A PHP site renders from the command line (`php` with `$_GET` set and the site's `index.php` included); a static site's labeled HTML file is the page. Never label the project itself: copy it first.

`styles.accuracy.test.ts` (in the CLI) scores where Pilot finds a value's rule in the project's stylesheets (`styles.ts`), on a project whose compiled CSS sits beside its Sass (`css/X.css` from `scss/X.scss`): each compiled rule should be found in a Sass file of the same folder, never in the compiled CSS or another site's copy. It runs when `STYLES_ROOT` names the project, with the report in `STYLES_OUT`.

## Releasing `usepilot`

The published package is [packages/usepilot](../packages/usepilot). Publishing builds it first (`prepack` runs the build and copies `dist/`, `cli/` and the license in).

1. Bump the version in [packages/usepilot/package.json](../packages/usepilot/package.json) (0.x for now: a patch for fixes, a minor for new features and for a new bridge version, which older Pilots can't join), or run `npm version patch --no-git-tag-version` there. Set the same version in [version.ts](../packages/cli/src/version.ts) (`VERSION`: `update` and `init` compare with it); `version.test.ts` fails until both match.
2. Run the smoke test ([What each agent does that Pilot relies on](#what-each-agent-does-that-pilot-relies-on)) in the clients you can, with this version; fix what breaks first.
3. Publish, from that folder (it asks for your npm security key):

   ```bash
   cd packages/usepilot && npm publish
   ```

4. Commit the version bump.
5. **Tag it and publish it on GitHub**, right after npm, without being asked: an annotated tag `vX.Y.Z` on the version-bump commit (`git tag -a vX.Y.Z <commit> -m "usepilot X.Y.Z"`, pushed), then a release from it (`gh release create vX.Y.Z --verify-tag --title vX.Y.Z --notes-file …`). The notes are written for users, not copied from commits: a few bullets on what's new since the last release, in plain language, and an **Update every agent** line when the bridge version changed (older Pilots can't join the hub). Only versions published on npm get one.

npm can take a minute or two to show a new version. Users update with `npm install -D usepilot@latest`. A published version can't be changed or reused: fix forward with a new version. To try the package before publishing, `npm pack` makes the tarball, and a separate app installs it with `npm install -D <path to the .tgz>`.

**Install steps live in two places:** the root [README](../README.md) (GitHub) and [packages/usepilot/README.md](../packages/usepilot/README.md) (npm's page). Change both together.

**Names:** Pilot is published as one package, `usepilot` (the plain `pilot` name on npm is an abandoned 2011 library). The npm organization `usepilot` reserves the `@usepilot/…` scope in case Pilot is ever split into several packages. The site will be `usepilot.design`.

## Styling

Pilot's styles are plain CSS, one file per component, combined at build time into a single `<style>` injected into Pilot's Shadow DOM. The build minifies it with esbuild, not lightningcss (Vite's default here): lightningcss rounds big numbers to six digits, which made the highlight and UI layers equal in every release up to 0.6.0, so highlights drew over Pilot's buttons and panels. The playground runs the unminified source, so it never showed; `tokens.test.ts` checks the setting.

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

### Scrolling

Everything in Pilot that scrolls draws Pilot's own thumb, never the browser's scrollbar ([ScrollThumb](../packages/overlay/src/ui/components/ScrollThumb/ScrollThumb.tsx)): the property list, the comment thread and its field, the DOM tree, the select menus, the variables list. A native scrollbar takes room on Windows and Linux and looks different in every browser. The pattern: the scrolling element hides its scrollbar (`scrollbar-width: none`, and `::-webkit-scrollbar { display: none }`), and sits at the top of a positioned box that doesn't scroll, which holds the `<ScrollThumb target={…} />` over its right edge.

### Fonts

Pilot's font is **Geist** (variable). It replaced Geist Mono, which made the UI read like code; Geist reads as UI text and fits more of a label in a row. **Geist Mono** (`--plt-font-mono`) is for code only: inline code and code blocks in the agent's replies.

- **No network request.** The woff2 files are vendored in [packages/overlay/src/assets/fonts](../packages/overlay/src/assets/fonts) and inlined into the bundle as a data URL: no Google Fonts or CDN. They come from Vercel's `geist` npm package (v1.9.2) under the SIL Open Font License, whose file sits next to them.
- **Registered from JavaScript, not CSS.** [ui/fonts.ts](../packages/overlay/src/ui/fonts.ts) registers them with the FontFace API (`document.fonts`): browsers don't reliably apply `@font-face` inside a Shadow DOM, and this way Pilot adds no `<style>` to the host page.
- **Their own family names**, `"PLT Geist"` and `"PLT Geist Mono"`, so they never collide with a Geist the host app loads (maybe another version or subset).
- **OpenType features:** `--plt-font-features` is `normal`, Geist's defaults. Its slashed zero (`ss09`) has no tabular version, so the fields couldn't use it; value fields use tabular figures instead.
