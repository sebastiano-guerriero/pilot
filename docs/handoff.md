# Agent handoff

The handoff is **jobs**. Edits, tasks (Make responsive) and comments each go to the agent as a job; the agent applies it and calls `pilot_done`; Pilot checks the result on the page. The page is the source of truth for its jobs.

```
page (your app in dev, the overlay)          one hub per machine, 127.0.0.1:4747
  Send ──POST /jobs──────────────────────▶  ┌───────────────────────────────────┐
  job updates, launch ◀──SSE /events───────  │ jobs and agents, by page origin   │
  follow-up ──POST /jobs/:id/retry───────▶  └───────────────────────────────────┘
                                               ▲ in-process        ▲ HTTP
                                   chat A: `usepilot mcp`   chat B: `usepilot mcp`
                                   (stdio MCP, runs the hub) (joins it, takes over
                                                              if chat A closes)
```

## The loop

In any agent chat, `/pilot`:

1. The skill ([skills/pilot/SKILL.md](../skills/pilot/SKILL.md)) has the agent find the dev server's URL and call `pilot_launch({ url })`. The hub registers the chat for that page's origin and tells the open page to launch Pilot.
2. The agent calls `pilot_wait_for_edits`. It returns a job when the designer sends one, or "no edits yet" after a while (the agent calls it again). In Claude Code the call waits long, and Claude Code moves it to the background after a couple of minutes: the chat stays usable and the job arrives as the task's result. Other clients wait under MCP's default 60-second request timeout (`waitMsFor()` in [mcp.ts](../packages/cli/src/mcp.ts); `PILOT_WAIT_MS` overrides it). Progress notifications keep the call under Claude Code's idle limit.
3. The job is the prompt's text plus its id and "call `pilot_done`". The agent applies it, calls `pilot_done({ jobId, notes })`, and waits again.
4. Pilot checks the job on the page. If some changes didn't land, the same job comes back **once** as a follow-up (`followUp()` in [mcp.ts](../packages/cli/src/mcp.ts)): each change with its element, the designer's value and what the page gives, the usual causes, and "if you chose a different value on purpose, keep it and say so in your notes". After that, Pilot accepts what the code gives.

Without an agent on the page, Send is **Copy prompt**: the same text, to paste anywhere ([edits.md](edits.md), *The change set*).

## Edits: Send

The toolbar's **Send** turns the changes not sent yet into a job (`PilotSession`, [bridge/session.ts](../packages/overlay/src/bridge/session.ts)). Their preview stays on the page while the agent works, and you keep designing: new changes go in the next job.

- **Jobs in the history:** Send tags the changes not sent yet with the job's id (`EditHistory.send()`, saved with the history); Copy prompt still takes everything in effect. Sent changes stay previewed and aren't sent again; a newer change of the same property goes in the next job. Cancel un-tags them (`unsend()`).
- **Settling:** a job's changes leave the history only through `settle()`, after the page checked them: what landed at once, what didn't after its one follow-up, and what Pilot can't check on the agent's word. A settled change leaves for good, not as an undo step: undoing it would cover the real code with a stale preview.

### The check after done

[edits/verify.ts](../packages/overlay/src/edits/verify.ts). For each change, the element's computed value with only the page's CSS against its computed value with the job's changes previewed (`EditHistory.probe()`, both in one task, so nothing flickers). So `1.5rem` or `pt-5` from the agent matches the designer's `20px`.

- It checks again on every stylesheet change in the head (hot reload; Pilot's own preview sheet is ignored, `isPageMutation()`) and every half second, for up to 15 seconds. What landed is settled at once.
- **Can't be checked, settled on the agent's word:** changes for widths other than the window's, changes for states, and elements not on this page.
- What still doesn't match after 15 seconds goes back as the follow-up, and stays previewed meanwhile (the job reads as the agent applying). After the follow-up, the job's previews go, whatever they show, so the page never stays in a state the designer has to sort out. To get an exact value the agent didn't keep, edit it again and Send: a new job.
- A finished job leaves the list shortly after (and on the next load).

## Tasks: Make responsive

The selection's **Make responsive** action ([page.md](page.md), *Selection actions*) asks the agent to make the selected element work at every viewport width.

- It goes at once as a job of its own (`PilotSession.request()`), apart from the changes (they wait for Send). Without an agent, its prompt is copied. The tooltip says "Sent to agent" / "Prompt copied" for a moment.
- **Asked again while that element's task isn't finished**, nothing new is sent: the button has given way to the loader by then, and called anyway its tooltip says "Already with the agent" (`PilotSession.openTask()`). So the agent doesn't do it twice and two agents never edit the same component at once. It goes by the element itself (after a reload, found again by its selector), so two cards that look alike each get their own; once the task is finished, another pass is fine.
- **The change set** has no edits and a `request` (`ResponsiveRequest` in [types.ts](../packages/protocol/src/types.ts)): the element's target and the page's breakpoints, built by `buildRequest()` ([edits/changeSet.ts](../packages/overlay/src/edits/changeSet.ts)).
- **The prompt** (`formatPrompt()`, the same for Copy and Send) gives the steps: find the component and the layout around it; learn how the project does responsive (breakpoints and their names, mobile- or desktop-first, container queries); follow similar components that already have responsive rules; make the smallest changes in the project's conventions; check at a phone width, each breakpoint and just below it, and a wide desktop (horizontal scrolling, clipped text, overlaps, small tap targets), saying which widths it couldn't check; report what changed at which widths. **The steps live in the prompt rather than the skill**, so any agent (Cursor, Codex, a pasted prompt) gets them; the skill and the MCP instructions only say such jobs exist.

### Pilot's width check

[checks/widths.ts](../packages/overlay/src/checks/widths.ts), so the agent needs no screenshots.

- **Widths:** a phone width (375px), each breakpoint and 1px below it, a wide desktop (1440px) and the designer's width (`widthsToCheck()`, at most 12).
- **One hidden frame, resized** to each width in turn (media queries follow the frame's width), holding **a copy of the page as the designer has it** (`pageCopy()`): its HTML and styles (styles added through the CSSOM and adopted stylesheets written out) and its state (an open modal, classes and inline styles scripts set), without scripts (a sandboxed `srcdoc` frame), Pilot's UI or its previews (the check measures the code). Nothing runs or reloads: no analytics, requests or sockets, and heavy pages cost little. Layout that only changes through JavaScript doesn't respond in the copy, and the check's text tells the agent so (`source: "copy"`).
- **Only when the copy doesn't have the element** (inside a shadow root, say), the frame loads the page's URL instead, once (scripts on, named `pilot-probe` so Pilot doesn't mount there; `source: "load"`). This came from an outside review: loading the page once per width ran its side effects up to 12 times, and measured a fresh load instead of the designer's state.
- **Problems:** sticking out of the viewport (which side, by how much), spilling out of its parent, clipping its content, siblings overlapping; the outermost offender only. **Notes:** content scrolling sideways in a scroll container, tap targets under 24px below 768px, the page scrolling sideways because of other elements. Problems the element already has at the designer's width are left out: that width is theirs.
- Elements are labeled so the agent can find them: tag, id and `data-*`, three classes, the text inside, and `2 of 3` when siblings look alike.
- **The designer's width stays as it was:** when the task is sent, Pilot records the computed styles of the element and what's in it at the designer's width, in a frame (the code as it is), while the agent starts (`snapshotAt()`). Each check compares them again and lists what changed (`compareSnapshots()`).
- **The agent runs it** with `pilot_check_widths({ jobId })`: the hub sends the job's pages a `check` event, the page that has the job runs it and posts it to `/checks/:requestId`, and the tool returns it as text (`formatWidthCheck()`).
- **Pilot runs it once more when the job is done** (after a short wait for hot reload): problems go back to the agent once as a follow-up (`issues`, `taskFollowUp()` in [mcp.ts](../packages/cli/src/mcp.ts)); after it, Pilot takes what the code gives. The loader's tooltip says "Make responsive: Waiting for an agent", then the agent working, then "Checking widths".

## Basic and advanced jobs

Edits are **basic**: every value is given, so speed matters, and the skill tells the agent to go straight to the code with no screenshots, browser checks, builds or tests (Pilot checks the page). Tasks like Make responsive are **advanced**: they need judgment, so their prompt says so and, in Claude Code, has the agent hand them to an Opus subagent unless it already runs on Opus (other agents use their most capable model if they can). The chat's own model stays the designer's choice: a fast one keeps edits quick, and advanced tasks still get the strong model.

## Comments

The toolbar's **Comment** tool picks elements like Select, but the selected one gets the **comment widget** ([CommentWidget](../packages/overlay/src/ui/components/CommentWidget/CommentWidget.tsx)) instead of the property dialog, placed by the same rules (`dialogSpot`, `dialogPosition`, `raisedSpot`; draggable by its top strip), with the same selection actions. Editing and commenting stay separate tools (other main actions will come, like Screenshot). The widget is the owner's design.

- **A thread per element** (`CommentThread` in [session.ts](../packages/overlay/src/bridge/session.ts), saved in the tab's sessionStorage like the jobs, found again by selector after a reload): the designer's comments and the agent's replies.
- **Replies are rendered as markdown**, the subset agents write ([markdown.tsx](../packages/overlay/src/ui/components/CommentWidget/markdown.tsx): paragraphs, bold, italic, inline code, fenced code, lists; headings as bold paragraphs, links as their text). It builds elements, never HTML, so a reply can't inject anything.
- **Replies are short by design:** the comment prompt, `pilot_done`'s notes hint and the skill ask for one short sentence, like a chat message, with no lists or code blocks. It's a small chat box for quick design back-and-forth, not a report.
- **The thread** scrolls past a height, opens at its latest message and stays there while its content settles (fonts loading, a reply arriving) unless the designer scrolled up. Pilot's scroll thumb and edge fades, each shown only while there's more that way.
- **While the latest comment isn't answered**, where it stands shows as the reply to come, in the reply's bubble, with a band sweeping along its text: "Waiting for an agent…", "Claude Code is working on it…" (the agent's name, without its project), "Queued…". The real reply replaces it.
- **Sent right away** (`PilotSession.comment()`): each comment is a job of its own (a `CommentRequest`: the element, the thread so far with the new comment last, the page's breakpoints), its prompt built by `formatComment()` ([format.ts](../packages/protocol/src/format.ts)). Comments go to an agent only: without one, send is disabled and says "No agent connected".
- **The agent's notes are its reply:** its `pilot_done` notes join the thread ("Done." without notes), and the next comment carries them. Nothing to check (free text): done on the agent's word.
- **The agent decides** how to take it: a specific ask is done right away, like an edit; an open-ended one is an advanced task; a question gets an answer and no change.
- **Keys:** Enter sends, Option+Enter resolves, Esc closes; Shift+Enter is a new line. While typing a comment, Cmd/Ctrl+Z undoes the text, and Alt+D types.
- **Resolving** (Mark as solved, or Option+Enter) removes the thread and throws a short confetti burst from the button ([Confetti](../packages/overlay/src/ui/components/Confetti/Confetti.tsx), drawn by App as the widget closes; none with reduced motion).
- **Attachments:** the attach button picks images, text files (txt, md, csv, json, log) and PDFs, several at once, or they're dropped anywhere on the comment box: while files are over it, a blurred layer covers it with "Drop to attach" (the owner's design); the box takes the drop, so the browser doesn't open the file instead. They preview above the field (images as themselves, other files as a tile with their extension, a placeholder look), each removable. A comment can be attachments alone: they may hold the instructions (a screenshot, a sketch, notes, a spec), and the prompt tells the agent to ask in its reply if they're unclear. On send, the page uploads each file to the hub (`POST /attachments`, same origin check as jobs), which saves it in the **OS temp folder** ([attachments.ts](../packages/cli/src/attachments.ts)): never in the project, so nothing to commit or ship; named by content, so a resend is one file; cleared after a week when a hub starts, and by the system in time. The hub checks each file is what its type says (an image's or a PDF's signature; text as UTF-8 with no NUL bytes), and nothing ever serves, opens or runs them. The job names files by id only, and the hub adds each path when it takes the job, so a page can't point the agent at another file. `pilot_wait_for_edits` returns the new comments' images and text files' contents with the prompt, so the agent needn't open files; PDFs (and files too big to send inline) are opened from the path the prompt lists. The thread keeps a small preview of each image, for the designer. If an upload fails, nothing is sent and the draft stays.

### Threads that need you

A thread needs you when the agent spoke last. Replying sends it back to the agent, resolving removes it, opening it changes nothing (`PilotSession.attention`, `needsYou()`).

- **Every unresolved thread shows on its element**, with either tool: its outline, and a **comment icon** on its top-right corner that opens the thread (switching to Comment). While its latest comment is with the agent, the loader shows instead. No numbered pins: the icons mark the threads. It stays at the far right of the corner; the selection's actions and a job's loader sit on its left.
- **The Comment button** gets a pill with how many need you ("2 comments to review"). While Comment is on, each click opens the next one, oldest first, wrapping around, scrolled into view and flashed (threads on other pages skipped). Esc closes the widget and drops the selection; the next Esc turns the tool off.

## Elements being worked on

A job that isn't finished (waiting, an agent on it, being checked, its follow-up) is **on elements**: a task's or a comment's element, the elements an edits job changes (`PilotSession.jobOn()`, `busy`; found again by selector after a reload).

- **It shows**, selected or not, while Pilot runs: the element keeps its outline, its fill breathes (opacity only, so it runs on the compositor; still with reduced motion), and a **loader** takes its top-right corner ([SelectionActions](../packages/overlay/src/ui/components/SelectionActions/SelectionActions.tsx) `busy`), a stepped rotation so the graphics card turns it alone. Its tooltip says where the job stands. Placeholder look, pending design.
- **Cancel is on the loader:** hovering it turns it into an X while the agent isn't done, and a click takes the job back ("Cancel job"; a job on several elements is cancelled whole).
- **No second job goes to it.** Make responsive isn't offered, and Send leaves its changes out: they **wait**, and go as a job of their own once the job on it is finished (`held` in [session.ts](../packages/overlay/src/bridge/session.ts), saved by selector). So two agents, or the agent's edit and the designer's next one, never cross on one element. Only the changes of the elements that waited go then, not edits made meanwhile elsewhere. Send's tooltip says "Queued" (or "Sent; some queued"), and Send stays dimmed while all that's unsent waits. A cancelled job doesn't release what waited for it: its own changes are unsent again, and everything goes with the next Send.
- **Comments wait too.** One written while a job is on the element shows in the thread at once, says "Queued", and goes once the job is finished, with any others that waited, as one job carrying the whole thread (`waiting` on the message). The agent couldn't read it mid-job anyway (a chat takes its next job after `pilot_done`), and this way a second chat can't take it and edit the same code meanwhile, nor can its change land while Pilot is still checking the job before (which would send a follow-up undoing it). A comment's own job counts too: the next comment on that element waits for the agent's reply. Unlike held changes, waiting comments also go when the job is cancelled.

**The job list** ([JobList](../packages/overlay/src/ui/components/JobList/JobList.tsx)) isn't shown for now: what a history of the session should hold is open (what changed, before → after; how it landed; the files touched; a summary to copy). Its `statusText` and `whatText` give the loaders' tooltips.

## The hub

[packages/cli](../packages/cli): [hub.ts](../packages/cli/src/hub.ts), [server.ts](../packages/cli/src/server.ts), [agent.ts](../packages/cli/src/agent.ts), [mcp.ts](../packages/cli/src/mcp.ts).

- **One per machine**, on `127.0.0.1:4747` (`PILOT_PORT`). It lives in the first `usepilot mcp` process; later ones get `EADDRINUSE`, check `/health`, and talk to it over HTTP (`/agents/*`). When the hub's process ends (its chat closed), the next call of another agent fails to connect and that process takes over the port.
- **State is in memory only.** The page posts its unfinished jobs again on every connect, and the hub must accept a job posted again (idempotent by id), so a takeover loses nothing.
- Remote agents ping regularly and are dropped after missing a few.
- **Versions:** every process checks the hub's bridge version (`/health`, `BRIDGE_VERSION` in `@pilot/protocol`) and refuses to join one of another version (3 since comment images): update Pilot in every agent, or close the chat running the old one.
- **Follow-ups:** `POST /jobs/:id/retry` puts a done job back in the queue once (`attempt: 2`, with its `differences`), given first to the agent that did it if it's waiting (`Hub.retry()`).
- **Routing:** jobs are filed by page origin (`localhost`, `127.0.0.1` and `[::1]` count as the same, `originKey()`): an agent only gets jobs from the page it launched for. Two repos open at once stay separate.
- **Security:** the page's origin comes from the `Origin` header, never from the request body; jobs are only accepted from an origin an agent registered, so another website can't hand prompts to the agent. Agent routes refuse any request with an `Origin` (browsers send one, Node doesn't). Keep both checks for every new route.

## The page side

[bridge/](../packages/overlay/src/bridge). `BridgeClient` listens to Server-Sent Events (`agents`, `launch`, `job`) and reconnects every few seconds while the hub is away, so `/pilot` opens Pilot within seconds (`bridge: false` in `mountPilot` turns it off). `PilotSession` (owned by `mountPilot`, like the history) runs Send, keeps the jobs (saved in `sessionStorage`, `pilot:jobs`), and checks done jobs.
