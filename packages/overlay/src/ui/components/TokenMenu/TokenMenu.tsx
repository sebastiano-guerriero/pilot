import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Token } from "../../../dom/tokens.ts";
import { scrollWithin } from "../../../dom/reveal.ts";
import { px } from "../../px.ts";
import { ScrollThumb } from "../ScrollThumb/ScrollThumb.tsx";

interface TokenMenuProps {
  /** The tokens to offer, in order (see matchTokens). */
  tokens: Token[];
  /** Whether the page has any for this field: no match then says so differently. */
  any: boolean;
  /** The highlighted row. */
  active: number;
  /** The field's box (viewport px): the list opens under it, or over it with no room below. */
  anchor: DOMRect;
  onActive(index: number): void;
  onPick(token: Token): void;
}

/** Space between the field and the list, and the closest the list gets to the window's edges. */
const GAP = 4;
const EDGE = 8;
/** The list's padding: it sits this much left of the field, so its rows line up with the field's edges. */
const PADDING = 4;

/**
 * A field's variables: the page's tokens that fit it, under the field, for
 * `--` typed in it or its variable button (see PropertyInputText). A row a
 * token: a color's swatch, its name, its value dimmed. The select's menu
 * look (PropertySelect); placeholder, pending the design. Picking never
 * takes focus from the field.
 */
export function TokenMenu({ tokens, any, active, anchor, onActive, onPick }: TokenMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    if (h !== height) setHeight(h);
  });
  useEffect(() => {
    scrollWithin(listRef.current, listRef.current?.querySelector(`[data-index="${active}"]`));
  }, [active]);
  const below = anchor.bottom + GAP + height <= window.innerHeight - EDGE;
  const top = below ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - GAP - height);
  const left = Math.min(anchor.left - PADDING, window.innerWidth - EDGE - (ref.current?.offsetWidth ?? 0));
  return (
    // The list's box (placed, not scrolling), the rows that scroll inside it, and Pilot's scroll thumb over its edge.
    <div
      ref={ref}
      class="token-menu"
      style={{ top: px(top), left: px(Math.max(EDGE, left)), minWidth: px(anchor.width + 2 * PADDING) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div ref={listRef} class="token-list" role="listbox" aria-label="Variables">
        {tokens.length ? (
          tokens.map((token, index) => (
            <div
              key={token.name}
              class="token-option"
              role="option"
              aria-selected={index === active}
              data-index={index}
              data-active={index === active || undefined}
              onPointerMove={() => onActive(index)}
              onClick={() => onPick(token)}
            >
              {token.kind === "color" && <span class="token-swatch color-preview" style={{ "--_color": token.value }} aria-hidden="true" />}
              {/* A file's token by its own name, its file on hover. */}
            <span class="token-name" title={token.source ? `${token.source.file}${token.source.line ? `:${token.source.line}` : ""}` : undefined}>
              {token.source?.name ?? token.name}
            </span>
              <span class="token-value">{token.value}</span>
            </div>
          ))
        ) : (
          <div class="token-none">{any ? "No variable matches" : "No variables for this on the page"}</div>
        )}
      </div>
      <ScrollThumb target={listRef} />
    </div>
  );
}
