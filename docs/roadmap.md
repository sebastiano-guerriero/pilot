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

- [x] Copy prompt
- [x] Launch shortcut (Option+P / Alt+P)
- [x] `usepilot mcp`: MCP server and localhost hub in one process; several agents share one hub, with takeover
- [x] `pilot_launch`, `pilot_wait_for_edits`, `pilot_done` and the `/pilot` skill
- [x] Send as jobs: queued while the agent works, routed by page origin
- [x] The check after done: what landed settles, what didn't goes back once, then Pilot accepts the code
- [x] Make responsive: a task job with its own prompt, or copied
- [x] Pilot's width check (`pilot_check_widths`): a copy of the page in one hidden frame, the designer's width compared before and after, one follow-up after done
- [x] Basic and advanced jobs: edits go fast, advanced tasks to an Opus subagent in Claude Code
- [x] Comments, phase 1: the Comment tool and widget, a thread per element, the agent's notes as replies, unresolved threads marked on their elements
- [x] Design the comment widget
- [x] Selection kept across tools, Option+C / Option+V
- [x] Elements being worked on: outline and loader, Send holds their changes, comments wait
- [x] Threads that need you: the corner icon, the Comment button's count goes to the next one
- [x] The jobs button goes to the next job; jobs cancelled from their loader; the job list hidden
- [ ] Preferences panel: change or remove Pilot's shortcuts
- [ ] Send in the property dialog for the element's changes
- [ ] A comment carries the element's unsent changes as an attachment (applied and checked with it)
- [x] Attachments, step 1: the attach button picks images, previewed above the field, each removable
- [ ] Attachments, next: send the images with the comment (to the agent through the hub)
- [ ] Element markers for unsent changes
- [ ] Comments, phase 2: the agent asks the designer a question in the thread and waits for the answer (an MCP tool)
- [ ] Source hints (`target.source`: file and line, from the framework in development), so agents open the right file without searching
- [ ] A history of the session's jobs (what changed, how it landed, files touched, a summary to copy), in place of the job list
- [ ] Design the Send states and the job status (placeholder look now)
- [ ] The bridge watches token files that only live in code (Tailwind v3 config, `tokens.json`, Style Dictionary) ([design-tokens.md](design-tokens.md))
- [ ] Cursor: a `/pilot` command file next to the MCP server (the server works there already)

## Distribution

- [x] The name: `usepilot` on npm (package and organization), `usepilot.design` for the site
- [x] `usepilot` published, installable in Vite and Next.js apps, with the CLI (`mcp`, `setup`)
- [ ] `npx usepilot init`: detect the framework's entry, add the dev import, register the MCP server and skill, in one command

## Open questions

- Which property editors ship in v1, and how should related properties be grouped?
- How should multi-element edits work (e.g. "all cards")?
- Values typed in the search (`pt-4` + Enter, Tailwind-style) are left out for now: the search only finds properties. Revisit once more editors exist.
- After a click selects an element, should select mode stay on (current behavior) or switch off so the page is interactive again?
