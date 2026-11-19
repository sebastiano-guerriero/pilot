# On the page

What Pilot draws on the page and how you work with it, apart from the property dialog ([property-dialog.md](property-dialog.md)) and handoff ([handoff.md](handoff.md)).

## Launching and quitting

- **Option+P** (Alt+P) launches Pilot on any page of the app. `mountPilot({ shortcut })` changes the key, and `false` turns it off. It's ignored while typing in the page's own fields. `/pilot` in the agent launches it too ([handoff.md](handoff.md)).
- Pilot is loaded in dev but invisible until launched.
- The toolbar's **Quit** button quits it.
- Pilot remembers whether it's running **per browser tab**, so the reloads a dev session triggers all the time (the agent editing files, HMR) don't open or close it by themselves. A launch or quit in the tab wins over `mountPilot({ launch })`.

## The toolbar

[Toolbar](../packages/overlay/src/ui/components/Toolbar/Toolbar.tsx). The owner's design.

- **Buttons, in order:** Comment, a divider, Select, Send, the jobs button (only while there are jobs), a divider, Quit. Icons are Nucleo UI.
- **Position:** starts centered near the bottom edge. Drag it by the strip along its top edge (the grip), as on the property dialog. It moves by its center, so it stays centered on its spot as it widens, is kept inside the window (on resize too), and stays put through reloads (the tab's sessionStorage, [toolbarSpot.ts](../packages/overlay/src/ui/toolbarSpot.ts)).
- **Pills** are the counts on buttons: comments to review, changes Send would send, jobs in progress.
- **Comment** and **Select** are the two tools; one is on at a time. Option+C turns on Comment and Option+V Select (Option with a key, like Option+P and Alt+D, so the page's plain-key shortcuts keep working; not while typing a comment or in the page's own fields; `toolShortcut()` in [App.tsx](../packages/overlay/src/ui/App.tsx)). Switching tools keeps the selection. Clicking the tool that's on doesn't turn it off: Esc does. Instead, Comment's button goes to the next thread that needs you ([handoff.md](handoff.md), *Comments*); Select's does nothing.
- **Send**: with an agent on this page, sends the changes not sent yet as a job; without one, it's **Copy prompt** and copies everything in effect. Its pill counts the changes it would send (unsent ones, less those waiting for a job). With nothing to send it's dimmed and disabled. It isn't an accent button. Once the prompt is copied its icon morphs into a check for a moment. After a send its tooltip says Sent / Copied (or Queued, Sent; some queued) for a moment, hovered or not.
- **Jobs**: while jobs aren't finished, a button with a loader and a pill for how many. Its arrival is animated (its slot grows, so the toolbar widens and stays centered). Clicking it goes to the **next job**: its elements are scrolled into view (unless they already are) and flash. Oldest first, as the agents take them, wrapping around; jobs with no element on this page are skipped (`nextJob` in [App.tsx](../packages/overlay/src/ui/App.tsx)).
- **Quit** closes Pilot.
- Each button names itself in a Tooltip, with short labels: Select element, Send to agent (or Copy prompt; Nothing to send / Nothing to copy when disabled), 2 jobs running, Quit Pilot.

## Selecting

With the Select tool on ([select/](../packages/overlay/src/select)):

- **Hovering** outlines the element and labels it with its **name and size** (`article[data-slot=card] 293×110`) above its top-left corner. Next to icons on the element's top-right corner (a job's loader, a comment) or the selection's actions on the same row, the label stops short of them: first without the size, then with the name cut ("…"), and below the element when there's no room at all. On a row with the selection's actions it's lined up with them (`labelRoom`, `labelShift` in [Highlight](../packages/overlay/src/ui/components/Highlight/Highlight.tsx); `labelPlace` in [App.tsx](../packages/overlay/src/ui/App.tsx)).
- **A click selects.** Pilot catches the click, so the page's own handlers and links don't fire. The selection gets an outline with a handle on each corner (only the outline on an element too small to tell the four apart), and **no label**: you know what you clicked, and its corner holds the selection's actions. Hovering the selection doesn't add one either.
- **Shift+click adds** an element to the selection, or takes it out (see *Several elements* below).
- Select mode stays on, so you can click another element to switch to it. **Esc** clears the selection; with nothing selected, Esc turns the tool off. Clicking the tool again turns it off, clears the selection, and the page behaves normally again.

### Several elements

Selecting several elements edits them together: "these cards", without saying what they have in common ([App.tsx](../packages/overlay/src/ui/App.tsx), `others`).

- **On the page:** Shift+click, with Select or Comment, adds an element, or takes it out. A plain click selects just that one again. **In the DOM tree:** Cmd/Ctrl+click adds or takes out a row; Shift+click selects every selectable row between the last one clicked and this one.
- **The first one leads:** the selection's actions sit by it (a thread is on it, a task's width check measures it), and the others get the same outline, without handles. Taking out the first one makes the next the first.
- **The panel follows the latest one added:** the property dialog (or the comment box) picks its spot again beside the element added last, so it's next to what was just clicked (`placeBy`); after Select similar, beside the last of them, in page order. Taking that one out puts it back by the first. Only adding moves it: editing never does.
- **The dialog edits them all.** Its list holds the properties any of them sets; each change goes to every selected element as **one undo step**, sent in one job. A field whose value differs between them is empty with the placeholder **Mixed**; typing a value sets it on all of them, clearing it clears it on all. A revealing editor with a mixed value (display, position) shows no rows, since they'd differ per element.
- **Select similar** ([dom/similar.ts](../packages/overlay/src/dom/similar.ts)) finds the elements like the first one **by component first**, where Pilot reads the page's components ([dom/component.ts](../packages/overlay/src/dom/component.ts), *Components* below): the nearest component rendering the element that has other instances on the page is the repeated unit, whatever their props, so `<Button variant="primary">` and `variant="ghost"` are both Buttons, the same code. The same part of each instance is found by the path from its top-level element down to the element, by tag and position (variants may differ in classes). A component with one instance (the page's Hero) passes it on to the component around it. **Else by the page's structure**, for plain HTML: first the **repeated unit**, the nearest of the element and its ancestors with look-alikes, elements with the same tag and classes anywhere on the page (nearly the same with the same children, for a copy the page's script marked `active`), the same `data-slot` for a classless one, or else siblings with the same tag and children (a list's items, a table's rows). A classless element with no children is never a unit: paragraphs side by side are a text, not copies. Then the **same part** of each copy, by walking the path from the unit down to the element (the child with the same tag and classes, at the same position); a copy without it (a card with no badge) is left out.
- **Comments too:** with several selected, a comment, or a task from the comment box, is about all of them, as one job ([handoff.md](handoff.md), *Comments*).
- **What needs one element** isn't offered with several: Show in DOM, the hover label and editing text in place.

Why the union and not the shared properties: what one card sets and the others don't is often what the designer wants to line up. Why Mixed rather than the first one's value: showing one value would suggest they all have it, and an unchanged field would look like a choice.

### Components

[dom/component.ts](../packages/overlay/src/dom/component.ts) reads the page's components from what the framework leaves on the DOM in development (Pilot only runs there): which component instance renders an element, every instance of it on the page, and where its code is. Plain HTML, or a framework Pilot doesn't read yet (Svelte, Angular), gives nothing, and Select similar uses the page's structure.

- **React** (16 and later): each DOM node carries its fiber (`__reactFiber$…`). Pilot walks the live tree from its root (the root's `current`, never stale copies); a component is its type, the function or class, so every `<ProductCard>` is an instance whatever its props. The component named for an element is the one whose code wrote it (its owner). Its file comes from `_debugSource` (React 18 and earlier, with the line) or, in React 19, from the stack React records where the element was created: the first frame that's the app's own code (not React, a dependency or a bundle chunk), file only, since that line is the transformed module's. Bundlers that name chunks instead of files (Next.js's Turbopack) give no file.
- **React Server Components** (Next.js's App Router, its default): they have no fibers on the client. In development React records each one on the fibers it rendered (`_debugInfo`) and as the owner of the elements it wrote (`_debugOwner`), by name: an instance is one record, its elements the fibers that carry it. With Server Components on the page, a client component counts only when the chain of who created it reaches one of them (the app's pages and layouts): the framework's own components (`InnerLayoutRouter`, `SegmentViewNode`…) trace back to none. Telling them apart by where their code lives doesn't work: Turbopack's chunk names don't say. Their stacks are the server's, so they give no file.
- **Files the page can't name** (React 19 under Turbopack, whose stacks name bundle chunks; Server Components; React 19's lines anywhere): the CLI finds the component's declaration by name in the project (`function ProductCard`, `const ProductCard =`, `class ProductCard`; a file named after it first, then an exported one: `componentFile()` in [locate.ts](../packages/cli/src/locate.ts)), then the element's own line in it, before the agent gets the job. So the agent's job points at the line; a pasted prompt has the component's name.
- **Vue 3**: each element carries the component that rendered it (`__vueParentComponent`); instances come from walking the app's tree from its root; the file is the component's `__file`.
- **What it feeds:** Select similar and the look-alike counts (by instance), and each element the agent gets: its component and file (`source`, the prompt's "Component" line) and, for look-alikes found by component, whose instances they are (`lookAlikesOf`), so the agent opens the right file and knows the change touches shared code.
- **Why from the DOM, not a build plugin:** it works in any project with no setup, which is what Pilot's install promises; a plugin per bundler would give exact lines everywhere but need configuring per project.

### Element names

The name says what's about to be selected ([dom/name.ts](../packages/overlay/src/dom/name.ts)), the most telling one first:

1. its id: `section#features`;
2. a naming data attribute: the project's own first (`mountPilot({ nameAttributes: ["data-block"] })`), then the common ones, `data-testid`, `data-test`, `data-cy`, `data-qa`, `data-slot` (shadcn/ui), `data-component`, `data-name`, `data-section`: `div[data-testid=hero]`;
3. a form field's `name`: `input[name=email]`;
4. its tag: `article`, `a`.

Classes are never used: there's no reliable way to tell a meaningful one (`card`) from a utility (`flex`, `p-4`). Nor are other data attributes, which libraries use for state (`data-state="open"`), nor `aria-label` and the element's text, which are for readers, not what an element is styled by. Component names (React, Vue, Svelte…) will come first once Pilot reads them. The change set's DOM path still uses classes (`shortName()`), since they help the agent find the element. The playground has an example of each.

### Selection actions

[SelectionActions](../packages/overlay/src/ui/components/SelectionActions/SelectionActions.tsx): small accent buttons above the selection's top-right corner (inside it when the element touches the top of the window). The same with either tool. The corner holds status and navigation only, a few icons at most; tasks for the agent are the comment box's `/` actions ([handoff.md](handoff.md), *Actions*), where a list can grow without crowding the element.

- **Select similar** adds the elements like the selected one to the selection: the same part of each copy of what repeats, so a card's title selects every card's title, not every heading (see *Several elements*). Its tooltip says how many ("Select 2 similar"). Only there while some of them aren't selected yet.
- **Show in DOM** (`< >`) opens the DOM tree on it.
- While a job isn't finished on the element, its **loader** takes the corner and says in its tooltip where the job stands; Show in DOM moves to its left. An unresolved comment thread puts its **comment icon** on the corner, at the far right. See *Elements being worked on* and *Comments* in [handoff.md](handoff.md).

### Grid lines

[GridOverlay](../packages/overlay/src/ui/components/GridOverlay/GridOverlay.tsx), lines from [dom/gridLines.ts](../packages/overlay/src/dom/gridLines.ts).

- **Grid containers** show their grid lines on hover, and numbered once selected, numbered as CSS numbers them (1 at the start edge). Columns are numbered just below the content box, rows to its left.
- Between tracks with a gap, both edges of the gap are drawn and the number sits in the middle.
- Lines on the element's outline (the outer lines, without padding or border) aren't drawn, since they'd only double it. Their numbers stay. The first and last numbers are placed so they never overlap each other or a corner, even in a row shorter than two badges.
- The numbers are drawn above everything else (lines, outline, dots, stripes), so nothing covers them. Digits are tabular.
- The lines stay while editing, padding and margin included (only an area that hides the selection hides them, see `hidesSelection()` in [editors.md](editors.md)). While the gap field is in use, the gaps are striped on top of them.
- They come from the computed track sizes, implicit tracks included. `justify-content`/`align-content` `center` and `end` are accounted for; the `space-*` values are drawn from the start edge. This is a page overlay, so computed values are fine here: the "no computed values" rule is about fields.
- **Grid items** show their parent's grid when selected (the lines they're placed on, for col-span, col-start and col-end: `orParent`). The parent's border box is then dashed like the lines, since its outer lines aren't drawn and it has no outline. An element that's a grid itself shows its own.

### Editing text in place

[select/inlineText.ts](../packages/overlay/src/select/inlineText.ts), with the Select tool only.

- **Double-click a text** to edit it where it is: the element is selected and the word under the pointer selected, as a double-click does in any text.
- **Enter** (or clicking elsewhere, or moving to the property dialog) is done; **Esc** cancels and keeps the selection.
- An element whose content is text alone (`isTextOnly()` in [dom/text.ts](../packages/overlay/src/dom/text.ts): a `p`, `h2`, `a`, `button`, `span`; not form fields) is edited whole. In an element with child elements (`A sample page, <code>/pilot</code> launches it.`), the double-click edits the **text run** under the pointer, the text between two child elements, and the child elements stay as they are (double-click the `<code>` to edit its own text). While it's edited the run sits in a `<span contenteditable>` that goes away afterwards (`textRunAt()`).
- Single line: Enter is done, pasted line breaks become spaces, and only plain text goes in.
- While editing, the element (or the run's span) is `contenteditable="plaintext-only"` (attributes and nodes put back after). Keys, clicks and input never reach the page's handlers (a link isn't followed, a button doesn't submit). Cmd+Z there is the text's own undo.
- Each edit is a **text change** in the history, one undo step, sent and checked like any other ([edits.md](edits.md), *Text changes*). Typing the page's own text back drops it. Emptying an element is cancelled, as removing an element's text isn't a text change.

## Pilot never moves the page's elements

Bringing an element into view (a row picked in the DOM tree, the jobs button, the next comment) scrolls **the window only** ([dom/reveal.ts](../packages/overlay/src/dom/reveal.ts)), never the page's own containers. `scrollIntoView()` would scroll every container around the element, `overflow: hidden` ones included (a script can scroll those), and the page's content would move: a collapsed sidebar's items slide, a carousel jumps, and the designer edits a page that isn't as their code draws it. An element a container hides stays hidden. Pilot's own lists (the DOM tree's rows, a select's options) scroll themselves (`scrollWithin()`), never the page behind them. A test fails on any `scrollIntoView()` in the overlay. Only an edit or a comment may move the page's elements, on purpose.

## The DOM tree

[DomTree](../packages/overlay/src/ui/components/DomTree/DomTree.tsx), [dom/domTree.ts](../packages/overlay/src/dom/domTree.ts). Plumbing done; its look beyond what's described is a placeholder, pending design. Named after the real thing, not a design tool's "layers": Pilot works on the page itself.

- **What for:** selecting any element, wherever it is: two elements with the same box, one under an `::after`, zero-size, off-screen; and changing the DOM itself (the row menu below).
- **It starts at the body**, the wrapper of everything: always the first row, open, selectable. On a page with no elements yet it's the only row, and the place to add the first one.
- **Open** with **Alt+D** (anywhere but the page's own text fields and a comment being typed) or the selection's Show in DOM. Alt+D, its close button or Esc in it closes it, and so does the Esc that drops the selection.
- **Where:** on the left, its top level with the selected element's when it opens, like the property dialog, and kept on screen (centered with nothing selected). It doesn't move as the selection changes, so picking rows never shifts it under the pointer. It's as tall as its rows, up to the window; beyond that the rows scroll. Its top stays put as rows open and close: it grows down, and only moves up when growing would take it off screen, which sticks, as on the property dialog (`panelPosition()`).
- **Move and resize:** drag the strip along its top edge to move it; drag its bottom edge to set its height (no visual for the bottom edge yet). Reopening it puts it back where it was and as tall as it was, while the page is open.
- **Rows** describe their element the way its code would tell it apart (`describe()`): the tag, then dimmed: its identifiers (`#id` and every `data-*` attribute, Pilot's own left out; never classes), what it points at or is (a link's `href`, a media element's `src`, an image's first `srcset` candidate, a field's `type` and `name`, a label's `for`, a form's `action`, a `role`, and an `aria-label` for an element with no text of its own), and its own text: `figure[data-technician]`, `img(src="/images/user-2.png")`, `a(href="/about") About`. URLs on the page's own site drop the site; long values keep their end (`…/images/hero.jpg`).
- Scripts, styles and Pilot itself aren't listed. `::before` and `::after` show as rows of their own, dimmed and not selectable (they show what may be covering things; changes are for elements). Elements inside other shadow roots aren't listed yet.
- Rows are all as wide as the widest one (at least the panel's width), so deep or long ones scroll the list sideways. Selecting a row scrolls its name into view, sideways too.
- **It follows the selection:** selecting on the page (or Show in DOM) opens it down to the selection (ancestors expanded, its children one level open). Selecting a row in the tree, by click or key, opens nothing: rows open and close only with the chevron or →/←, so moving through the list keeps its shape.
- **Hovering** a row highlights its element on the page. **Clicking** selects it, the window scrolled to it when it's out of view (only the window: see *Pilot never moves the page's elements* below), and the property dialog follows without taking focus, so the panel's keys keep working: ↑/↓ select the previous/next row, → opens a row (or goes to its first child), ← closes it (or goes to its parent). →/← never scroll the list sideways, the browser's default for a focused scroller: with nothing to open or close, they do nothing. (Before, a selected row opened itself, so ↓ walked into every row's children.)
- **Cmd/Ctrl+click** adds a row's element to the selection (or takes it out), **Shift+click** selects the range from the last row clicked; every selected element's row is marked ([Several elements](#several-elements)). Rows have no gap between them, so selected rows next to each other join into one block, square where they meet.
- **Right-click a row** for its menu: **Add child**, **Add sibling**, **Duplicate**, **Delete**. A row in the selection acts on all of it (one undo step); another row is selected first. The body only gets children. What's added is selected (a copy, the new element); after Delete, the row after the first deleted one (else before it, else its parent). Deleted rows leave the tree; their elements stay on the page, hidden, until the code removes them, and new elements are Pilot's own until the code has them ([edits.md](edits.md), *DOM changes*). Only in the tree, not on the page. The menu has no keys yet: shortcuts are to be decided. Its look is a placeholder, from the property select's menu ([ContextMenu](../packages/overlay/src/ui/components/ContextMenu/ContextMenu.tsx)).
- The tree updates as the page changes (a MutationObserver on the document).

## Viewport width and breakpoints

[ViewportWidth](../packages/overlay/src/ui/components/ViewportWidth/ViewportWidth.tsx). Hidden until you need it.

- **Showing it:** hover an invisible strip along the top of the window. It stays while the pointer is on it (with invisible margin below, so it doesn't hide the moment the pointer leaves the button), and also shows while the window is being resized, hiding shortly after the last resize (`data-resizing`), so you can watch the width while dragging the window's edge. No animation with reduced motion. Nothing in it can be selected as text.
- **A ruler** from the window's left edge, in the accent, with ticks and no numbers.
- **The width button** at the right end: the window's width in CSS px (`1108`), live. It's the width media queries test (`window.innerWidth`, scrollbar included). Clicking it sets the **width chip** ([property-dialog.md](property-dialog.md), *Viewport widths*).
- **The page's breakpoints** on the ruler at their widths (`640`, `960`), only those narrower than the window. Where one meets the width button, it's drawn on top. Clicking one works like clicking the width: the chip becomes `from` it, Shift+click `to` it, and a typed `from`/`to` is finished the same way.
- **Where breakpoints come from:** the page's stylesheets as they are now (`pageBreakpoints()` in [dom/breakpoints.ts](../packages/overlay/src/dom/breakpoints.ts)), read again each time the bar shows, so a breakpoint changed in the tokens shows after hot reload. Every `@media` width condition counts: `(min-width: 768px)`, `(max-width: 767.98px)`, Tailwind v4's `(width >= 48rem)`. `em`/`rem` are 16px (in media queries they're the browser's initial font size, not the page's), values are rounded to whole pixels, and two 1px apart (`max-width: 767px` next to `min-width: 768px`) count once, as the larger.
- **Breakpoint names** (`md`) aren't read: Tailwind v4 only outputs the theme variables a page uses, so they're often missing. The agent maps widths to names from the project's config. Container queries, `device-width` and cross-origin stylesheets are left out.
- The playground has two breakpoints to try it: `40rem` (640) and `960px`.

## Tooltips

[Tooltip](../packages/overlay/src/ui/components/Tooltip/Tooltip.tsx), Pilot's own. Use it rather than `title` anywhere in Pilot's UI.

- Centered above its trigger (or below), scaled in from the side facing it.
- **Delay**, as Base UI's tooltips do ([Tooltip/delay.ts](../packages/overlay/src/ui/components/Tooltip/delay.ts), shared by all): on hover the first one waits a moment; once one has shown, the next opens at once while one is open or closed only just now. Keyboard focus opens it at once.
- **Moving between triggers has no transition:** a tooltip opened straight after another appears at once and tells the others (`switched()`), so the one left behind vanishes at once too, and sweeping along the toolbar doesn't lag.
