import type { ComponentChildren } from "preact";
import type { At } from "../../../dom/anchor.ts";
import { px } from "../../px.ts";

/**
 * Draws what follows an element in the page rather than in the window, so
 * the browser scrolls it along with the page, with no lag (dom/anchor.ts):
 * a point in the page at the scroll `at` was measured at, where the window's
 * top-left corner was then. Its children keep their window coordinates,
 * measured with `at`, and are drawn from that point: their CSS has
 * `position: var(--_place, fixed)`, which it sets to absolute. With `at`
 * null, they stay fixed in the window, as without it. The same element
 * either way, so switching doesn't remount what's in it.
 */
export function PageAnchor({ at, children }: { at: Pick<At, "x" | "y"> | null | undefined; children: ComponentChildren }) {
  return (
    <div class="page-anchor" data-page={at ? "" : undefined} style={at ? { left: px(at.x), top: px(at.y) } : undefined}>
      {children}
    </div>
  );
}
