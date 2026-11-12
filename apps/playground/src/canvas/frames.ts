import type { ForcedState } from "../frame.ts";

/**
 * What's on the canvas. In a real build this would come from a config file in
 * the project (or be discovered from the router), and be editable on the canvas.
 */
export interface FrameSpec {
  id: string;
  /** Page URL, same origin as the canvas. */
  page: string;
  /** Shown above the frame. */
  name: string;
  /** Viewport width the page is rendered at (its breakpoint). */
  width: number;
  /** A component frame: show only this element, cropped to it. */
  isolate?: string;
  /** With `isolate`: force this pseudo-class state on the element. */
  state?: ForcedState;
  /** Which row of the auto layout the frame goes in. */
  row: number;
}

export const BREAKPOINTS = [
  { name: "Desktop", width: 1280 },
  { name: "Tablet", width: 768 },
  { name: "Mobile", width: 375 },
];

const PAGES = [
  { page: "/index.html", name: "Home" },
  { page: "/pricing.html", name: "Pricing" },
];

const pageFrames: FrameSpec[] = PAGES.flatMap(({ page, name }, row) =>
  BREAKPOINTS.map((bp) => ({ id: `${name}-${bp.width}`, page, name: `${name} · ${bp.name}`, width: bp.width, row })),
);

const BUTTON = ".button--primary";
const componentRow = PAGES.length;
const componentFrames: FrameSpec[] = [
  { id: "button", page: "/index.html", name: "Button", width: 1280, isolate: BUTTON, row: componentRow },
  ...(["hover", "active", "focus-visible"] as const).map((state) => ({
    id: `button-${state}`,
    page: "/index.html",
    name: `:${state}`,
    width: 1280,
    isolate: BUTTON,
    state,
    row: componentRow,
  })),
  { id: "card", page: "/index.html", name: "Card", width: 1280, isolate: ".card", row: componentRow },
  { id: "card-mobile", page: "/index.html", name: "Card · Mobile", width: 375, isolate: ".card", row: componentRow },
];

export const FRAMES: FrameSpec[] = [...pageFrames, ...componentFrames];

/** State connections between component frames, drawn as labeled arrows. */
export const STATE_LINKS: Array<{ from: string; to: string; label: string; below?: boolean }> = [
  { from: "button", to: "button-hover", label: "hover" },
  { from: "button-hover", to: "button-active", label: "press" },
  // Keyboard focus comes from the default state, not from a press: an arc below.
  { from: "button", to: "button-focus-visible", label: "Tab", below: true },
];
