# Roadmap

One line per item. Tick it when it ships; the details go in the doc for its area.

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
- [x] Hover label: name (id, naming data attributes, form field name, tag; never classes or text) and size; none on the selection
- [ ] Component names in the label (React, Vue, Svelte, Angular dev info), before the id
- [x] Several elements: Shift+click on the page, Cmd/Ctrl+click and Shift+click ranges in the DOM tree; the dialog edits them all (one undo step, one job), Mixed for differing values
- [x] Comments and tasks on several elements: one job, the thread on the first one, loaders on all
- [ ] The width check of a task on several elements measures each one, not only the first
- [x] Select similar: a corner action that selects the same part in every copy of the repeated unit (a look-alike ancestor, from the page's structure), with the count in its tooltip
- [x] Select similar by component instance (React, Vue), whatever the instances' props
- [ ] Svelte and Angular components (Svelte 5's `__svelte_meta`, Angular's `ng.getOwningComponent`)
- [x] The agent asks "all of them or only this one?" in a comment when the code is shared and only some copies were changed (Pilot counts each element's look-alikes); the answer sends the job back
- [ ] Selection actions: select parent / first child, and the scope ("this element" / "all N like it")
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
- [ ] Design tokens: the page's custom properties offered in fields, steps along the scale, token names for the agent ([design-tokens.md](design-tokens.md))

### Property editors

- [x] Layout: display (with its grid and flex rows), width, height and their min/max, size, aspect-ratio, padding, margin, overflow, order, flex-grow, flex-shrink, flex-basis, col-span, col-start, col-end, object-fit
- [x] Grid and flex rows: grid-columns, gap, justify-content, align-items, flex-direction, flex-wrap
- [x] Position: position (with inset), inset, z-index, isolation
- [x] Appearance: background color, border radius, opacity
- [x] Typography: color, font-family, font-size, font-style, font-weight, line-height, letter-spacing, text-align
- [x] Visibility: visibility
- [ ] Border: a new component is being designed
- [ ] Inset areas on the page (none designed)
- [ ] Mask, clip-path and other properties about what's drawn

## Handoff

Next (found testing in Cursor: jobs queued forever while the connected chat had stopped waiting for them):

- [x] **Say when the agent isn't listening**, and when no agent is connected or the hub is gone (the owner's design: red pills, the corner's warning, a red reply); a job whose agent left goes back to the queue.
- [ ] **Work from the project, not the agent's start folder.** Cursor starts machine-level MCP servers in the home folder, so Pilot can't search the project (and labels the agent "Cursor · sebastiano"). `pilot_launch` takes the project's folder from the agent (or the client's MCP roots), for the code search and the component files.
- [ ] **Restarting the server, per client.** Cursor keeps one Pilot server for all its chats: a new chat doesn't load a new version. `update` and the README say how for Cursor (switch `pilot` off and on in its MCP settings). Part of a checklist of what each client does that Pilot relies on (long waits, background calls, servers off by default, start folder), with a smoke test per client before each release.

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
- [ ] A comment carries the element's unsent changes as an attachment (applied and checked with it)
- [x] Comment attachments (images, text files, PDFs): picked, previewed, sent with the comment or alone, saved by the hub in the OS temp folder, shown to the agent with the job
- [ ] Design the file tile for attachments that aren't images (placeholder now)
- [ ] Element markers for unsent changes
- [x] Comments, phase 2: the agent asks the designer a question in a thread, without waiting (`pilot_done`'s `question`), and the answer sends the job back
- [x] Faster jobs: Pilot finds each element's code in the project for the agent, the edit guidelines read once, each job's step times recorded
- [x] Jobs queued for a page come in one wait, so several Sends cost one round trip (each still its own job)
- [x] Source hints (`target.source`): the component and its file from React (line too in React 18 and earlier) and Vue in development, so agents open the right file without searching
- [x] Source hints under Turbopack and for Server Components, and lines for React 19: the CLI finds the component's declaration by name in the project, then the element's line in it
- [x] Next.js App Router (Server Components, Turbopack): components from React's records of them, never the framework's own components
- [ ] A history of the session's jobs (what changed, how it landed, files touched, a summary to copy), in place of the job list
- [ ] Design the Send states and the job status (placeholder look now)
- [ ] The bridge watches token files that only live in code (Tailwind v3 config, `tokens.json`, Style Dictionary) ([design-tokens.md](design-tokens.md))
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
