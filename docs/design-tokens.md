# Design tokens in Pilot (in part planned)

> Status: **reading the page's tokens is built**, for the comment box's `@` mentions ([handoff.md](handoff.md), *Mentions*): `pageTokens()` in [dom/tokens.ts](../packages/overlay/src/dom/tokens.ts) collects the root's CSS variables, live, with their values and kinds. The rest is planned: fields offering tokens, steps along the scale, and tokens that only live in code (read by the hub, then listed in `@` too). When a part is built, move it into the docs for its area (see [README.md](README.md)) and trim this note to what's still open.

## Goal

When a project has tokens (colors, a type scale, spacing…), Pilot should know them and use them:

- **Fields offer tokens.** Typing in a color or font-size field suggests matching tokens, the way `from-` suggests the window width in the search. Picking one writes `var(--color-primary)`.
- **Steps and drags follow the scale.** ↑/↓ and scrubbing a spacing field move along the token scale (4 → 8 → 12 → 16), not 1px at a time.
- **Fields name what they show.** Declared values already keep `var(--space-4)` as written. With the token list, a raw `16px` can also show which token it matches.
- **The agent gets names, not guesses.** Today `formatPrompt()` says "prefer a token within a pixel or two". With tokens, the change set says `--color-primary` directly, which the agent translates to the project's form (`bg-primary` in Tailwind).
- **The preview needs nothing new.** `var(--…)` resolves on the page, in the preview stylesheet too, including under the page's own dark mode.

## Where tokens come from

Two sources, in this order.

### 1. CSS custom properties: live, no setup (build first)

Covers most modern stacks: Tailwind v4's `@theme`, shadcn/ui, Open Props, design systems built on CSS variables.

- **Collect** the `--*` declarations while walking the page's stylesheets (`dom/declared.ts` already walks them all, `@import`s and layers included), mainly those on `:root`, `html` and `:host`.
- **Resolve** their current values with `getComputedStyle(document.documentElement)`.
- **Group** them by what the value is: colors, lengths, font stacks, numbers. Name prefixes (`--color-*`, `--text-*`, `--spacing-*`) help, but the value decides.
- **Live:** read again whenever needed (as the breakpoints are, `dom/breakpoints.ts`), never stored. A token changed or renamed in the project shows after hot reload.

Things to handle:

- **Tailwind v4 only outputs the variables the page uses**, so the scale may have gaps (unless the project uses `@theme static`).
- **Scoped tokens:** variables defined on a component rather than `:root`.
- **Themes:** a token with other values under `.dark`, `[data-theme]` or `prefers-color-scheme`.
- **Volume:** Tailwind and shadcn define many variables. Filter by type for each field, and don't list them all.

### 2. Tokens that only live in code: the bridge watches the files (with the bridge)

Tailwind v3's `tailwind.config.js`, a `tokens.json`, Style Dictionary sources, a TypeScript theme. These never reach the browser in a readable form.

- **Not a snapshot from the agent.** If the agent read the files and sent a list, it would be a snapshot, and while it's waiting for edits (`pilot_wait_for_edits`) it can't re-read anything.
- **Instead, the bridge watches the files.** `pilot mcp` is a Node process on the developer's machine: it watches the token files, parses them, and pushes updates to the overlay over its localhost connection, live.
- **The agent's part is a one-time setup:** during `npx pilot init`, it finds where the tokens live and their format, and writes that into Pilot's config.
- **Formats:** JSON-based (the W3C design-tokens format, Style Dictionary sources, a plain `tokens.json`) is easy to parse. JS/TS configs (Tailwind v3) need executing, which is riskier (they can import anything) but workable, as Tailwind's own tooling does.
- **Often not needed:** many of these systems also compile to CSS variables (Style Dictionary usually does, Tailwind v3 can). Then source 1 covers them.
- **Fallback:** a snapshot sent by the agent only for formats the bridge can't parse.

## A token renamed while edits are pending

Reading isn't the issue (tokens are read live). The issue is an edit made with a token, not handed off yet, when the token is renamed (`--brand` → `--primary`):

- **The preview breaks:** `var(--brand)` no longer resolves, so the browser drops the declaration and the element shows its inherited or default value, with no clue why.
- **The change set points to a token that's gone.**

Planned handling:

- **Record the value with the name:** the change keeps `var(--brand)` and its value when set (`#3b82f6`), so the agent has the intent and the actual value.
- **Check that referenced tokens still exist** whenever the dialog shows or the change set is built. A missing one flags the change ("`--brand` no longer exists"). If a current token has the same value (`--primary: #3b82f6`), offer to swap it in with one click.

This is rare in practice: renames usually happen when the agent applies the change set, and by then the pending edits are already in the source.

## Open questions (for the project owner)

- **How a token picker looks** in each editor. The search-and-type flow suggests autocomplete in the field over a palette panel, but it's a design decision.
- **Raw values vs tokens:** keep both equally, or nudge toward a token when one exists (or is close)?
- **Themes:** how to show a token whose value differs between light and dark.
- **Which tokens per editor:** e.g. does a padding field offer every length token, or only the spacing scale?

## Suggested first step

The plumbing only, no visuals: collect the page's custom properties, group them by type, and show what the playground and a real project (Tailwind v4, shadcn) would offer. Then decide the editors' design with that list in hand.
