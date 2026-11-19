import { stepValue } from "../css/values.ts";
import { allTokens } from "../dom/tokens.ts";
import { stepToken, tokenKindsFor } from "../ui/components/TokenMenu/tokens.ts";

/**
 * ↑/↓ or the wheel on a value field: a token with a scale moves along it
 * (`var(--space-3)` → `var(--space-4)`, stepToken); anything else steps its
 * number (stepValue), a token alone or math from `computed`. Null when the
 * value can't be stepped.
 */
export function stepField(property: string, text: string, delta: number, computed: string | undefined): string | null {
  const kinds = tokenKindsFor(property);
  return (kinds.length ? stepToken(text, delta, allTokens(), kinds) : null) ?? stepValue(property, text, delta, computed);
}
