import { QueryFailedError } from 'typeorm';

/** Plano's rules, so every Plano username stays valid here. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
export const USERNAME_FORMAT_MESSAGE =
  'username must contain 3 to 30 letters, numbers, dots, underscores, or hyphens';
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Usernames and e-mails are unique case-insensitively: compare this form. */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

/** A concurrent write slipped past the duplicate check and hit a unique index. */
export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  return /unique constraint/i.test(String(error.driverError));
}
