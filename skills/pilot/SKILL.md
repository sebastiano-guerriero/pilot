---
name: pilot
description: Hand the UI to the designer with Pilot, then apply the design edits they send, job after job. Use when the user runs /pilot, says they want to take control of the design or edit the UI in the browser, or pastes a "Pilot design edits" brief.
---

# Pilot

Pilot lets the designer edit the running app in the browser. They select elements, change CSS properties with Pilot's editors, and press **Send**. Each Send reaches you as a **job**: plain CSS `property: from → to` on identifiable elements, for you to write into the source in this project's conventions. The designer keeps designing while you work; Pilot previews each job's changes until you report it done, then checks them against the page's real CSS.

## When the user runs /pilot

1. **Find the page.** Work out the URL of the app's dev server: the dev script and its config (`vite.config.*` → `server.port`, Next.js → 3000, a `--port` flag…), or a server already running in a terminal. If the dev server isn't running, start it in the background. If you can't tell the URL, ask.
2. **Launch:** call `pilot_launch` with that URL. Pilot opens in the page (if the page isn't open yet, tell the designer to open it).
3. **Tell the designer** in one line that Pilot is ready: select an element, edit, press Send.
4. **Wait:** call `pilot_wait_for_edits`. It returns a job when the designer presses Send, or "no edits yet" after a while: call it again, without saying anything to the user. In Claude Code, a wait longer than two minutes moves to the background: end your turn with a short "Waiting for your edits", and the job arrives as the task's result.
5. **Apply the job** (below), then call `pilot_done` with the job id and short notes, and go back to step 4.

Keep looping until the user asks you to stop. Keep your messages between jobs short: a line on what you changed (and anything you approximated) is enough. If the user talks to you meanwhile, help them, and keep (or start again) a wait in the background so their next Send reaches you (queued jobs are kept).

## Applying a job

Jobs come in three kinds:

- **Edits** (basic): the designer set every value; you only translate them. **Speed is what matters**: go straight to the code, apply, call `pilot_done`. No screenshots, browser checks, builds or tests: Pilot checks the page itself and sends back what didn't land.
- **Comments**: the designer's own words about one element ("make it the brand green", "can this be calmer?"), with the thread so far. Do what the latest one asks: a specific, small ask right away (like an edit), an open-ended one as an advanced task (below). A question gets an answer and no change. Your `pilot_done` notes are your reply in their thread: a sentence or two.
- **Tasks** (advanced), like **Make responsive**: the designer selected an element and asked for an outcome (work at every viewport width). They need judgment more than speed. The prompt has the steps. Check the result with `pilot_check_widths` (numbers for every width, no screenshots needed). In Claude Code, unless you already run on Opus, hand the task to a subagent with `model: "opus"`, then call `pilot_done` with its notes. Pilot checks the widths again when you're done; problems come back once as a follow-up.

### Edits

The values are **intent, not code**. Translate them into this project's conventions:

- **Tailwind:** the closest utility or theme value (`border-radius: 12px` → `rounded-xl`, `padding-top: 24px` → `pt-6`). Arbitrary values only when nothing fits.
- **CSS / CSS modules / Sass:** edit the rule that styles the element. Don't add a new override.
- **Design tokens / CSS variables:** prefer an existing token that matches. Don't hard-code its value.
- **CSS-in-JS:** edit the styled definition or `sx` / `style` object where the component is styled.

Rules:

- Never leave inline styles behind. Pilot's preview is only a preview.
- Find each element by its selector, DOM path and text snippet, then the component that renders it.
- If an element comes from a shared component, ask before changing every instance. Otherwise scope the change (a variant, a prop, a class on that use).
- **Widths:** a change for some viewport widths goes in a media query; use the project's breakpoints when one matches (or is within a few pixels). "Every width" means no media query should override it.
- **Removed:** the element shouldn't declare the property at all (not `0` or `none`).
- If you approximated a value to fit a token or scale, say which and by how much in `pilot_done`'s notes (`22px → pt-6, 24px`). Pilot checks the page after each job: a change that doesn't give the designer's value comes back to you once as a follow-up. Fix it, or keep a deliberate choice and say why; after that, Pilot takes what the code gives.
- Don't run builds or tests for a job unless it's needed: hot reload shows the result, and the designer is waiting to see it.
