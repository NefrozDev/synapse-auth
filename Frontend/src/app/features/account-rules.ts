/** The API's rules (Backend/src/accounts/identifiers.ts), checked here first. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 80;
/** A password reset token: 32 random bytes in base64url. */
export const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The languages an account can have, each named in itself. */
export const ACCOUNT_LANGUAGES = [
  { code: 'fr', name: 'Français' },
  { code: 'en', name: 'English' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
] as const;
