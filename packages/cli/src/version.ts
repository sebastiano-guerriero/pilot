/**
 * This Pilot's version: the `usepilot` package's (version.test.ts checks
 * they match). The MCP server reports it, and `update` and `init` compare
 * a project's installed Pilot with it.
 */
export const VERSION = "0.10.0";

/** Whether version `a` is older than `b` (x.y.z, prerelease tags ignored). */
export function olderThan(a: string, b: string): boolean {
  const parts = (v: string) =>
    v
      .replace(/^[^\d]*/, "")
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}
