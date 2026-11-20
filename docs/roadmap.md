# Roadmap

One line per item. Tick it when it ships; the details go in the doc for its area.

## Next

- [x] **One description of what Pilot is, everywhere:** "Design in your running app. Your agents write the code." in both READMEs, `usepilot help`, product.md and the loop diagram.

## Foundation

- [x] pnpm monorepo, TypeScript, Vite, Vitest
- [x] Overlay mounts in Shadow DOM, dormant until launched
- [x] Launch / Quit, running state kept per tab
- [x] Toolbar: comment, select, Send with its count, jobs with their count, quit (designed)
- [x] `ChangeSet` model and `formatPrompt()`
- [x] Property search ranking
- [ ] Visual design: property search, selection highlight

## Editing

- [x] Element selection: hover highlight and label, click to select (page clicks blocked), Esc to clear
- [x] Distances (Alt held, as in Figma): red lines and values from the selection to the hovered element, or to its parent
- [x] Hover label: name (id, naming data attributes, form field name, tag; never classes or text) and size; none on the selection
- [x] Component names in the label (React, Vue), before the id: a component's top-level element by its name
- [x] Several elements: Shift+click on the page, Cmd/Ctrl+click and Shift+click ranges in the DOM tree; the dialog edits them all (one undo step, one job), Mixed for differing values
- [x] Comments and tasks on several elements: one job, the thread on the first one, loaders on all
- [ ] The width check of a task on several elements measures each one, not only the first
- [x] Select similar: a corner action that selects the same part in every copy of the repeated unit (a look-alike ancestor, from the page's structure), with the count in its tooltip
- [x] Select similar by component instance (React, Vue), whatever the instances' props
- [ ] Svelte and Angular components (Svelte 5's `__svelte_meta`, Angular's `ng.getOwningComponent`)
- [x] The agent asks "all of them or only this one?" in a comment when the code is shared and only some copies were changed (Pilot counts each element's look-alikes); the answer sends the job back
- [ ] Selection actions: select parent / first child. (No scope control: Select similar says "all of them" up front, and the agent asks when only some copies of shared code were changed.)
- [ ] Parent/child navigation for the selection (picking the wrapper instead of the text inside it)
- [x] Property dialog next to the selection: spot picked once, fixed while editing, moves with scroll, stays on screen, draggable
- [x] Dialog = search + the matching editors: best matches plus their family, Tab across all of them
- [x] Footer with a contextual key hint
- [x] Keyboard loop: Tab/Enter into the editor (focus picked from the alias), Enter back to the search, Esc one level at a time
- [ ] Typing a letter in a fully selected value jumps back to the search (experiment)
- [x] `describeElement()`: unique selector, DOM path, text snippet
- [x] Declared values: fields show the CSS that applies from any source
- [x] The empty search lists the editors of the properties the element sets, grouped, in `LIST_ORDER`
- [x] Viewport widths: the ruler, the width chip, widths per change in the history and the prompt
- [x] Element states: `hover:`, `focus:`, `focus-visible:`, `active:` pills, the element shown in those states, states per change
- [x] The `/` menu of modifiers
- [x] DOM tree (plumbing; design pending)
- [x] Preview from a stylesheet Pilot adds (`@layer` + `!important`, `@media` per width range)
- [x] The page's breakpoints on the ruler, clickable
- [ ] `from-md` in the search (breakpoint names, where the page exposes them)
- [x] Undo/redo for every change, drags as one step
- [x] Change set from the history (`buildChangeSet()`), Copy prompt
- [x] Edits survive reloads
- [x] Inline text editing: a text-only element whole, or the text run under the pointer
- [ ] Change list in the panel (review and undo before handoff)
- [ ] Designer note field
- [x] `@` in the comment box: the page's tokens (its CSS variables), components and named elements, sent as exact references ([handoff.md](handoff.md), *Mentions*)
- [x] `@` lists the project's components too (read by the agents' server, kept current), and typed `@names` count; each mention tells the agent where it is
- [x] `/props`: the agent lists a component's props, the designer picks values in the thread, the agent sets them on that instance, Pilot checks them on the page
- [x] Props: each component's list remembered (shown at once, refreshed by the agent behind)
- [ ] Props: several instances at once, and the owner's design for the rows
- [x] Variables in the property fields: the page's tokens that fit, by `--` at the caret or the variable button ([property-dialog.md](property-dialog.md), *Variables*)
- [x] Design tokens: a token-bound field steps along its scale (↑/↓, the wheel), else from the computed value; the list and the button approved
- [x] The wheel steps a field being edited, like ↑/↓
- [x] A property's menu (right-click its name): Copy CSS, Copy properties, Paste properties, for that row ([property-dialog.md](property-dialog.md), *Copy and paste*)
- [ ] Design tokens: a plain number stepping to the scale's values, scrubbing along it ([design-tokens.md](design-tokens.md))

### Property editors

- [x] Layout: display (with its grid and flex rows), float, width, height and their min/max, size, aspect-ratio, box-sizing, padding, margin, overflow, overscroll-behavior, order, flex-grow, flex-shrink, flex-basis, align-self, justify-self, col-span, col-start, col-end, row-span, row-start, row-end, object-fit, object-position
- [x] Grid and flex rows: grid-columns, grid-rows, gap, justify-content, justify-items, align-items, align-content, flex-direction, flex-wrap
- [x] Position: position (with inset), inset, z-index, isolation
- [x] Appearance: background color, border radius, opacity, mix-blend-mode, background-blend-mode
- [x] Typography: color, font-family, font-size, font-style, font-weight, font-variant-numeric, line-height, letter-spacing, text-align, text-decoration-line, text-decoration-color, text-decoration-style, text-decoration-thickness, text-underline-offset, text-transform, text-indent, vertical-align, text-wrap, white-space, text-overflow, line-clamp, list-style-type, list-style-position
- [x] Interactivity: cursor, pointer-events, user-select, appearance, will-change
- [x] SVG: fill, stroke, stroke-width
- [x] Visibility: visibility
- [ ] Border: a new component is being designed
- [ ] Inset areas on the page (none designed)
- [x] mask-composite
- [x] mask-image: chips and + in the row, a panel per mask (PropertyPanel), linear (sides, corners, axes, angle) and radial (nine positions) fades, custom and none; mask-composite: intersect with them
- [ ] Clip-path and other properties about what's drawn

## Handoff

Next (found testing in Cursor: jobs queued forever while the connected chat had stopped waiting for them):

- [x] **Say when the agent isn't listening**, and when no agent is connected or the hub is gone (the owner's design: red pills, the corner's warning, a red reply); a job whose agent left goes back to the queue.
- [x] **Work from the project, not the agent's start folder:** `pilot_launch` takes the project's `folder` (every agent is told to pass it), or the client's MCP roots; Cursor starts machine-level servers in the home folder.
- [x] **Restarting the server, per client:** `update` says how for each agent Pilot is set up for (a new chat in Claude Code and Codex; restart the server in Cursor and VS Code), and `pilot_launch` notices a server older than the project's Pilot.
- [x] **What each client does that Pilot relies on:** a checklist and a 5-minute smoke test per client in [development.md](development.md), run before each release; and `stdio.test.ts`, the built CLI driven over stdio by the official MCP client (launch, a batch, done, a wait that runs out).

- [x] Copy prompt
- [x] Launch shortcut (Option+P / Alt+P)
- [x] `usepilot mcp`: MCP server and localhost hub in one process; several agents share one hub, with takeover
- [x] `pilot_launch`, `pilot_wait_for_edits`, `pilot_done` and the `/pilot` skill
- [x] Send as jobs: queued while the agent works, routed by page origin
- [x] The check after done: what landed settles, what didn't goes back once, then Pilot accepts the code
- [x] Make responsive: a task job with its own prompt
- [x] Actions in the comment box's `/` menu (Make responsive first), off the selection's corner; the reply comes back in the thread
- [x] Break and fix: the agent stress-tests an element with odd content and fixes what breaks
- [ ] Break and fix checked by Pilot itself: the width check with long text put in its copy of the page, ellipses counted as fixes
- [ ] More `/` actions, and the menu's design (placeholder look now)
- [x] Pilot's width check (`pilot_check_widths`): a copy of the page in one hidden frame, the designer's width compared before and after, one follow-up after done
- [x] Basic and advanced jobs: edits go fast, advanced tasks to a more capable model where the agent can
- [x] Comments, phase 1: the Comment tool and widget, a thread per element, the agent's notes as replies, unresolved threads marked on their elements
- [x] Design the comment widget
- [x] Selection kept across tools, Option+C / Option+V
- [x] Elements being worked on: outline and loader, Send holds their changes, comments wait
- [x] Threads that need you: the corner icon, the Comment button's count goes to the next one
- [x] The jobs button goes to the next job; jobs cancelled from their loader; the job list hidden
- [ ] Preferences panel: change or remove Pilot's shortcuts
- [ ] Send in the property dialog for the element's changes
- [x] A comment carries the element's unsent changes (a chip in the box; applied and checked with it)
- [x] Comment attachments (images, text files, PDFs): picked, previewed, sent with the comment or alone, saved by the hub in the OS temp folder, shown to the agent with the job
- [ ] Design the file tile for attachments that aren't images (placeholder now)
- [ ] `/` actions listed as previews, to build: Fit its container (container queries), Check accessibility, Explore variations, Use design tokens, Add states, Support dark mode, Add motion ([handoff.md](handoff.md), *Actions*)
- [ ] Element markers for unsent changes
- [x] Comments, phase 2: the agent asks the designer a question in a thread, without waiting (`pilot_done`'s `question`), and the answer sends the job back
- [x] Faster jobs: Pilot finds each element's code in the project for the agent, the edit guidelines read once, each job's step times recorded
- [x] Jobs queued for a page come in one wait, so several Sends cost one round trip (each still its own job)
- [x] Source hints (`target.source`): the component and its file from React (line too in React 18 and earlier) and Vue in development, so agents open the right file without searching
- [x] Source hints under Turbopack and for Server Components, and lines for React 19: the CLI finds the component's declaration by name in the project, then the element's line in it
- [x] Next.js App Router (Server Components, Turbopack): components from React's records of them, never the framework's own components
- [ ] A history of the session's jobs (what changed, how it landed, files touched, a summary to copy), in place of the job list
- [ ] Design the Send states and the job status (placeholder look now)
- [x] Token files that only live in code (`tokens.json`, Style Dictionary, Sass variables), read by Pilot's server, in the fields' variables and `@` ([property-dialog.md](property-dialog.md), *Variables*)
- [ ] Tailwind v3 configs' tokens (JavaScript: they'd have to run)
- [x] `/pilot` in any agent with skills: `init` writes the skill for Codex and Cursor (`.agents/skills`), Claude Code and Copilot

## Distribution

- [x] The name: `usepilot` on npm (package and organization), `usepilot.design` for the site
- [x] `usepilot` published, installable in Vite and Next.js apps, with the CLI (`mcp`, `setup`)
- [x] `npx usepilot init`: one prompt for any agent; installs, registers the MCP server for Claude Code, Cursor and VS Code (Codex by `codex mcp add`)
- [x] `npx usepilot update`: the latest package and skill, and what to restart, adds the skill, and tells the agent where to load Pilot

## Open questions

- Which property editors ship in v1, and how should related properties be grouped?
- Values typed in the search (`pt-4` + Enter, Tailwind-style) are left out for now: the search only finds properties. Revisit once more editors exist.
- After a click selects an element, should select mode stay on (current behavior) or switch off so the page is interactive again?
