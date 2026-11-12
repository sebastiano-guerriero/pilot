import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FrameBridge, Rect, WindowWithBridge } from "../frame.ts";
import "./canvas.css";
import { FRAMES, type FrameSpec, STATE_LINKS } from "./frames.ts";

/**
 * Canvas prototype: every page of the app is a live frame (an iframe) on a
 * pan/zoom surface, at several breakpoints, next to isolated components and
 * their forced states. Double-click a frame to edit it with Pilot. Edits are
 * mirrored to every other frame of the same page, so one change shows at all
 * breakpoints. Links between pages and state changes are drawn as arrows.
 */

interface FrameInfo {
  /** The page's content height: page frames grow to fit it. */
  height: number;
  /** Component frames: the part of the page that's shown (the element, padded). */
  crop?: Rect;
  /** Component frames: the page background the element was on. */
  background?: string;
  /** Page frames: the links on the page, for the flow arrows. */
  links: Array<{ href: string; rect: Rect }>;
}

interface Point {
  x: number;
  y: number;
}

const px = (n: number) => `${n}px`;
const GAP = 120;
const ROW_GAP = 240;
/** Space around an isolated component. */
const PAD = 32;
/** While a component frame is edited it grows, so Pilot's dialog fits next to the element. */
const EDIT_ROOM = { right: 300, bottom: 420 };
const FALLBACK_HEIGHT = 800;
const byId = new Map(FRAMES.map((f) => [f.id, f]));

const STORAGE = "pilot-canvas:layout";
function readStored(): Record<string, Point> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? "{}") as Record<string, Point>;
  } catch {
    return {};
  }
}
function store(positions: Record<string, Point>): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(positions));
  } catch {
    // Not kept across reloads.
  }
}

function frameSize(spec: FrameSpec, info: FrameInfo | undefined, editing: boolean) {
  if (!spec.isolate) return { width: spec.width, height: info?.height ?? FALLBACK_HEIGHT };
  const crop = info?.crop;
  if (!crop) return { width: 160, height: 80 };
  if (!editing) return { width: crop.width, height: crop.height };
  return {
    width: Math.min(crop.width + EDIT_ROOM.right, spec.width - crop.x),
    height: Math.min(Math.max(crop.height, EDIT_ROOM.bottom), (info?.height ?? FALLBACK_HEIGHT) - crop.y),
  };
}

/** Rows left to right, each row below the tallest frame of the previous one. */
function autoLayout(info: Record<string, FrameInfo>): Record<string, Point> {
  const positions: Record<string, Point> = {};
  const rows = [...new Set(FRAMES.map((f) => f.row))].sort((a, b) => a - b);
  let y = 0;
  for (const row of rows) {
    let x = 0;
    let tallest = 0;
    for (const spec of FRAMES.filter((f) => f.row === row)) {
      const size = frameSize(spec, info[spec.id], false);
      positions[spec.id] = { x, y };
      x += size.width + (spec.isolate ? GAP * 1.5 : GAP);
      tallest = Math.max(tallest, size.height);
    }
    y += tallest + ROW_GAP;
  }
  return positions;
}

function Canvas() {
  const [camera, setCamera] = useState({ x: 80, y: 80, zoom: 0.25 });
  const [info, setInfo] = useState<Record<string, FrameInfo>>({});
  const [moved, setMoved] = useState<Record<string, Point>>(readStored);
  const [active, setActive] = useState<string | null>(null);
  const [showFlows, setShowFlows] = useState(true);
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const bridges = useRef(new Map<string, FrameBridge>());
  const cleanups = useRef(new Map<string, () => void>());
  const stopMirroring = useRef<(() => void) | null>(null);
  const fitted = useRef(false);

  const auto = autoLayout(info);
  const positionOf = (id: string): Point => moved[id] ?? auto[id] ?? { x: 0, y: 0 };
  const boxOf = (spec: FrameSpec) => ({ ...positionOf(spec.id), ...frameSize(spec, info[spec.id], spec.id === active) });

  // A frame's page loaded: isolate/force what it shows, then follow its size.
  const register = (spec: FrameSpec, bridge: FrameBridge) => {
    cleanups.current.get(spec.id)?.();
    bridges.current.set(spec.id, bridge);
    let background: string | undefined;
    if (spec.isolate) {
      if (spec.state) bridge.force(spec.isolate, spec.state);
      background = bridge.isolate(spec.isolate)?.background;
    }
    const stop = bridge.onSize(({ height }) => {
      const rect = spec.isolate ? bridge.isolatedRect() : null;
      const crop = rect && {
        x: Math.max(0, rect.x - PAD),
        y: Math.max(0, rect.y - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      };
      setInfo((prev) => ({
        ...prev,
        [spec.id]: { height, crop: crop ?? undefined, background, links: spec.isolate ? [] : bridge.links() },
      }));
    });
    cleanups.current.set(spec.id, stop);
  };

  const leave = () => {
    stopMirroring.current?.();
    stopMirroring.current = null;
    setActive((current) => {
      if (current) bridges.current.get(current)?.exit();
      return null;
    });
  };

  // Enter a frame: Pilot runs in it, and its edits are mirrored to the other
  // frames of the same page (other breakpoints, isolated components).
  const enter = (spec: FrameSpec) => {
    if (active === spec.id) return;
    leave();
    const bridge = bridges.current.get(spec.id);
    if (!bridge) return;
    bridge.enter();
    stopMirroring.current = bridge.onStyleChange((path, style) => {
      for (const other of FRAMES) {
        if (other.id !== spec.id && other.page === spec.page) bridges.current.get(other.id)?.applyStyle(path, style);
      }
    });
    setActive(spec.id);
  };

  const fit = () => {
    const el = viewport.current;
    if (!el) return;
    const boxes = FRAMES.map(boxOf);
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const margin = 64;
    const zoom = Math.min((el.clientWidth - margin * 2) / (maxX - minX), (el.clientHeight - margin * 2) / (maxY - minY), 1);
    setCamera({
      zoom,
      x: (el.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (el.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom,
    });
  };

  // Fit everything once all the frames have measured themselves.
  useEffect(() => {
    if (!fitted.current && FRAMES.every((f) => info[f.id])) {
      fitted.current = true;
      fit();
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "!" || (e.shiftKey && e.code === "Digit1")) fit();
      else if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const zoomAt = (cx: number, cy: number, factor: number) =>
    setCamera((c) => {
      const zoom = Math.min(4, Math.max(0.05, c.zoom * factor));
      const wx = (cx - c.x) / c.zoom;
      const wy = (cy - c.y) / c.zoom;
      return { zoom, x: cx - wx * zoom, y: cy - wy * zoom };
    });

  // Scroll pans; pinch (ctrlKey) or Cmd/Ctrl+scroll zooms around the pointer.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else setCamera((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
  };

  // Drag on the background pans; a click on it leaves the frame being edited.
  // `move` gets the total pointer movement in screen pixels.
  const drag = (e: PointerEvent, move: (dx: number, dy: number) => void, click?: () => void) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let travelled = false;
    setDragging(true);
    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - start.x;
      const dy = m.clientY - start.y;
      if (Math.hypot(dx, dy) > 3) travelled = true;
      if (travelled) move(dx, dy);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      if (!travelled) click?.();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const panStart = (e: PointerEvent) => {
    const from = camera;
    drag(e, (dx, dy) => setCamera({ ...from, x: from.x + dx, y: from.y + dy }), leave);
  };

  const moveFrame = (e: PointerEvent, spec: FrameSpec) => {
    e.stopPropagation();
    const from = positionOf(spec.id);
    const zoom = camera.zoom;
    drag(e, (dx, dy) =>
      setMoved((prev) => {
        const next = { ...prev, [spec.id]: { x: from.x + dx / zoom, y: from.y + dy / zoom } };
        store(next);
        return next;
      }),
    );
  };

  const resetLayout = () => {
    setMoved({});
    store({});
  };

  const activeSpec = active ? byId.get(active) : undefined;

  return (
    <div
      ref={viewport}
      class="viewport"
      data-dragging={dragging || undefined}
      onWheel={onWheel}
      onPointerDown={panStart}
    >
      <div
        class="world"
        style={{
          transform: `translate(${px(camera.x)}, ${px(camera.y)}) scale(${camera.zoom})`,
          "--zoom": String(camera.zoom),
        }}
      >
        {FRAMES.map((spec) => (
          <Frame
            key={spec.id}
            spec={spec}
            box={boxOf(spec)}
            info={info[spec.id]}
            active={spec.id === active}
            onLoad={(bridge) => register(spec, bridge)}
            onEnter={() => enter(spec)}
            onTitleDown={(e) => moveFrame(e, spec)}
          />
        ))}
        <Connections boxOf={boxOf} info={info} zoom={camera.zoom} showFlows={showFlows} />
      </div>

      <div class="hint">
        {activeSpec ? (
          <>
            Editing <b>{activeSpec.name}</b> with Pilot. Edits show in every frame of this page. Click the canvas
            or press Esc to leave.
          </>
        ) : (
          <>Double-click a frame to edit it with Pilot · Scroll to pan · Pinch or ⌘/Ctrl+scroll to zoom · Drag a title to move a frame</>
        )}
      </div>

      <div class="hud" onPointerDown={(e) => e.stopPropagation()}>
        <span class="zoom">{Math.round(camera.zoom * 100)}%</span>
        <button type="button" onClick={fit}>
          Fit <kbd>⇧1</kbd>
        </button>
        <button type="button" aria-pressed={showFlows} onClick={() => setShowFlows((s) => !s)}>
          Flows
        </button>
        <button type="button" onClick={resetLayout} disabled={Object.keys(moved).length === 0}>
          Reset layout
        </button>
      </div>
    </div>
  );
}

interface FrameProps {
  spec: FrameSpec;
  box: Rect;
  info: FrameInfo | undefined;
  active: boolean;
  onLoad(bridge: FrameBridge): void;
  onEnter(): void;
  onTitleDown(e: PointerEvent): void;
}

function Frame({ spec, box, info, active, onLoad, onEnter, onTitleDown }: FrameProps) {
  const crop = info?.crop;
  return (
    <div
      class="frame"
      data-active={active || undefined}
      data-component={spec.isolate ? "" : undefined}
      style={{ left: px(box.x), top: px(box.y), width: px(box.width), height: px(box.height) }}
    >
      <div class="frame-title" onPointerDown={onTitleDown} onDblClick={onEnter}>
        <span class="frame-name" title={spec.isolate}>
          {spec.name}
        </span>
        {!spec.isolate && <span class="frame-meta">{spec.width}</span>}
      </div>
      <div class="frame-body" style={{ background: info?.background }}>
        <iframe
          title={spec.name}
          src={`${spec.page}?frame=${spec.id}`}
          style={{
            width: px(spec.width),
            height: px(info?.height ?? FALLBACK_HEIGHT),
            left: px(-(crop?.x ?? 0)),
            top: px(-(crop?.y ?? 0)),
          }}
          onLoad={(e) => {
            const bridge = ((e.currentTarget as HTMLIFrameElement).contentWindow as WindowWithBridge | null)
              ?.__pilotFrame;
            if (bridge) onLoad(bridge);
          }}
        />
        {/* Frames are pictures on the canvas until entered: the shield takes the pointer. */}
        {!active && (
          <div
            class="shield"
            onDblClick={onEnter}
            onPointerDown={(e) => {
              // Let a drag on a frame pan the canvas, like the background.
              if (e.detail > 1) e.stopPropagation();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface ConnectionsProps {
  boxOf(spec: FrameSpec): Rect;
  info: Record<string, FrameInfo>;
  zoom: number;
  showFlows: boolean;
}

/** Arrows: page links (flows) and state changes between component frames. */
function Connections({ boxOf, info, zoom, showFlows }: ConnectionsProps) {
  const head = 8 / zoom;
  const arrowhead = (x: number, y: number, dir: "down" | "up" | "right") => {
    const pts =
      dir === "right"
        ? [`${x},${y}`, `${x - head},${y - head / 2}`, `${x - head},${y + head / 2}`]
        : dir === "down"
          ? [`${x},${y}`, `${x - head / 2},${y - head}`, `${x + head / 2},${y - head}`]
          : [`${x},${y}`, `${x - head / 2},${y + head}`, `${x + head / 2},${y + head}`];
    return <polygon points={pts.join(" ")} />;
  };

  const flows = showFlows
    ? FRAMES.filter((f) => !f.isolate).flatMap((from) =>
        (info[from.id]?.links ?? []).flatMap((link, i) => {
          const page = new URL(link.href).pathname;
          const to = FRAMES.find((t) => !t.isolate && t.page === page && t.page !== from.page && t.width === from.width);
          if (!to) return [];
          const a = boxOf(from);
          const b = boxOf(to);
          const sx = a.x + link.rect.x + link.rect.width;
          const sy = a.y + link.rect.y + link.rect.height / 2;
          const down = b.y > sy;
          const ex = b.x + Math.min(120, b.width / 2);
          const ey = down ? b.y : b.y + b.height;
          const bend = Math.max(160, Math.abs(ey - sy) / 2);
          return [
            <g key={`${from.id}-${i}`} class="flow">
              <rect
                x={a.x + link.rect.x}
                y={a.y + link.rect.y}
                width={link.rect.width}
                height={link.rect.height}
                rx={6}
              />
              <path d={`M${sx} ${sy} C${sx + bend} ${sy}, ${ex} ${down ? ey - bend : ey + bend}, ${ex} ${ey}`} />
              {arrowhead(ex, ey, down ? "down" : "up")}
            </g>,
          ];
        }),
      )
    : [];

  const states = STATE_LINKS.flatMap(({ from, to, label, below }) => {
    const fromSpec = byId.get(from);
    const toSpec = byId.get(to);
    if (!fromSpec || !toSpec) return [];
    const a = boxOf(fromSpec);
    const b = boxOf(toSpec);
    const text = (x: number, y: number) => (
      <text x={x} y={y} style={{ fontSize: px(11 / zoom) }}>
        {label}
      </text>
    );
    if (below) {
      // Bottom of one frame to the bottom of the other, arcing under the frames between.
      const sx = a.x + a.width / 2;
      const sy = a.y + a.height;
      const ex = b.x + b.width / 2;
      const ey = b.y + b.height;
      const low = Math.max(sy, ey) + 48 / zoom;
      return [
        <g key={`${from}-${to}`} class="state">
          <path d={`M${sx} ${sy} C${sx} ${low}, ${ex} ${low}, ${ex} ${ey}`} />
          {arrowhead(ex, ey, "up")}
          {text((sx + ex) / 2, low - 20 / zoom)}
        </g>,
      ];
    }
    const sx = a.x + a.width;
    const sy = a.y + a.height / 2;
    const ex = b.x;
    const ey = b.y + b.height / 2;
    return [
      <g key={`${from}-${to}`} class="state">
        <path d={`M${sx} ${sy} C${(sx + ex) / 2} ${sy}, ${(sx + ex) / 2} ${ey}, ${ex} ${ey}`} />
        {arrowhead(ex, ey, "right")}
        {text((sx + ex) / 2, (sy + ey) / 2 + 16 / zoom)}
      </g>,
    ];
  });

  return (
    <svg class="connections" width="1" height="1">
      {flows}
      {states}
    </svg>
  );
}

const root = document.getElementById("canvas");
if (root) render(<Canvas />, root);
