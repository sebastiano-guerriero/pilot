# Roadmap

One line per item. Tick it when it ships; the details go in the doc for its area.

## Next

- [x] **One description of what Pilot is, everywhere:** "Design in your running app. Your agents write the code." in both READMEs, `usepilot help`, product.md and the loop diagram.
- [ ] **Pilot runs the agent for each Send** (branch `agent-runs`), instead of a chat parked in `pilot_wait_for_edits` ([handoff.md](handoff.md), *Agent runs*). **Windows decided it** (it had to work there, or this was a dead end): Claude Code, Codex and Cursor pass on Windows, Linux and macOS.
  - [x] Tested on macOS with Claude Code, Codex and Cursor (jobs, follow-ups, two jobs at once, file and network limits); `scripts/agent-runs-check.mjs` and the Agent runs workflow
  - [x] Codex on Windows and Linux (Windows needs `windows.sandbox="unelevated"`)
  - [x] Claude Code and Cursor on Windows and Linux: Claude Code passes as is; Cursor in its allowlist mode (its sandbox isn't on Windows and fails on Ubuntu's AppArmor)
  - [x] `npx usepilot`: the runner (agent picked and saved per project, up to 3 jobs at once, Stop kills the run, errors said on the page); threads keep their agent session; Close only closes
  - [x] `init` and `update` for it (check the agent's tool, remove the old chat setup), both READMEs; the MCP loop, `setup` and the `/pilot` skill removed (`usepilot mcp` only says what to do instead)
- [ ] **After agent runs, before the release:**
  - [ ] Copy prompt without Pilot's tools: its text still says "Pilot's `pilot_done` takes a question" and "check every width with `pilot_check_widths`" (the prompt's `tools: true` form, made for the MCP chat): a pasted prompt needs a form of its own
  - [ ] Width checks during a run: a run has none of Pilot's tools, so Make responsive and Break and fix work widths out from the code and Pilot measures after (one follow-up); giving runs Pilot's check (an MCP server per run, or a command) would bring back the check mid-job. The hub's check route (`/agents/check`, `/checks/:id`) waits unused until then
  - [ ] Choosing the agent: in the terminal now (asked once, `--agent` changes it); a place in the toolbar is the owner's call
  - [ ] Starting Pilot with the dev server (a Vite plugin, the dev script), so there's no second terminal; sites without an npm dev server keep `npx usepilot`
  - [ ] More agents with the same three abilities (one task and exit, a session id, resume by id): Gemini (`gemini -p`), Copilot (`copilot -p`), opencode (`opencode run`)
  - [ ] Release it (a minor version: bridge 7), with the README's update notes
- [ ] **Speed, after agent runs:** a comment took 15–17s with the right code location and 21–34s with Pilot's real prompt on nucleo-2, where the search found the wrong file (`app/modules/modal-pro.php`, part of whose text matched "Web app"; the heading is in `web-3/routes/home.php`). To do: exact text matches first, and the site folder that serves the page; send the look-alikes' locations, where a value comes from (inherited from a parent's class), and the project's scale for that property (14–18s in a test). Each agent step costs 3–4s, so about 15s is the floor for a comment; faster models gave wrong answers.

## Foundation

- [x] pnpm monorepo, TypeScript, Vite, Vitest
- [x] Overlay mounts in Shadow DOM, dormant until launched
- [x] Launch / Close, running state kept per tab
- [x] Close for the whole site: every tab of it closes, jobs go on; Option+P hides in this tab. (Until agent runs it was Quit, which also made the agents' chats stop listening.)
- [x] Toolbar: comment, select, Send with its count, jobs with their count, close (designed)
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
- [x] `@` lists the project's components too (read by Pilot's process in the project, kept current), and typed `@names` count; each mention tells the agent where it is
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

Items marked *(chat loop)* were for an agent's chat running Pilot over MCP, up to 0.13; agent runs replaced it ([handoff.md](handoff.md), *Agent runs*).

- [x] **Say when something's stuck** (the owner's design: red pills, the corner's warning, a red reply): now Pilot not running for the site, a run that failed (with what to do), an older Pilot in the way; until agent runs, also the agent not listening. A job whose runner left goes back to the queue.
- [x] *(chat loop)* Work from the project, not the agent's start folder (`pilot_launch`'s `folder`, MCP roots): a run now starts in the project's folder.
- [x] *(chat loop)* Restarting the server, per client, after an update: now `update` says to restart `npx usepilot`.
- [x] **What each agent does that Pilot relies on:** a checklist and a smoke test per agent in [development.md](development.md), run before each release, `run.test.ts` with a stand-in agent, and `scripts/agent-runs-check.mjs` on every platform. (Until agent runs, per MCP client, with `stdio.test.ts`.)

- [x] Copy prompt
- [x] Launch shortcut (Option+P / Alt+P)
- [x] The localhost hub, one per machine and version, shared by every project's process, with takeover (in `npx usepilot` now; `usepilot mcp` until agent runs)
- [x] Versions that can't meet say so: the page, when an older Pilot's hub answers on its port. *(chat loop)* Agents always started the latest Pilot (`npx -y usepilot@latest mcp`), and `pilot_launch` compared the server with the project's Pilot
- [x] *(chat loop)* `pilot_launch`, `pilot_wait_for_edits`, `pilot_done` and the `/pilot` skill, replaced by agent runs (`npx usepilot`)
- [x] Send as jobs: queued while the agent works, routed by page origin
- [x] The check after done: what landed settles, what didn't goes back once, then Pilot accepts the code
- [x] Make responsive: a task job with its own prompt
- [x] Actions in the comment box's `/` menu (Make responsive first), off the selection's corner; the reply comes back in the thread
- [x] Break and fix: the agent stress-tests an element with odd content and fixes what breaks
- [ ] Break and fix checked by Pilot itself: the width check with long text put in its copy of the page, ellipses counted as fixes
- [ ] More `/` actions, and the menu's design (placeholder look now)
- [x] Pilot's width check: a copy of the page in one hidden frame, the designer's width compared before and after, one follow-up after done (during the job too, with `pilot_check_widths`, in the chat loop: see *After agent runs*)
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
- [x] Comments, phase 2: the agent asks the designer a question in a thread, without waiting (in its reply's `pilot` block; `pilot_done`'s `question` in the chat loop), and the answer sends the job back to the same session
- [x] Faster jobs: Pilot finds each element's code in the project for the agent, each job's step times recorded (*(chat loop)*: the edit guidelines read once)
- [x] *(chat loop)* Jobs queued for a page came in one wait, so several Sends cost one round trip; with agent runs, up to three jobs run at once instead
- [x] Source hints (`target.source`): the component and its file from React (line too in React 18 and earlier) and Vue in development, so agents open the right file without searching
- [x] Source hints under Turbopack and for Server Components, and lines for React 19: the CLI finds the component's declaration by name in the project, then the element's line in it
- [x] Next.js App Router (Server Components, Turbopack): components from React's records of them, never the framework's own components
- [ ] A history of the session's jobs (what changed, how it landed, files touched, a summary to copy), in place of the job list
- [ ] Design the Send states and the job status (placeholder look now)
- [x] Token files that only live in code (`tokens.json`, Style Dictionary, Sass variables), read by Pilot's process in the project, in the fields' variables and `@` ([property-dialog.md](property-dialog.md), *Variables*)
- [ ] Tailwind v3 configs' tokens (JavaScript: they'd have to run)
- [x] *(chat loop)* `/pilot` in any agent with skills: `init` wrote the skill for Codex and Cursor (`.agents/skills`), Claude Code and Copilot
- [x] Comment threads keep the agent's session: each reply resumes it, so the agent remembers the thread (agent runs)

## Distribution

- [x] The name: `usepilot` on npm (package and organization), `usepilot.design` for the site
- [x] `usepilot` published, installable in Vite and Next.js apps, with the CLI
- [x] `npx usepilot init`: one prompt for any agent; installs Pilot, checks the agent's command-line tool, removes the old chat setup, and tells the agent where to load Pilot (until agent runs: registered the MCP server and the skill per agent)
- [x] `npx usepilot update`: the latest package, the old chat setup removed, and what to restart
- [x] `npx usepilot`: Pilot for the project, running the agent for each job (Claude Code, Codex, Cursor)

## Open questions

- Which property editors ship in v1, and how should related properties be grouped?
- Values typed in the search (`pt-4` + Enter, Tailwind-style) are left out for now: the search only finds properties. Revisit once more editors exist.
- After a click selects an element, should select mode stay on (current behavior) or switch off so the page is interactive again?
