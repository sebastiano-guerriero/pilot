/**
 * Where the designer dragged the toolbar: its center across and its top, in
 * viewport px. Null: where it starts, centered 24px above the bottom edge
 * (Toolbar.css). Kept in the tab's sessionStorage, so it stays put through
 * reloads (an agent's edits trigger plenty).
 */
export interface ToolbarSpot {
  x: number;
  y: number;
}

/** The toolbar's height, and how close it may get to the window's edges, in px. */
export const TOOLBAR_HEIGHT = 48;
const EDGE = 8;
const STORAGE_KEY = "pilot:toolbar";

/** A spot that keeps a toolbar `width` wide on screen, 8px from every edge. */
export function clampSpot(spot: ToolbarSpot, width: number, viewport: { width: number; height: number }): ToolbarSpot {
  const half = width / 2;
  return {
    x: Math.round(Math.max(EDGE + half, Math.min(spot.x, viewport.width - EDGE - half))),
    y: Math.round(Math.max(EDGE, Math.min(spot.y, viewport.height - EDGE - TOOLBAR_HEIGHT))),
  };
}

export function loadSpot(): ToolbarSpot | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as ToolbarSpot | null;
    return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : null;
  } catch {
    return null;
  }
}

export function saveSpot(spot: ToolbarSpot | null): void {
  try {
    if (spot) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(spot));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not saved: it still moves, for this page load.
  }
}
