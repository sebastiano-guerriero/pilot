# Pilot guide

How to use Pilot, task by task. This guide is for **usepilot 0.17.0**: it ships with Pilot, so the copy in your project (`node_modules/usepilot/GUIDE.md`, or `npx usepilot guide`) always matches the version you have.

**Agents:** when someone asks how to do something with Pilot, answer from this file. If it isn't here, Pilot doesn't do it yet: say so rather than guessing.

## Contents

- [Setting up](#setting-up)
- [Opening, hiding and closing Pilot](#opening-hiding-and-closing-pilot)
- [The toolbar](#the-toolbar)
- [Selecting elements](#selecting-elements)
- [Editing properties](#editing-properties)
- [Variables and tokens](#variables-and-tokens)
- [Screen widths (breakpoints)](#screen-widths-breakpoints)
- [Hover, focus, dark mode and other states](#hover-focus-dark-mode-and-other-states)
- [Editing text](#editing-text)
- [Undo, discard and reloads](#undo-discard-and-reloads)
- [Sending changes to your agent](#sending-changes-to-your-agent)
- [Comments](#comments)
- [Skills and Pilot's tasks (the / list)](#skills-and-pilots-tasks-the--list)
- [Mentions (@)](#mentions-)
- [When the agent asks you something](#when-the-agent-asks-you-something)
- [Measuring distances](#measuring-distances)
- [The DOM tree](#the-dom-tree)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [When something's wrong](#when-somethings-wrong)
- [What Pilot doesn't do (yet)](#what-pilot-doesnt-do-yet)
- [Commands and options](#commands-and-options)

## Setting up

1. **Add Pilot to the project**: ask your agent, in the project, to *run `npx usepilot@latest init` and follow what it prints*. It installs Pilot as a dev dependency, loads it in development only (Pilot never ships to your live site), and sets it to start with your dev server. Pilot runs your agent's command-line tool for each job, not its chat window: if that isn't installed, your agent installs it, after asking you.
2. **Restart your dev server** and open your app. Pilot opens on every page, and you can design right away. The dev server's terminal shows each job's progress (`[pilot]` lines).
3. **Sign in once, when Pilot asks.** The first time you send something (Send, or a comment), Pilot opens your agent's sign-in page in your browser; what you sent waits, and goes once you've signed in. Already signed in to your agent's command-line tool? Nothing to do. To sign in in a terminal instead: `claude auth login`, `codex login` or `cursor-agent login`.

**Your teammates:** the setup lives in the project's files, but Pilot starts with the dev server only on computers where it's set up (where `init` or `npx usepilot` ran). Teammates who haven't set it up see one line in their dev server's terminal and nothing else; to use Pilot, they ask their agent the same as in step 1 (or run `npx usepilot init` in the project once): it changes none of the project's files, and turns Pilot on for them.

**A dev server Pilot can't start with?** Run `npx usepilot` in the project's folder, in a terminal beside it, and keep it running.

**Choosing the agent:** Pilot uses the agent you set it up with. `npx usepilot init --agent codex` (or `claude`, `cursor`) switches, remembered for the project; then restart your dev server. (`npx usepilot --agent codex` does the same when you run Pilot that way.)

**What the agent may do:** edit the project's files, and whatever you've already set it to always allow. Anything it would normally ask permission for is refused, since no one is there to answer; its reply says what was refused. For an MCP server or a website, the reply has a **Copy instructions** button: paste them into your agent's chat to allow it for this project. Commands are never allowed this way.

**Updating:** run `npx usepilot@latest update` in the project's folder, then restart your dev server (and `npx usepilot`, if you run it).

## Opening, hiding and closing Pilot

- **Option+P** (Alt+P on Windows and Linux) opens Pilot on any page of your app. Pilot starting (with the dev server, or `npx usepilot`) also opens it in the app's open tabs.
- **Hide:** Option+P again, or the toolbar's eye button, hides Pilot in this tab and keeps everything as it was (the selection, the dialog, what you typed). The page is fully yours meanwhile: hover, click and focus work normally, your edits stay on it. Press Option+P again to come back. Use it to try a hover or a click for real.
- **Close:** the toolbar's last button closes Pilot in every tab of the site. Jobs keep running, and Option+P opens it again.
- Pilot remembers per browser tab whether it's open, so reloads don't open or close it.

## The toolbar

From left to right:

| Button | What it does |
| --- | --- |
| **Comment** (speech bubble, Option+C) | Click an element to ask the agent for a change in your own words. Its count is the threads waiting for you; clicking it while it's on goes to the next one. |
| **Select** (cursor, Option+V) | Click an element to edit its properties. |
| **Send** | Sends your changes not sent yet to the agent, as one job. Its count is how many it would send. |
| **Discard** (brush) | Takes your unsent changes off the page, in one undo step. Sent ones stay. |
| **Jobs** (a robot at a laptop) | Shows while jobs are running, with how many. Clicking it scrolls to the next job's elements. |
| **Hide** (eye) | Hides Pilot in this tab, everything kept. |
| **Close** | Closes Pilot on the whole site. |

Drag the toolbar by the strip along its top edge; it stays where you put it.

## Selecting elements

- **Select** (Option+V), then **hover** an element to see its name and size, and **click** to select it. The click doesn't reach the page, so links and buttons don't fire.
- **Several elements:** Shift+click adds an element or takes it out. A plain click selects just one again.
- **Select similar** (a button above the selection's corner) adds every element like the selected one: in a React or Vue app, the same part of every instance of its component (every card's title, not every heading); elsewhere, the same part of every repeated copy.
- **Show in DOM** (`< >` on the selection's corner) opens the [DOM tree](#the-dom-tree) on it.
- **Esc** clears the selection; with nothing selected, Esc turns the tool off.
- Grid containers show their grid lines and numbers; hovering an element stripes its padding, margin and gaps.
- The selection survives your agent's reloads (hot reload and full reloads).

## Editing properties

Select an element and its **property dialog** opens beside it.

- **With nothing typed**, it lists every property the element sets, grouped (Content, for a `::before` or `::after`; Layout, Position, Appearance, Effects, Transform, Typography, Interactivity, SVG, Visibility).
- **Search** by CSS name or Tailwind class: `p`, `pt`, `px`, `w`, `min-w`, `gap`, `display`, `items`, `aspect`, `bg`, `font`, `text`, `rounded`, `shadow`… Abbreviations work too (`mxw` is max-width). The search finds properties only: type values in the editor (`pt-4` in the search isn't a value).
- **Tab** or **Enter** goes into the editor, **Enter** applies and goes back to the search for the next property: `pt` Tab `24` Enter.
- **Values:** type a number (`12` is 12px), any CSS unit, a keyword (`auto`), math (`100% - 20px`), or a [variable](#variables-and-tokens). **↑/↓** step by 1, **Shift** by 10; the scroll wheel does the same on a field being edited. Some fields have a **drag handle** to scrub the value.
- **Linked sides** work like Tailwind: `p` sets all four sides, `px` left and right, `py` top and bottom. The button beside padding, margin, inset, gap and radius switches between one value and each side.
- **Several selected:** each change goes to all of them. A field whose value differs between them says **Mixed**; typing a value sets it on all.
- **Clearing a field** (empty it and press Enter) means "this element doesn't set this property": Pilot takes the property off that element, not set to 0.
- **Rich properties** (box shadow, filter, backdrop filter, mask image) show their values as chips: click one to edit it in a panel beside the dialog, **+** to add one.
- **Transform:** one row for everything that moves, turns, sizes or slants the element, its chip saying what's set (× takes it all off). Click it and pick its **type**: **default** has translate, rotate, scale and skew (each one value, or each axis on its own with the button at the right of its row; scale takes a factor, `1.5`, or a percentage), **custom** takes it all as CSS functions in one value (`translate(-50%, -50%) rotate(5deg)`), **none** turns them all off.
- **3D:** turning an element around X or Y, or moving it along Z, only looks 3D with a perspective on its parent; without one, the footer says "Add perspective to the parent". Select the parent and set its perspective.
- **Copy and paste:** right-click a property's name for **Copy CSS**, **Copy properties** and **Paste properties** (onto the selected elements).
- **Fields show what your CSS declares**, not computed values; hover a field to see what math or a variable comes to.
- The dialog stays where it opened while you edit; drag it by the strip along its top edge.

## Variables and tokens

Use your project's tokens anywhere a value goes:

- **Type `--`** in a field to list the page's CSS variables that fit (spacing for a padding, colors for a color…), filtered as you type, by name or value. It works inside math too: `calc(--sp`…
- **The variable button** on the right edge of a hovered field opens the same list to browse.
- **↑/↓** on a field holding a token move along its scale (`--space-3` → `--space-4`); Shift+drag on the handle does the same.
- Tokens kept in files rather than CSS (a W3C or Style Dictionary `tokens.json`, Sass `$variables`) are listed too while Pilot runs for the project. Tailwind v3 configs aren't read.

The agent writes the token the project's way, never a raw value.

## Screen widths (breakpoints)

**By default, an edit goes where your CSS already puts it at the current window width.** With `pt-2 md:pt-4 lg:pt-12` and the window between md and lg, padding-top shows and changes the `md:` value. Resize, and the field follows. Where nothing sets the property, the edit is the base value.

To choose the widths yourself, start the search with a **width modifier**:

- `from-768 ` (with a space): from 768px up. `to-767 `: up to 767px. Both make a range: `from-768 to-1199 `.
- `base `: the value with no media query (no breakpoint).
- `all-widths `: one value at every width; your breakpoint rules for that property are removed.
- After `from-` or `to-`, a list offers the window's width and the page's breakpoints; **Tab** takes the suggestion.
- **The width ruler:** hover the very top of the window to see the window's width and the page's breakpoints. Click the width or a breakpoint to set `from` it; Shift+click for `to`.
- While a property is in use, the ruler shows bars for where its values apply: green where your edit goes.

Modifiers stay set across selections until you remove them (the pill's ×, or Backspace at the start of the search). Click **default** in the pill row to go back to no modifiers without losing them. Edits for widths other than the window's don't show on the page until you resize into them.

## Hover, focus, dark mode and other states

Start the search with a state, Tailwind style, or type `/` to pick one:

| Modifier | Edits |
| --- | --- |
| `hover:` `focus:` `focus-visible:` `active:` | the element in that state |
| `dark:` `light:` | the page in dark (or light-only) mode, the way your project does dark mode |
| `before:` `after:` `placeholder:` | the element's `::before`, `::after`, or a field's placeholder |

- They combine with each other and with widths: `hover:from-768 `, `dark:hover:`.
- **`before:` and `after:`** add `content: ""` with your first change when the element has no `::before` (`::after`) yet, so it's drawn; one Cmd+Z takes both back. Type its text in **content** (`Popular`, `✓`): Pilot adds the quotes.
- **Pilot doesn't force the state on the page.** The fields show and edit what's set for that state; to see it, hide Pilot (Option+P) and hover or focus the element, or switch your system or site to dark mode.
- **`/` at the start of the search** lists every modifier, and first the combinations this element already uses, with what each sets.

## Any other condition, in words

For a condition no modifier lists, type `/` and describe it right there: "the parent .card has focus inside", "it has data-open", "the peer input is invalid and not focused". The menu offers **Create modifier**; press **Enter**. Your edits are then only for when it holds.

- You won't see those edits live until the agent has written them: check **force state** beside the pill to see them as if the condition held, whatever the page is doing. Uncheck it for the page as it is.
- When the job comes back, the agent gives the condition a short name, which the pill and the `/` menu show from then on, and your edits show live when the condition holds.
- If the agent can't tell what you mean, it asks you in the thread. A modifier only stays in the menu once the agent has written it as CSS; if it doesn't say how it wrote it (even after Pilot asks again), the job's notes tell you, and the modifier isn't kept.
- CSS works too, with `&` for the element (`.card:hover &`): that one shows live right away.
- The `/` menu also lists the conditions your code already has on the element (`group-hover/hero`, `.card:hover &`, `motion-reduce`), even when they don't hold right now. Pick one to see and edit its values.
- Backspace at the start of the search removes it, like the other modifiers.

## Editing text

With **Select** on, **double-click** a text to edit it in place. **Enter** is done, **Esc** cancels. In an element with other elements inside, you edit the run of text under the pointer. Text edits are sent and undone like any other change.

## Undo, discard and reloads

- **Cmd/Ctrl+Z** undoes, **Cmd/Ctrl+Shift+Z** (or Ctrl+Y) redoes. A whole drag is one step.
- **Discard** takes every unsent change off the page, as one undo step.
- Your changes survive reloads in the same browser tab, and stay previewed on the page until they're really in your code.

## Sending changes to your agent

- **Send** sends your unsent changes as one job. Keep designing: new changes go in the next job, and up to five jobs run at once.
- While a job is on an element, it shows a **loader** on its corner; its tooltip says where the job stands. Hover the loader and click the × to **stop** the job.
- A new change or comment on an element with a job on it **waits** ("Queued") and goes once that job is done, so two jobs never edit the same element at once.
- **Pilot checks the page** when the agent is done. What landed stops being previewed. What didn't goes back to the agent once; after that, Pilot accepts what the code gives. To insist on a value, edit it again and Send.
- The agent writes your changes in the project's own way (Tailwind classes, CSS modules, tokens…), never as inline styles.

## Comments

- **Comment** (Option+C), click an element (Shift+click for several), and write what you want in your own words. **Enter** sends, **Shift+Enter** is a new line, **Esc** closes (your draft is kept).
- **Attach** images, text files or PDFs with the attach button, or drop them on the box.
- **Unsent edits go along:** edits you made on those elements show as a chip ("2 changes") and go with the comment; remove the chip to keep them for Send. Where the comment and an edit disagree, the comment wins.
- Each element has a **thread**: the agent replies in it, and you can reply to follow up ("a bit more"): the agent remembers the thread.
- A thread with a reply to read shows a **comment icon** on its element and counts on the Comment button.
- **Edit manually**, under a reply that changed the element's look, switches to Select with those elements selected, to fine-tune what the agent chose.
- **Mark as solved** (or Option+Enter) closes the thread.
- **Stop** (beside send) cancels the job while the agent works.

## Skills and Pilot's tasks (the / list)

Type `/` at the start of a word in the comment box:

- **Your agent's skills**, the ones its own `/` shows (the project's, then yours). A bare `/` lists the first few; type to see every match (`/emil`). Pick one and the agent uses it for this comment.
- **Props**, on a component's instance: lists the props that change how it looks. Reply with a line like `tone: dark` to change one.
- **Make responsive**: makes the element work at every screen width. Pilot checks the result at a phone width, each breakpoint and a wide desktop, and sends problems back to the agent once.

## Mentions (@)

Type `@` in a comment to name things instead of describing them: the page's **tokens** and **breakpoints** (`--color-brand`, `@768px`), its **components** (`@ProductCard`, also ones not on this page while Pilot runs for the project), and its **named elements** (`@section#features`). The agent gets exactly what you picked, and where it is in the code.

## When the agent asks you something

When part of a job needs your decision, the agent asks in a thread instead of guessing, and does the rest. It leaves that part unchanged until you answer, and says so ("Not changed yet: …"). The most common question: you changed one card, or commented on it, and the cards share one component. A question about several elements gets a thread of its own. Answer with a button:

- **All of them** changes the component itself.
- **Only this** changes this one instance.
- **New variant** adds a named option to the component and uses it here.

Or write your own answer (only the buttons' exact words are read as "every copy" for the loaders). Selecting every instance of a component (Select similar) already says "all of them", so the agent changes the component without asking.

Once you answer, the loaders show where the agent works now: on the element it asked about, and with **All of them** on every instance like it on the page. The rest of the job's elements are done.

## Measuring distances

With an element selected, **hold Alt (Option)** and move the pointer: Pilot shows the distances from the selection to the element under the pointer (or to its parent), in red. Release Alt to go back.

## The DOM tree

**Alt+D** (or Show in DOM) opens a tree of the page's elements, to select what's hard to click: overlapping, zero-size or hidden elements. Click a row to select it, **↑/↓** to move, **→/←** to open and close. Cmd/Ctrl+click adds a row, Shift+click selects a range. In a React or Vue app, **Components** at the top switches to the tree of component instances. `::before` and `::after` are listed too, not selectable: hover one to see its box on the page.

## Keyboard shortcuts

| Keys | Does |
| --- | --- |
| **Option+P** (Alt+P) | Open Pilot; once open, hide and show it |
| **Option+V** / **Option+C** | Select tool / Comment tool |
| **Alt+D** | DOM tree |
| hold **Alt** | Measure distances |
| **Esc** | One step back: editor → search → clear search → close the dialog → turn the tool off |
| **Cmd/Ctrl+Z**, **Cmd/Ctrl+Shift+Z** | Undo, redo |
| **Tab** / **Enter** in the search | Into the editor |
| **Enter** in an editor | Apply, back to the search |
| **↑/↓**, **Shift+↑/↓** | Step a value by 1, by 10 (a token: along its scale) |
| **Tab** / **Shift+Tab** in an editor | Next / previous field |
| `/` at the start of the search | Modifiers (widths, states) |
| **Backspace** at the start of the search | Remove the last modifier |
| double-click a text | Edit it in place |
| **Shift+click** | Add to the selection |
| **Enter** / **Option+Enter** in a comment | Send / mark as solved |

The shortcuts with Option work in Pilot's own fields too, but not while you're typing in the page's fields.

## When something's wrong

Pilot says when it's stuck: a red **!** on a toolbar button (hover it for what to do), a red warning on an element's corner, or a red reply in a thread.

- **The toolbar doesn't appear.** Pilot only loads in development, in the browser. Press Option+P. If nothing happens, ask your agent to check where `usepilot/auto` is imported (Option+P is ignored while you type in the page's fields).
- **"Pilot isn't running for this site"**: restart your dev server, which starts Pilot (its terminal says why, if it doesn't). Without that setup, run `npx usepilot` in the project's folder and keep it running. Its terminal says why it skipped the page (another project's page, or a loader set up before 0.15: run `npx usepilot@latest update`).
- **"Sign in to …"**: your agent isn't signed in. Click Send to open its sign-in page; what you sent goes once you've signed in. If the page doesn't open, or the sign-in doesn't finish, sign in in a terminal (see [Setting up](#setting-up)).
- **Your agent's tool isn't installed**: ask your agent to install its command-line tool (or run the command Pilot shows). What you sent waits, and goes once it's ready.
- **"… couldn't do this job"**: the dev server's terminal (or the one running `npx usepilot`) shows what the agent said.
- **"… needs an update"**: your agent's command-line tool is too old for Pilot; run the command it gives.
- **"… has gone quiet"**: no sign of work for 2 minutes. Click to stop the job, then send again.
- **A reply says something was refused**: the agent wasn't allowed to do it in its settings. See *What the agent may do* in [Setting up](#setting-up).
- **A change shows on the page but not in the code yet**: it stays previewed until the agent's job lands. A change for another screen width or a state can't be checked on the page, so Pilot takes the agent's word for it.

## What Pilot doesn't do (yet)

- It never edits your code itself, and never runs on your live site: the agent writes the code.
- No adding, moving or deleting elements from Pilot: ask in a comment.
- No forcing hover or focus on the page while editing those states (hide Pilot to try them).
- No values typed in the search (`pt-4` + Enter): search for the property, then type the value.
- No Copy prompt: everything goes through Pilot running for the project (with the dev server, or `npx usepilot`).
- Components are read in React and Vue only (not Svelte or Angular). Tailwind v3 config tokens aren't read.
- Props work on one component instance at a time.

## Commands and options

| Command | Does |
| --- | --- |
| `usepilot dev -- <command>` | Run your dev server with Pilot in it, in a `package.json` script (`"dev": "usepilot dev -- vite"`); Vite and Next.js use their own way (`usepilot/vite`, `usepilot/next`), set up by `init` |
| `npx usepilot` | Run Pilot for this project, beside a dev server Pilot doesn't start with. `--agent claude\|codex\|cursor` picks the agent, `--url <address>` gives the app's address when Pilot can't tell |
| `npx usepilot@latest init` | Set Pilot up in a project (ask your agent to run it) |
| `npx usepilot@latest update` | Update Pilot in this project |
| `npx usepilot guide` | Print this guide |
| `npx usepilot help` | List the commands |

Options, where your app loads Pilot:

```ts
import { mountPilot } from "usepilot";

mountPilot({
  shortcut: "alt+p",              // or "ctrl+shift+e", or false
  launch: false,                  // true: open on load
  nameAttributes: ["data-block"], // attributes your project names elements with
  project: "my-app",              // your package.json's name: npx usepilot runs for its own project's pages
});
```
