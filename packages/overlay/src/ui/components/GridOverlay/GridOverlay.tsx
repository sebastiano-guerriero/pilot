import { anchorAt } from "../../../dom/anchor.ts";
import { type GridLine, drawnPositions, measureGrid } from "../../../dom/gridLines.ts";
import { px } from "../../px.ts";
import { useMeasured } from "../../useMeasured.ts";
import { PageAnchor } from "../PageAnchor/PageAnchor.tsx";

interface GridOverlayProps {
  element: Element;
  /**
   * Which part to draw. They're separate layers so the App can stack them:
   * lines under the selection highlight and the gap stripes, numbers above
   * everything (so the outline and corner dots never cover them).
   */
  part: "lines" | "numbers";
  /**
   * When the element isn't a grid itself, draw its parent's grid, if the
   * parent is one: a selected grid item shows the lines it's placed on (for
   * col-span, col-start…). Its own grid wins when it's both.
   */
  orParent?: boolean;
}

/**
 * For a grid container: its grid lines, and (when selected) their numbers,
 * like CSS numbers them (1 at the start edge). Hovering a grid shows just the
 * lines. Columns are numbered below the content box, rows to its left.
 * Between tracks with a gap, both edges of the gap are drawn and the number
 * sits in the middle. Lines on the element's outline (no padding or border)
 * aren't drawn: they'd only double it. Their numbers stay. While the gap field
 * is hovered or focused, BoxAreas also stripes the gaps, along with the lines.
 * With `orParent`, a grid item shows its parent's grid instead, with the
 * parent's border box dashed too (it has no selection outline). Nothing is
 * drawn for other elements. Re-measured every frame;
 * purely visual, never receives events.
 */
export function GridOverlay({ element, part, orParent }: GridOverlayProps) {
  const lines = part === "lines";
  const numbers = part === "numbers";
  // With the scroll it was measured at: drawn in the page (PageAnchor), as far
  // as the grid's box and its numbers (half outside it) reach.
  const measured = useMeasured(element, (el) => {
    const own = measureGrid(el);
    const found = own ? { grid: own, parent: false, of: el } : orParent && el.parentElement ? { grid: measureGrid(el.parentElement), parent: true, of: el.parentElement } : null;
    if (!found?.grid) return null;
    const { box } = found.grid;
    return { grid: found.grid, parent: found.parent, at: anchorAt(found.of, { bottom: box.top + box.height }) };
  });
  if (!measured) return null;
  const { grid, parent, at } = measured;
  const { content } = grid;
  const edge = (line: GridLine, lines: GridLine[]) =>
    line.number === 1 ? "start" : line.number === lines.length ? "end" : undefined;
  return (
    <PageAnchor at={at}>
      <div class="grid-overlay" aria-hidden="true">
        {/* A selected grid's outer lines are its selection outline. The parent
            grid of a selected item has no outline, so its border box is drawn
            dashed like the lines: the outer lines aren't missing. */}
        {lines && parent && (
          <div
            class="frame"
            style={{
              left: px(grid.box.left),
              top: px(grid.box.top),
              width: px(grid.box.width),
              height: px(grid.box.height),
            }}
          />
        )}
        {lines &&
          grid.columns.flatMap((line) =>
            drawnPositions(line, grid.box.left, grid.box.left + grid.box.width).map((x) => (
              <div
                key={`c${line.number}-${x}`}
                class="line"
                data-axis="column"
                style={{ left: px(x), top: px(content.top), height: px(content.height) }}
              />
            )),
          )}
        {lines &&
          grid.rows.flatMap((line) =>
            drawnPositions(line, grid.box.top, grid.box.top + grid.box.height).map((y) => (
              <div
                key={`r${line.number}-${y}`}
                class="line"
                data-axis="row"
                style={{ top: px(y), left: px(content.left), width: px(content.width) }}
              />
            )),
          )}
        {numbers &&
          grid.columns.map((line) => (
            <span
              key={`cn${line.number}`}
              class="number"
              data-axis="column"
              data-edge={edge(line, grid.columns)}
              style={{ left: px((line.start + line.end) / 2), top: px(content.top + content.height) }}
            >
              {line.number}
            </span>
          ))}
        {numbers &&
          grid.rows.map((line) => (
            <span
              key={`rn${line.number}`}
              class="number"
              data-axis="row"
              data-edge={edge(line, grid.rows)}
              style={{ top: px((line.start + line.end) / 2), left: px(content.left) }}
            >
              {line.number}
            </span>
          ))}
      </div>
    </PageAnchor>
  );
}
