/**
 * A ::before or ::after's box on the page (viewport px), for the DOM tree's
 * hover highlight. Browsers give no box for a pseudo-element, so it's worked
 * out from its computed style (Chrome resolves its width and height, and a
 * positioned one's offsets and margins):
 * - **Positioned** (absolute, fixed): its offsets from its containing block's
 *   padding box. Exact (the Popular ribbon, a hero's glow).
 * - **In a flex row or column:** the first item (::before) or the last
 *   (::after), beside the owner's first or last child, at its alignment
 *   (a list's checkmark, a badge's dot, an eyebrow's line); with the items
 *   spread (`justify-content: space-between`), at the start or the end (an
 *   FAQ's +).
 * - **A block in block flow:** the top (::before) or bottom (::after) of the
 *   owner's content box.
 * Null where it can't be told (inline text, a grid's placement, a reversed,
 * wrapping or spaced-around flex): the owner is highlighted instead.
 */
export function pseudoRect(owner: Element, pseudo: "::before" | "::after"): DOMRect | null {
  const style = getComputedStyle(owner, pseudo);
  if (style.display === "none" || style.content === "none" || style.content === "normal") return null;
  const contentWidth = len(style.width);
  const contentHeight = len(style.height);
  if (contentWidth === null || contentHeight === null) return null;
  // The border box: width and height are the content's unless box-sizing says otherwise.
  const borderBox = style.boxSizing === "border-box";
  const width = contentWidth + (borderBox ? 0 : edges(style, "Left") + edges(style, "Right"));
  const height = contentHeight + (borderBox ? 0 : edges(style, "Top") + edges(style, "Bottom"));
  const margin = { top: len(style.marginTop) ?? 0, right: len(style.marginRight) ?? 0, bottom: len(style.marginBottom) ?? 0, left: len(style.marginLeft) ?? 0 };
  const shift = translation(style.transform);
  const at = (x: number, y: number) => new DOMRect(x + shift.x, y + shift.y, width, height);

  if (style.position === "absolute" || style.position === "fixed") {
    const left = len(style.left);
    const top = len(style.top);
    if (left === null || top === null) return null;
    const block = containingBlock(owner, style.position === "fixed");
    return at(block.x + left + margin.left, block.y + top + margin.top);
  }

  const ownerStyle = getComputedStyle(owner);
  const content = contentBox(owner, ownerStyle);
  const before = pseudo === "::before";
  if (/flex/.test(ownerStyle.display)) {
    if (ownerStyle.flexWrap !== "nowrap") return null;
    const row = ownerStyle.flexDirection === "row";
    if (!row && ownerStyle.flexDirection !== "column") return null;
    // Spread items: ::before at the start, ::after at the end; spaced around them, there's no telling.
    const justify = ownerStyle.justifyContent;
    if (/around|evenly/.test(justify)) return null;
    const items = childBoxes(owner);
    const spread = /between/.test(justify) && items.length > 0;
    const neighbor = spread ? undefined : before ? items[0] : items.at(-1);
    const toEnd = spread && !before;
    const gap = (row ? len(ownerStyle.columnGap) : len(ownerStyle.rowGap)) ?? 0;
    const align = style.alignSelf === "auto" || style.alignSelf === "normal" ? ownerStyle.alignItems : style.alignSelf;
    const cross = (start: number, size: number, own: number, startMargin: number, endMargin: number) =>
      /center/.test(align) ? start + (size - own) / 2 : /end/.test(align) ? start + size - own - endMargin : start + startMargin;
    if (row) {
      const x = neighbor
        ? before
          ? neighbor.left - gap - margin.right - width
          : neighbor.right + gap + margin.left
        : toEnd
          ? content.right - margin.right - width
          : content.left + margin.left;
      return at(x, cross(content.top, content.height, height, margin.top, margin.bottom));
    }
    const y = neighbor
      ? before
        ? neighbor.top - gap - margin.bottom - height
        : neighbor.bottom + gap + margin.top
      : toEnd
        ? content.bottom - margin.bottom - height
        : content.top + margin.top;
    return at(cross(content.left, content.width, width, margin.left, margin.right), y);
  }
  if (style.display === "block" && /^(block|flow-root|list-item)$/.test(ownerStyle.display)) {
    const y = before ? content.top + margin.top : content.bottom - margin.bottom - height;
    return at(content.left + margin.left, y);
  }
  return null;
}

/** A px length, or null (`auto`, anything not in px). */
function len(value: string): number | null {
  const match = /^(-?\d*\.?\d+(?:e-?\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** Padding plus border on one side. */
function edges(style: CSSStyleDeclaration, side: "Top" | "Right" | "Bottom" | "Left"): number {
  return (len(style.getPropertyValue(`padding-${side.toLowerCase()}`)) ?? 0) + (len(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) ?? 0);
}

/** A transform's translation (`matrix(a, b, c, d, x, y)`); its scale and rotation aren't drawn. */
function translation(transform: string): { x: number; y: number } {
  const match = /^matrix\(([^)]+)\)$/.exec(transform);
  const parts = match?.[1]?.split(",").map(Number) ?? [];
  return { x: parts[4] ?? 0, y: parts[5] ?? 0 };
}

/** Where a positioned box's offsets start: its containing block's padding box (viewport px). */
function containingBlock(owner: Element, fixed: boolean): { x: number; y: number } {
  for (let element: Element | null = owner; element && element !== document.documentElement; element = element.parentElement) {
    const style = getComputedStyle(element);
    const transformed = style.transform !== "none" || style.filter !== "none" || style.perspective !== "none" || /paint|layout|strict|content/.test(style.contain);
    if (transformed || (!fixed && style.position !== "static")) {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + element.clientLeft - element.scrollLeft, y: rect.top + element.clientTop - element.scrollTop };
    }
  }
  // None: the viewport for a fixed one, the document's start for an absolute one.
  return fixed ? { x: 0, y: 0 } : { x: -window.scrollX, y: -window.scrollY };
}

/** The owner's content box (viewport px). */
function contentBox(owner: Element, style: CSSStyleDeclaration): DOMRect {
  const rect = owner.getBoundingClientRect();
  const left = rect.left + edges(style, "Left");
  const top = rect.top + edges(style, "Top");
  return new DOMRect(left, top, rect.width - edges(style, "Left") - edges(style, "Right"), rect.height - edges(style, "Top") - edges(style, "Bottom"));
}

/** The owner's children in flow, as boxes with their margins: elements, and text that isn't only spaces. */
function childBoxes(owner: Element): DOMRect[] {
  const boxes: DOMRect[] = [];
  for (const node of Array.from(owner.childNodes)) {
    if (node instanceof Element) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.position === "absolute" || style.position === "fixed") continue;
      const r = node.getBoundingClientRect();
      const m = { top: len(style.marginTop) ?? 0, right: len(style.marginRight) ?? 0, bottom: len(style.marginBottom) ?? 0, left: len(style.marginLeft) ?? 0 };
      boxes.push(new DOMRect(r.left - m.left, r.top - m.top, r.width + m.left + m.right, r.height + m.top + m.bottom));
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      boxes.push(range.getBoundingClientRect());
    }
  }
  return boxes;
}
