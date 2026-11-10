---
name: pilot
description: Hand UI control to the designer with Pilot, then apply the design edits they send back. Use when the user runs /pilot, says they want to take control of the design, or pastes a "Pilot design edits" brief.
---

# Pilot

> Draft. The MCP tools named here are planned and not implemented yet (see the repo README roadmap).

Pilot lets the designer edit the running app in the browser. They select elements, change CSS properties with Pilot's editors, and send the result back to you as a **change set**: plain CSS `property: from → to` on identifiable elements.

## When the user runs /pilot

1. Make sure the app's dev server is running and Pilot is installed (the overlay is imported in dev).
2. Call `pilot_launch` so the Pilot toolbar appears in the open page, then tell the user Pilot is ready.
3. Call `pilot_wait_for_edits`. It returns when the designer clicks **Send to agent**.
4. Apply the change set (below), then summarize what you changed.

## Applying a change set

The values are **intent, not code**. Translate them into this project's conventions:

- **Tailwind:** use the closest utility or theme value (`border-radius: 12px` → `rounded-xl`). Use arbitrary values only when nothing fits.
- **CSS / CSS modules / Sass:** edit the rule that styles the element. Don't add a new override.
- **Design tokens / CSS variables:** prefer an existing token that matches. Don't hard-code its value.
- **CSS-in-JS:** edit the styled definition or `sx` / `style` object where the component is styled.

Rules:

- Never leave inline styles behind. Pilot's inline styles are only a preview.
- Find each element by its selector, DOM path, and text snippet, then locate the component that renders it.
- If an element comes from a shared component, ask before changing every instance. Otherwise, scope the change, for example with a variant or prop.
- If you approximated a value to fit a token or scale, say which one and by how much.
