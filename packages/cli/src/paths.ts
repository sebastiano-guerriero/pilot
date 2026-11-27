import { relative, sep } from "node:path";

/**
 * A path as Pilot shows it, in a job's prompt, on the page and in what `init` prints: with forward slashes on every
 * OS, so a prompt reads the same whatever machine it was written on (agents on Windows take them as they are, and
 * Node's own path functions read them back).
 */
export function shownPath(path: string): string {
  return sep === "\\" ? path.replaceAll("\\", "/") : path;
}

/** `to` from `from`, as Pilot shows it (shownPath). */
export function relPath(from: string, to: string): string {
  return shownPath(relative(from, to));
}
