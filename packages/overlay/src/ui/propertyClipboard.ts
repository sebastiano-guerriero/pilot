import { longhandsOf } from "../edits/history.ts";

/**
 * Copy and paste of a row's properties (the dialog's menu on a property's
 * name): what Copy properties took, for Paste properties on another element.
 * Pilot's own, for the page load (not the system clipboard: Copy CSS puts
 * text there), plain data.
 */
export type CopiedProperties = ReadonlyArray<readonly [property: string, value: string]>;

let copied: CopiedProperties | null = null;

export function copiedProperties(): CopiedProperties | null {
  return copied;
}

export function copyProperties(entries: CopiedProperties): void {
  copied = entries.length ? entries : null;
}

/**
 * A row's values to copy: the ones set, a shorthand in place of its
 * longhands when it's set itself (`padding: 10px 18px`, not four lines).
 */
export function rowEntries(properties: readonly string[], values: Readonly<Record<string, string>>): CopiedProperties {
  const set = properties.filter((p) => values[p]);
  const covered = new Set(set.flatMap((p) => longhandsOf(p).filter((l) => l !== p)));
  return set.filter((p) => !covered.has(p)).map((p) => [p, values[p] as string] as const);
}

/** The entries as CSS: one declaration a line. */
export function cssText(entries: CopiedProperties): string {
  return entries.map(([p, v]) => `${p}: ${v};`).join("\n");
}
