/**
 * The languages an account can have: Plano's six, so its accounts keep theirs.
 * The sign-in pages and e-mails are in French and English for now; the others
 * fall back to English.
 */
export const SUPPORTED_LOCALES = ['fr', 'en', 'nl', 'es', 'de', 'it'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}
