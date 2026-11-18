import { describe, expect, it } from "vitest";
import { flight, pieces } from "./Confetti.tsx";

/** A repeatable stand-in for Math.random. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("Confetti", () => {
  it("throws every piece up from somewhere along the button", () => {
    const burst = pieces(100, seeded());
    expect(burst.length).toBeGreaterThan(10);
    for (const piece of burst) {
      expect(piece.vy).toBeLessThan(0);
      expect(piece.x).toBeGreaterThanOrEqual(0);
      expect(piece.x).toBeLessThanOrEqual(100);
    }
  });

  it("each piece rises, then falls back past where it started", () => {
    const [piece] = pieces(100, seeded(7));
    const start = flight(piece!, 0);
    expect(Math.abs(start.x) + Math.abs(start.y)).toBe(0);
    expect(flight(piece!, 0.15).y).toBeLessThan(0);
    expect(flight(piece!, 1).y).toBeGreaterThan(0);
  });
});
