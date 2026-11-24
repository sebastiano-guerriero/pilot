# Benchmark

How long Pilot's jobs take, measured on the bench lab (`../pilot-lab-bench`, [development.md](development.md), *The bench lab*): each job one thing a designer does in Pilot, on a fixed element, with a fixed value, so the times compare across runs, agents and Pilot versions. Run each one 3 times, `npm run reset` in the lab between runs.

**The list lives here, not in the lab** (2026-11-24): in the lab, the agent found it while searching the project and read it for clues about what the designer wanted (two of the first comments read it, one twice), which no real project would make it do. The lab holds only the app, so its times are an app's.

**How to record a run:** the browser console prints `[Pilot] Job done in …s: waiting …, agent …, Pilot's check …` for each finished job; the terminal running Pilot prints the run's seconds and the reply's first line. Note also whether the result was right (the page shows the value, in the project's style) and whether a follow-up was needed.

## Edits (Select, change, Send)

| # | Page | Element | Change | What it exercises |
| --- | --- | --- | --- | --- |
| E1 | `/` | Hero title, "Gear that goes the long way round." | font-size 48px → 60px | One Tailwind class with a step in the scale (`text-5xl` → `text-6xl`) |
| E2 | `/` | Header nav (Shop · Journal · Account) | gap 24px → 32px | A one-off component (`Header`), `gap-6` → `gap-8` |
| E3 | `/` | First feature's icon box (truck icon) | border-radius 12px → 16px | A component used 3 times: the agent should ask "only this or all?" |
| E4 | `/` | First product card's text area ("Ridgeline 45L Pack") | padding 16px → 20px | A shared component (`ProductCard`, 8 on the page): asks too |
| E5 | `/` | Newsletter box ("Trail notes, once a month") | padding-top and padding-bottom 56px → 72px | A CSS module (`Newsletter.module.css`), not Tailwind |
| E6 | `/journal` | First article title | font-size 20px → 24px, color → `--color-brand-900` | A CSS module, two changes, a token |
| E7 | `/account` | First stat value ("12") | font-size 30px → 36px, font-weight 700 → 600 | Two changes on a shared component (`StatCard`, 4 on the page) |
| E8 | `/` | Hero paragraph | text → "Packs, shelters and layers for weeks outside, repaired for life." | A text edit |
| E9 | `/shop` | Product grid | grid-template-columns 3 → 2, width chip below 1024px | A change for some widths only (a media query) |
| E10 | `/` | Hero title, then Hero paragraph, then the primary button, sent once | font-size 60px; color `--color-ink-700`; padding-left/right 24px → 32px | Three elements in one job |

## Comments (Comment, write, Enter)

| # | Page | Element | Comment | What it exercises |
| --- | --- | --- | --- | --- |
| C1 | `/` | Footer's "Help" column | "Make these links a bit lighter and give them more room between each other" | An open ask: the agent picks values |
| C2 | `/` | Newsletter's Subscribe button | "Use the brand green here, with white text" | A CSS module and a token |
| C3 | `/account` | The "Shipped" status pill | "Shipped should look like a warning, not like info" | A component with a lookup of tones (`StatusBadge`) |
| C4 | `/product/ridge-45` | "Add to cart" button | "Can this be the same height as the quantity stepper?" | A question about two elements; may answer without a change |
| C5 | C1's thread | The same footer column | "A little less, it's too faint now" | A follow-up comment: resumes the thread's session |

## Tasks (Comment, `/` action)

| # | Page | Element | Action | What it exercises |
| --- | --- | --- | --- | --- |
| T1 | `/` | Hero section | `/responsive` | An advanced task, and Pilot's width check after it |
| T2 | `/` | First product card | `/props` | Reading a component's props (`ProductCard`: `compact`) |
| T3 | `/account` | Orders table | `/break` | Stress-testing with odd content, then putting it back |

## Bursts (several jobs at once)

A designer reviewing a page writes comment after comment without waiting for replies. The runner runs at most 5 jobs at once (`SLOTS` in [run.ts](../packages/cli/src/run.ts); 3 when B1 was first measured, raised after it); a burst shows whether the rest wait for a slot ("waiting for an agent" in each job's console line), and whether jobs at once run slower than alone.

| # | Page | What to send, as fast as you can type it | What it exercises |
| --- | --- | --- | --- |
| B1 | `/` | Six comments on six elements: the hero title "make this a bit bolder"; the hero's "Shop the collection" button "less round corners"; the "Shop by category" tile grid "3 columns below 1024px, 2 below 640px"; the testimonials grid "stack these on small screens"; the newsletter's Subscribe button "brand green, white text"; the footer's "Help" column "lighter links" | Six jobs for three slots, two of them long (responsive): how long the others wait |

Record each job's waiting, agent and total time, and the order they finished in.

## Results

One row per run. Times in seconds, from the console line; "steps" from the agent's output when the runner logs them.

| Date | Pilot | Agent | Job | Run | Waiting | Agent | Check | Total | Right? | Follow-up? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-24 | checkout (bridge 8) | Cursor 2026.11.22 | E1 | 1 | 0 | 13.9 | 0 | 13.9 | Yes (`text-5xl` → `text-6xl`) | No | First job of the runner: a new session, the guidelines in full |
| 2026-11-24 | checkout (bridge 8) | Cursor 2025.09.12 | E1 | – | – | – | – | – | Failed | – | This Cursor CLI predates `--trust` and `--sandbox`: the run exits at once, "printed nothing" |
| 2026-11-24 | checkout (bridge 8) | Cursor 2026.11.22, Auto | B1 | 1 | 0 / 0 / 0 / 0 / 10.7 / 9.6 | 13.4 / 26.5 / 17.2 / 28.3 / 15.7 / 48.2 | 0 | 80.7 (last done, from the first send) | 5 done, 1 asked (Button's radius, shared) | No | Six comments sent within 23s (title, button, tile grid, testimonials, Subscribe, footer links). The two sent once 3 ran waited about 10s each for a slot. Rounds per job 2–5, none refused; agent time per round 3–16s with no pattern from running 3 at once (the slowest, 48s in 3 rounds, ran mostly beside one other job) |
