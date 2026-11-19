---
name: pilot
description: Hand the UI to the designer with Pilot, then apply the design edits they send, job after job. Use when the user runs /pilot, says they want to take control of the design or edit the UI in the browser, or pastes a "Pilot design edits" brief, or asks to update Pilot.
---

# Pilot

Pilot lets the designer edit the running app in the browser. They select elements, change CSS properties with Pilot's editors, and press **Send**. Each Send reaches you as a **job**: plain CSS `property: from → to` (and new text, when they rewrote one) on identifiable elements, for you to write into the source in this project's conventions. The designer keeps designing while you work; Pilot previews each job's changes until you report it done, then checks them against the page's real CSS.

## When the user asks to update Pilot

Run `npx usepilot@latest update` in the app's folder (the one with `usepilot` in its `package.json`), and tell the user in a few lines what it prints: the new version and the steps left (restart the app's dev server, open a new chat).

## When the user runs /pilot (or asks to launch Pilot)

0. **Check that Pilot's tools are here** (`pilot_launch`, `pilot_wait_for_edits`, `pilot_done`). If they aren't, don't look for them in files, packages or settings: they come from Pilot's MCP server, which an agent loads when a chat starts, so a chat opened before Pilot was set up doesn't have them. Say so in one or two lines and stop: open a new chat (approve Pilot's server if asked, or turn it on in the agent's MCP settings: Cursor keeps a project's new servers off until they're switched on in Cursor Settings, MCP section), then run `/pilot` there. If the project has no Pilot at all (no `usepilot` in its `package.json`), offer to set it up instead: `npx usepilot@latest init --agent <you>`.
1. **Find the page.** Work out the URL of the app's dev server: the dev script and its config (`vite.config.*` → `server.port`, Next.js → 3000, a `--port` flag…), or a server already running in a terminal. If the dev server isn't running, start it in the background. If you can't tell the URL, ask.
2. **Launch:** call `pilot_launch` with that URL and `folder`, the project's folder as an absolute path (your working directory): Pilot searches the code there for each job, and some agents start its server elsewhere. Pilot opens in the page (if the page isn't open yet, tell the designer to open it).
3. **Tell the designer** in one line that Pilot is ready: select an element, edit, press Send.
4. **Wait:** call `pilot_wait_for_edits`. It returns a job when the designer presses Send, or "no edits yet" after a while: call it again, without saying anything to the user. In Claude Code, a wait longer than two minutes moves to the background: end your turn with a short "Waiting for your edits", and the job arrives as the task's result.
5. **Apply the job** (below), then call `pilot_done` with the job id and short notes, and go back to step 4. When several jobs were queued, one wait returns them all: do them all, then call `pilot_done` once per job, each with its own id and notes.

Keep looping until the user asks you to stop. Keep your messages between jobs short: a line on what you changed (and anything you approximated) is enough. If the user talks to you meanwhile, help them, and keep (or start again) a wait in the background so their next Send reaches you (queued jobs are kept).

## Applying a job

Jobs come in three kinds:

- **Edits** (basic): the designer set every value; you only translate them. **Speed is what matters**: go straight to the code, apply, call `pilot_done`. No screenshots, browser checks, builds or tests: Pilot checks the page itself and sends back what didn't land.
- **Comments**: the designer's own words about one element ("make it the brand green", "can this be calmer?"), with the thread so far. Do what the latest one asks: a specific, small ask right away (like an edit), an open-ended one as an advanced task (below). A question gets an answer and no change. Your `pilot_done` notes are your reply in their thread, a small chat box for quick design back-and-forth: one short sentence, like a chat message (about 120 characters), with no lists or code blocks. Not a report: they see the result on the page.
- **Tasks** (advanced), like **Make responsive** and **Break and fix**: the designer selected an element and asked for an outcome (work at every viewport width; hold up with odd but realistic content, like very long text, with the real content put back after testing). They need judgment more than speed. The prompt has the steps. Check the result with `pilot_check_widths` (numbers for every width, no screenshots needed). If you can hand it to a more capable model than the one you run on (a subagent, or another model your agent offers), do, then call `pilot_done` with its notes. Pilot checks the widths again when you're done; problems come back once as a follow-up.

### Edits

The values are **design instructions, not code**: the designer's intent. Use your judgment and write production code the way this project already styles things, whatever it uses. First look at how the element's component is styled, and follow that. For example:

- **Utility classes (Tailwind):** the closest utility or theme value (`border-radius: 12px` → `rounded-xl`, `padding-top: 24px` → `pt-6`). Arbitrary values only when nothing fits.
- **CSS / CSS modules / Sass:** edit the rule that styles the element. Don't add a new override.
- **Design tokens / CSS variables:** prefer an existing token that matches. Don't hard-code its value.
- **CSS-in-JS and compiled styles (StyleX, vanilla-extract, Panda, styled-components, Emotion):** edit the style definition where the component is styled, with the project's tokens.
- **A component library's props (MUI, Chakra…):** use its props and theme values before any custom CSS.

Rules:

- Never leave inline styles or `!important` behind. Pilot's preview is only a preview.
- Find each element by its selector, DOM path and text snippet, then the component that renders it.
- **Shared code, only some copies:** an element's "Look-alikes" line counts the elements like it the job leaves out. If they come from the same code (a shared component, a loop over data) and the designer didn't say which they meant, don't guess: do the rest of the job, leave that part, and ask with `pilot_done`'s `question` (one short sentence, the component's name in **bold**) and `choices` "All of them", "Only this", "New variant" (your suggestion first). Go on with other jobs; the answer comes back as that job. **All of them**: change the component itself. **Only this**: change it where it's used, with what the component accepts (classes through its `className`, merged the project's way; a prop), else the smallest pass-through, not a variant. **New variant**: add a named option the way the component defines variants (`cva`, a `variant` prop), use it here, and name it in your notes. Don't ask when the designer already said, when every copy is in the job, or when nothing else uses that code.
- **Widths:** a change for some viewport widths goes in a media query; use the project's breakpoints when one matches (or is within a few pixels). "Every width" means no media query should override it.
- **Removed:** the element shouldn't declare the property at all (not `0` or `none`).
- **Text:** the designer rewrote the element's copy. Change it where it comes from (the markup, a prop, a translation file), for this element only; Pilot checks that the page shows the new text.
- If you approximated a value to fit a token or scale, say which and by how much in `pilot_done`'s notes (`22px → pt-6, 24px`). Pilot checks the page after each job: a change that doesn't give the designer's value comes back to you once as a follow-up. Fix it, or keep a deliberate choice and say why; after that, Pilot takes what the code gives.
- Don't run builds or tests for a job unless it's needed: hot reload shows the result, and the designer is waiting to see it.
