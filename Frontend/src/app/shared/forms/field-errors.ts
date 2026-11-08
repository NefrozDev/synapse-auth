/** The part of a signal forms field state needed to explain it. */
interface ExplainableField {
  touched(): boolean;
  errors(): readonly { message?: string }[];
}

/**
 * The translation key of the first error to show on a field: only once the person has left
 * it or tried to submit, so they are not scolded while typing.
 */
export function visibleError(field: () => ExplainableField): string | null {
  const state = field();
  return state.touched() ? (state.errors()[0]?.message ?? null) : null;
}
